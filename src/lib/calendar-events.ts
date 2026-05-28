import {
  computeShiftDisplayStatus,
  subscriptionToDisplayStatus,
} from "@/domain/rules/scheduling";
import type {
  DisplayStatus,
  ShiftStatus,
  SubscriptionStatus,
} from "@/domain/types";
import { AVAILABILITY_HEX, STATUS_HEX } from "./status-colors";

export interface CalendarFilters {
  /** When set, only shifts whose `roleLabel` matches (case-insensitive) are shown. */
  role?: string;
  /** When set, only events whose status is one of the listed values are shown. */
  statuses?: ReadonlyArray<DisplayStatus | "Available">;
  /**
   * Owner-only: when set, only shifts that have an assignment for the given
   * userId are shown.
   */
  workerId?: string;
}

/**
 * Domain-shaped shift returned by `ShiftService.listForCalendar`. Kept here as
 * a structural type so this module stays free of Prisma imports and is unit
 * testable from pure data.
 */
export interface CalendarShift {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  roleLabel: string;
  status: ShiftStatus;
  requiredSpots: number;
  notes?: string | null;
  publishedAt?: Date | string | null;
  isDraft?: boolean;
  requiredSkill?: { id: string; name: string; color: string } | null;
  _count?: { subscriptions?: number; assignments?: number };
  subscriptions?: Array<{ id: string; status: SubscriptionStatus }>;
  assignments?: Array<{ userId: string }>;
}

export interface CalendarAvailability {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  /** Optional - owner-facing variants carry the worker's identity */
  user?: { id: string; name: string };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    kind: "shift" | "availability";
    status: DisplayStatus | "Available";
    shiftId?: string;
    availabilityId?: string;
    subscriptionId?: string;
    subscriptionStatus?: SubscriptionStatus;
    requiredSpots?: number;
    approvedCount?: number;
    pendingCount?: number;
    roleLabel?: string;
    startsAt?: string;
    endsAt?: string;
    notes?: string | null;
    workerName?: string;
    workerId?: string;
    isDraft?: boolean;
    requiredSkillId?: string;
    requiredSkillName?: string;
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Computes the visible status of a shift event from the perspective of the
 * given viewer. Workers see their own subscription status when present;
 * owners always see the staffing-level rollup.
 */
export type CalendarViewer = "OWNER" | "WORKER" | "MANAGER";

export function resolveShiftDisplayStatus(
  shift: CalendarShift,
  viewer: CalendarViewer,
): DisplayStatus {
  const isOwnerView = viewer === "OWNER" || viewer === "MANAGER";
  if (!isOwnerView && shift.subscriptions && shift.subscriptions.length > 0) {
    const sub = shift.subscriptions[0];
    if (sub) {
      return subscriptionToDisplayStatus(sub.status);
    }
  }
  return computeShiftDisplayStatus({
    shiftStatus: shift.status,
    approvedCount: shift._count?.assignments ?? 0,
    requiredSpots: shift.requiredSpots,
    pendingCount: shift._count?.subscriptions ?? 0,
  });
}

export function shiftToCalendarEvent(
  shift: CalendarShift,
  viewer: CalendarViewer,
): CalendarEvent {
  const status = resolveShiftDisplayStatus(shift, viewer);
  const palette = STATUS_HEX[status];
  const subscription = shift.subscriptions?.[0];
  const approvedCount = shift._count?.assignments ?? 0;
  const isOwnerView = viewer === "OWNER" || viewer === "MANAGER";

  const isDraft = shift.isDraft ?? shift.publishedAt === null;
  const draftPrefix = isOwnerView && isDraft ? "● " : "";
  const title = isOwnerView
    ? `${draftPrefix}${shift.roleLabel} (${approvedCount}/${shift.requiredSpots})`
    : shift.roleLabel;

  return {
    id: `shift:${shift.id}`,
    title,
    start: toIso(shift.startsAt),
    end: toIso(shift.endsAt),
    backgroundColor: palette.bg,
    borderColor: palette.border,
    textColor: palette.text,
    extendedProps: {
      kind: "shift",
      status,
      shiftId: shift.id,
      subscriptionId: subscription?.id,
      subscriptionStatus: subscription?.status,
      requiredSpots: shift.requiredSpots,
      approvedCount,
      pendingCount: shift._count?.subscriptions ?? 0,
      roleLabel: shift.roleLabel,
      notes: shift.notes ?? null,
      isDraft,
      requiredSkillId: shift.requiredSkill?.id,
      requiredSkillName: shift.requiredSkill?.name,
    },
  };
}

export function availabilityToCalendarEvent(
  availability: CalendarAvailability,
  label: string,
): CalendarEvent {
  const start = toIso(availability.startsAt);
  const end = toIso(availability.endsAt);
  const title = availability.user ? `${availability.user.name}` : label;
  return {
    id: `availability:${availability.id}`,
    title,
    start,
    end,
    backgroundColor: AVAILABILITY_HEX.bg,
    borderColor: AVAILABILITY_HEX.border,
    textColor: AVAILABILITY_HEX.text,
    extendedProps: {
      kind: "availability",
      status: "Available",
      availabilityId: availability.id,
      startsAt: start,
      endsAt: end,
      workerId: availability.user?.id,
      workerName: availability.user?.name,
    },
  };
}

/**
 * Applies the supplied filter set to a list of calendar events. Kept as a pure
 * function so the page can filter client-side as the user toggles the UI.
 */
export function filterCalendarEvents(
  events: CalendarEvent[],
  filters: CalendarFilters | undefined,
  shiftAssignments?: Map<string, ReadonlyArray<string>>,
): CalendarEvent[] {
  if (!filters) return events;
  const role = filters.role?.trim().toLowerCase();
  const statuses = filters.statuses && new Set(filters.statuses);
  return events.filter((event) => {
    if (
      role &&
      event.extendedProps.kind === "shift" &&
      (event.extendedProps.roleLabel ?? "").toLowerCase() !== role
    ) {
      return false;
    }
    if (statuses && !statuses.has(event.extendedProps.status)) {
      return false;
    }
    if (
      filters.workerId &&
      event.extendedProps.kind === "shift" &&
      event.extendedProps.shiftId
    ) {
      const assigned = shiftAssignments?.get(event.extendedProps.shiftId);
      if (!assigned || !assigned.includes(filters.workerId)) return false;
    }
    return true;
  });
}

export function buildCalendarEvents(input: {
  shifts: CalendarShift[];
  availabilities?: CalendarAvailability[];
  viewer: CalendarViewer;
  availabilityLabel?: string;
}): CalendarEvent[] {
  const shiftEvents = input.shifts.map((s) =>
    shiftToCalendarEvent(s, input.viewer),
  );
  const availabilityEvents = (input.availabilities ?? []).map((a) =>
    availabilityToCalendarEvent(a, input.availabilityLabel ?? "Available"),
  );
  return [...shiftEvents, ...availabilityEvents];
}

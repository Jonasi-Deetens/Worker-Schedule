import type { DisplayStatus } from "@/domain/types";
import type { AvailabilityItem } from "@/interface/components/availability-detail-dialog";
import type { CalendarEvent } from "@/lib/calendar-events";

export interface SelectedShift {
  shiftId: string;
  roleLabel: string;
  startsAt: Date;
  endsAt: Date;
  displayStatus: DisplayStatus;
  requiredSpots: number;
  approvedCount?: number;
  subscriptionId?: string;
  subscriptionStatus?: string;
  notes?: string | null;
  requiredSkillId?: string | null;
  locationId?: string | null;
  isDraft?: boolean;
}

export function combineDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function eventToSelectedShift(event: CalendarEvent): SelectedShift | null {
  const props = event.extendedProps;
  if (props.kind !== "shift" || !props.shiftId) return null;
  return {
    shiftId: props.shiftId,
    roleLabel: props.roleLabel ?? event.title,
    startsAt: new Date(event.start),
    endsAt: new Date(event.end),
    displayStatus: (props.status as DisplayStatus) ?? "Open",
    requiredSpots: props.requiredSpots ?? 1,
    approvedCount: props.approvedCount,
    subscriptionId: props.subscriptionId,
    subscriptionStatus: props.subscriptionStatus,
    notes: props.notes ?? null,
    requiredSkillId: props.requiredSkillId ?? null,
    locationId: props.locationId ?? null,
    isDraft: props.isDraft ?? false,
  };
}

export function eventToSelectedAvailability(
  event: CalendarEvent,
): AvailabilityItem | null {
  const props = event.extendedProps;
  if (props.kind !== "availability" || !props.availabilityId) return null;
  return {
    id: props.availabilityId,
    startsAt: new Date(event.start),
    endsAt: new Date(event.end),
  };
}

"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBusinessEvents } from "@/interface/hooks/use-business-events";
import { useTranslations } from "next-intl";
import { addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { Plus } from "lucide-react";
import type { UserRole } from "@/domain/types";
import { AppHeader } from "@/interface/components/app-header";
import type { AvailabilityItem } from "@/interface/components/availability-detail-dialog";
import { Button } from "@/interface/components/ui/button";
import type {
  AvailabilityFormInitial,
  ShiftFormInitial,
} from "@/interface/components/shift-form-dialog";
import {
  WorkCalendar,
  type CalendarRangeChange,
  type CalendarTimeFormat,
  type EventReschedule,
} from "@/interface/components/work-calendar";
import { trpc } from "@/interface/trpc/client";
import {
  buildCalendarEvents,
  filterCalendarEvents,
  type CalendarEvent,
  type CalendarFilters,
  type CalendarShift,
} from "@/lib/calendar-events";
import { BulkRescheduleDialog } from "./components/bulk-reschedule-dialog";
import { CalendarDialogs } from "./components/calendar-dialogs";
import { FilterBar } from "./components/filter-bar";
import { KpiStrip } from "./components/kpi-strip";
import { OwnerToolbar } from "./components/owner-toolbar";
import {
  RescheduleConflictDialog,
  type RescheduleConflict,
} from "./components/reschedule-conflict-dialog";
import { StatusLegend } from "./components/status-dot";
import { TimeFormatToggle } from "./components/time-format-toggle";
import { useCalendarMutations } from "./hooks/use-calendar-mutations";
import {
  combineDateTime,
  eventToSelectedAvailability,
  eventToSelectedShift,
  toDateInput,
  toTimeInput,
  type SelectedShift,
} from "./lib/helpers";

export function CalendarPageClient({
  role,
}: {
  role: UserRole;
  userName: string;
}) {
  const { data: session } = useSession();
  const t = useTranslations();
  const isOwner = role === "OWNER" || role === "MANAGER";

  const [range, setRange] = useState(() => ({
    from: addMonths(startOfMonth(new Date()), -1),
    to: addMonths(endOfMonth(new Date()), 1),
  }));

  const [selectedShift, setSelectedShift] = useState<SelectedShift | null>(null);
  const [selectedAvailability, setSelectedAvailability] =
    useState<AvailabilityItem | null>(null);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftDialogMode, setShiftDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [shiftDialogInitial, setShiftDialogInitial] =
    useState<ShiftFormInitial | undefined>(undefined);
  const [availDialogOpen, setAvailDialogOpen] = useState(false);
  const [availDialogInitial, setAvailDialogInitial] =
    useState<AvailabilityFormInitial | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [availDetailOpen, setAvailDetailOpen] = useState(false);
  const [cancelShiftOpen, setCancelShiftOpen] = useState(false);
  const [offerSwapOpen, setOfferSwapOpen] = useState(false);
  const [removeAvailabilityOpen, setRemoveAvailabilityOpen] = useState(false);
  const [filters, setFilters] = useState<CalendarFilters>({});
  const [showAvailabilityOverlay, setShowAvailabilityOverlay] = useState(false);

  // Pending drag-reschedule awaiting owner confirmation because it conflicts
  // with assigned workers' other shifts. Holds the FullCalendar `revert` so we
  // can roll the drag back if the owner cancels.
  const [reschedulePrompt, setReschedulePrompt] = useState<{
    shiftId: string;
    newStart: Date;
    newEnd: Date;
    revert: () => void;
    conflicts: ReadonlyArray<RescheduleConflict>;
  } | null>(null);

  // Bulk-select mode: pick multiple shifts on the calendar and move them all
  // by one offset via `shift.bulkReschedule`.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkRescheduleOpen, setBulkRescheduleOpen] = useState(false);

  // Persist 12h/24h preference per browser. We default to 24h because Belgian
  // horeca norms (and the previous hardcoded format) use it; once a user
  // flips the toggle, their choice is remembered across refreshes.
  const [timeFormat, setTimeFormat] = useState<CalendarTimeFormat>("24h");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("tg.calendar.timeFormat");
    if (stored === "12h" || stored === "24h") setTimeFormat(stored);
  }, []);
  const handleTimeFormatChange = useCallback((next: CalendarTimeFormat) => {
    setTimeFormat(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tg.calendar.timeFormat", next);
    }
  }, []);

  const handleRangeChange = useCallback((change: CalendarRangeChange) => {
    setRange({
      from: addMonths(change.start, 0),
      to: addMonths(change.end, 0),
    });
  }, []);

  const utils = trpc.useUtils();
  useBusinessEvents(
    useCallback((event) => {
      if (event === "shift.updated" || event === "assignment.changed") {
        utils.shift.list.invalidate();
        utils.shift.kpis.invalidate();
        utils.shift.pendingReconfirmations.invalidate();
      } else if (event === "subscription.changed") {
        utils.shift.list.invalidate();
        utils.subscription.listForShift.invalidate();
      }
    }, [utils]),
  );

  // Background poll keeps the calendar in sync with concurrent changes from
  // other users without requiring a full SSE/websocket layer.
  const REFETCH_INTERVAL_MS = 30_000;
  const shiftsQuery = trpc.shift.list.useQuery(range, {
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const availQuery = trpc.availability.list.useQuery(range, {
    enabled: !isOwner,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const ownerAvailQuery = trpc.availability.listForBusiness.useQuery(range, {
    enabled: isOwner && showAvailabilityOverlay,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const kpisQuery = trpc.shift.kpis.useQuery(range, {
    enabled: isOwner,
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const subscriptionsQuery = trpc.subscription.listForShift.useQuery(
    { shiftId: selectedShift?.shiftId ?? "" },
    { enabled: isOwner && !!selectedShift?.shiftId && detailOpen },
  );
  const assignmentsQuery = trpc.shift.assignments.useQuery(
    { shiftId: selectedShift?.shiftId ?? "" },
    { enabled: isOwner && !!selectedShift?.shiftId && detailOpen },
  );

  const businessQuery = trpc.business.get.useQuery(undefined, {
    enabled: isOwner,
  });

  // Workers: shifts whose assignment is awaiting reschedule reconfirmation.
  const reconfirmQuery = trpc.shift.pendingReconfirmations.useQuery(undefined, {
    enabled: !isOwner,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const reconfirmShiftIds = useMemo(
    () => new Set((reconfirmQuery.data ?? []).map((s) => s.id)),
    [reconfirmQuery.data],
  );

  // Workers: open-shift broadcasts the current worker may still claim. Used to
  // surface an "Accept this open shift" action inside the shift detail dialog.
  const openBroadcastsQuery = trpc.shift.openBroadcasts.useQuery(undefined, {
    enabled: !isOwner,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const broadcastShiftIds = useMemo(
    () => new Set((openBroadcastsQuery.data ?? []).map((s) => s.id)),
    [openBroadcastsQuery.data],
  );

  const m = useCalendarMutations({
    closeShiftDialog: () => {
      setShiftDialogOpen(false);
      setShiftDialogInitial(undefined);
      setShiftDialogMode("create");
    },
    closeAvailabilityDialog: () => {
      setAvailDialogOpen(false);
      setAvailDialogInitial(undefined);
    },
    closeDetail: () => setDetailOpen(false),
    closeAvailabilityDetail: () => setAvailDetailOpen(false),
    closeCancelShift: () => setCancelShiftOpen(false),
    closeRemoveAvailability: () => setRemoveAvailabilityOpen(false),
    closeBulkReschedule: () => {
      setBulkRescheduleOpen(false);
      setSelectedShiftIds(new Set());
      setBulkMode(false);
    },
    clearSelectedShift: () => setSelectedShift(null),
    clearSelectedAvailability: () => setSelectedAvailability(null),
    refetchAssignments: () => assignmentsQuery.refetch(),
  });

  const handlePublishWeek = () => {
    const today = new Date();
    m.shift.publishRange.mutate({
      from: startOfWeek(today, { weekStartsOn: 1 }),
      to: endOfWeek(today, { weekStartsOn: 1 }),
    });
  };

  const shiftAssignmentsMap = useMemo(() => {
    const map = new Map<string, ReadonlyArray<string>>();
    for (const shift of (shiftsQuery.data ?? []) as unknown as Array<{
      id: string;
      assignments?: Array<{ userId: string }>;
    }>) {
      map.set(shift.id, (shift.assignments ?? []).map((a) => a.userId));
    }
    return map;
  }, [shiftsQuery.data]);

  const baseEvents = useMemo<CalendarEvent[]>(() => {
    return buildCalendarEvents({
      viewer: role,
      shifts: (shiftsQuery.data ?? []) as unknown as CalendarShift[],
      availabilities: isOwner
        ? showAvailabilityOverlay
          ? (ownerAvailQuery.data ?? [])
          : []
        : (availQuery.data ?? []),
      availabilityLabel: t("availability.available"),
    });
  }, [
    shiftsQuery.data,
    availQuery.data,
    ownerAvailQuery.data,
    role,
    t,
    isOwner,
    showAvailabilityOverlay,
  ]);

  const events = useMemo(
    () => filterCalendarEvents(baseEvents, filters, shiftAssignmentsMap),
    [baseEvents, filters, shiftAssignmentsMap],
  );

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const event of baseEvents) {
      if (event.extendedProps.kind === "shift" && event.extendedProps.roleLabel) {
        set.add(event.extendedProps.roleLabel);
      }
    }
    return [...set].sort();
  }, [baseEvents]);

  const workerOptions = useMemo(() => {
    if (!isOwner || !businessQuery.data?.workers) return [];
    return businessQuery.data.workers.map((w) => ({ id: w.id, name: w.name }));
  }, [isOwner, businessQuery.data]);

  const toggleShiftSelection = (shiftId: string) => {
    setSelectedShiftIds((prev) => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  };

  const handleEventClick = (event: CalendarEvent) => {
    const shift = eventToSelectedShift(event);
    // In bulk-select mode a click toggles selection instead of opening detail.
    if (bulkMode) {
      if (shift) toggleShiftSelection(shift.shiftId);
      return;
    }
    if (shift) {
      setSelectedShift(shift);
      setDetailOpen(true);
      return;
    }
    const availability = eventToSelectedAvailability(event);
    if (availability) {
      setSelectedAvailability(availability);
      setAvailDetailOpen(true);
    }
  };

  const handleDateSelect = (selection: {
    start: Date;
    end: Date;
    allDay: boolean;
  }) => {
    const initial = {
      date: toDateInput(selection.start),
      startTime: toTimeInput(selection.start),
      endTime: toTimeInput(selection.end),
    };
    if (isOwner) {
      setShiftDialogMode("create");
      setShiftDialogInitial(initial);
      setShiftDialogOpen(true);
    } else {
      setAvailDialogInitial(initial);
      setAvailDialogOpen(true);
    }
  };

  const commitReschedule = (
    shiftId: string,
    newStart: Date,
    newEnd: Date,
    revert: () => void,
  ) => {
    m.shift.update.mutate(
      { id: shiftId, startsAt: newStart, endsAt: newEnd },
      { onError: () => revert() },
    );
  };

  const handleEventReschedule = async ({
    shiftId,
    newStart,
    newEnd,
    revert,
  }: EventReschedule) => {
    try {
      // Surface assigned-worker conflicts *before* committing the move so the
      // owner can decide knowingly. The server-side update would still gate on
      // hard rules, but this soft check lets us name who is affected.
      const conflicts = await utils.shift.rescheduleConflicts.fetch({
        id: shiftId,
        startsAt: newStart,
        endsAt: newEnd,
      });
      if (conflicts && conflicts.length > 0) {
        setReschedulePrompt({ shiftId, newStart, newEnd, revert, conflicts });
        return;
      }
    } catch {
      // The pre-check failed (permissions/network). Fall through and let the
      // update mutation surface the real error, reverting the drag on failure.
    }
    commitReschedule(shiftId, newStart, newEnd, revert);
  };

  const handleNewShiftClick = () => {
    setShiftDialogMode("create");
    setShiftDialogInitial(undefined);
    setShiftDialogOpen(true);
  };

  const handleNewAvailabilityClick = () => {
    setAvailDialogInitial(undefined);
    setAvailDialogOpen(true);
  };

  const handleEditShift = () => {
    if (!selectedShift) return;
    setShiftDialogMode("edit");
    setShiftDialogInitial({
      date: toDateInput(selectedShift.startsAt),
      startTime: toTimeInput(selectedShift.startsAt),
      endTime: toTimeInput(selectedShift.endsAt),
      roleLabel: selectedShift.roleLabel,
      requiredSpots: selectedShift.requiredSpots,
      notes: selectedShift.notes ?? undefined,
      requiredSkillId: selectedShift.requiredSkillId ?? null,
      locationId: selectedShift.locationId ?? null,
    });
    setShiftDialogOpen(true);
    setDetailOpen(false);
  };

  const handleShiftSubmit = (data: {
    date: string;
    startTime: string;
    endTime: string;
    roleLabel: string;
    requiredSpots: number;
    notes?: string;
    requiredSkillId?: string | null;
    locationId?: string | null;
    publish?: boolean;
    repeatWeekly?: boolean;
    repeatUntil?: string;
  }) => {
    if (shiftDialogMode === "edit" && selectedShift) {
      m.shift.update.mutate({
        id: selectedShift.shiftId,
        startsAt: combineDateTime(data.date, data.startTime),
        endsAt: combineDateTime(data.date, data.endTime),
        roleLabel: data.roleLabel,
        requiredSpots: data.requiredSpots,
        notes: data.notes ?? null,
        requiredSkillId: data.requiredSkillId ?? null,
        locationId: data.locationId ?? null,
      });
      return;
    }
    if (data.repeatWeekly && data.repeatUntil) {
      m.shift.createRecurring.mutate({
        startsAt: combineDateTime(data.date, data.startTime),
        endsAt: combineDateTime(data.date, data.endTime),
        roleLabel: data.roleLabel,
        requiredSpots: data.requiredSpots,
        notes: data.notes,
        requiredSkillId: data.requiredSkillId ?? null,
        locationId: data.locationId ?? null,
        publish: data.publish,
        repeatUntil: combineDateTime(data.repeatUntil, "23:59"),
      });
      return;
    }
    m.shift.create.mutate({
      startsAt: combineDateTime(data.date, data.startTime),
      endsAt: combineDateTime(data.date, data.endTime),
      roleLabel: data.roleLabel,
      requiredSpots: data.requiredSpots,
      notes: data.notes,
      requiredSkillId: data.requiredSkillId ?? null,
      locationId: data.locationId ?? null,
      publish: data.publish,
    });
  };

  const isMutating =
    m.shift.create.isPending ||
    m.shift.createRecurring.isPending ||
    m.shift.update.isPending ||
    m.shift.delete.isPending ||
    m.subscription.apply.isPending ||
    m.subscription.withdraw.isPending ||
    m.subscription.approve.isPending ||
    m.subscription.reject.isPending ||
    m.subscription.approveMany.isPending ||
    m.subscription.rejectMany.isPending ||
    m.availability.delete.isPending;

  if (!session) return null;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isOwner ? t("calendar.ownerTitle") : t("calendar.workerTitle")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {isOwner
                ? t("calendar.ownerSubtitle")
                : t("calendar.workerSubtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TimeFormatToggle
              value={timeFormat}
              onChange={handleTimeFormatChange}
            />
            {isOwner ? (
              <OwnerToolbar
                onPublishWeek={handlePublishWeek}
                onDuplicateWeek={(input) => m.shift.duplicateWeek.mutate(input)}
                onCancelDay={(date) => m.shift.cancelDay.mutate({ date })}
                onNewShift={handleNewShiftClick}
                isPublishing={m.shift.publishRange.isPending}
                isDuplicating={m.shift.duplicateWeek.isPending}
                isCancellingDay={m.shift.cancelDay.isPending}
                bulkMode={bulkMode}
                onToggleBulkMode={() => {
                  setBulkMode((prev) => !prev);
                  setSelectedShiftIds(new Set());
                }}
                selectedCount={selectedShiftIds.size}
                onOpenBulkReschedule={() => setBulkRescheduleOpen(true)}
              />
            ) : (
              <Button onClick={handleNewAvailabilityClick} size="sm">
                <Plus className="mr-1 h-4 w-4" />
                {t("calendar.setAvailability")}
              </Button>
            )}
          </div>
        </div>

        {isOwner && (
          <KpiStrip
            isLoading={kpisQuery.isLoading}
            data={kpisQuery.data ?? null}
          />
        )}

        <FilterBar
          roleOptions={roleOptions}
          workerOptions={workerOptions}
          filters={filters}
          onChange={setFilters}
          showOverlayToggle={isOwner}
          overlayValue={showAvailabilityOverlay}
          onOverlayChange={setShowAvailabilityOverlay}
        />

        <WorkCalendar
          events={events}
          initialView="dayGridMonth"
          onEventClick={handleEventClick}
          onDateSelect={handleDateSelect}
          onRangeChange={handleRangeChange}
          onEventReschedule={handleEventReschedule}
          editable={isOwner && !bulkMode}
          selectedShiftIds={bulkMode ? selectedShiftIds : undefined}
          isLoading={shiftsQuery.isFetching || availQuery.isFetching}
          isError={shiftsQuery.isError || availQuery.isError}
          errorTitle={t("calendar.errorTitle")}
          retryLabel={t("calendar.errorRetry")}
          onRetry={() => {
            shiftsQuery.refetch();
            if (!isOwner) availQuery.refetch();
          }}
          emptyLabel={t("calendar.empty")}
          canSelect={!bulkMode}
          ariaLabel={isOwner ? t("calendar.ownerTitle") : t("calendar.workerTitle")}
          timeFormat={timeFormat}
        />

        <StatusLegend />
      </main>

      <CalendarDialogs
        m={m}
        isOwner={isOwner}
        shiftDialogOpen={shiftDialogOpen}
        setShiftDialogOpen={setShiftDialogOpen}
        shiftDialogMode={shiftDialogMode}
        setShiftDialogMode={setShiftDialogMode}
        shiftDialogInitial={shiftDialogInitial}
        setShiftDialogInitial={setShiftDialogInitial}
        onShiftSubmit={handleShiftSubmit}
        availDialogOpen={availDialogOpen}
        setAvailDialogOpen={setAvailDialogOpen}
        availDialogInitial={availDialogInitial}
        setAvailDialogInitial={setAvailDialogInitial}
        availDetailOpen={availDetailOpen}
        setAvailDetailOpen={setAvailDetailOpen}
        selectedAvailability={selectedAvailability}
        removeAvailabilityOpen={removeAvailabilityOpen}
        setRemoveAvailabilityOpen={setRemoveAvailabilityOpen}
        detailOpen={detailOpen}
        setDetailOpen={setDetailOpen}
        selectedShift={selectedShift}
        subscriptions={subscriptionsQuery.data ?? []}
        assignments={assignmentsQuery.data ?? []}
        isMutating={isMutating}
        workerOptions={workerOptions}
        onEditShift={handleEditShift}
        onCancelShiftClick={() => setCancelShiftOpen(true)}
        onOfferSwapClick={() => setOfferSwapOpen(true)}
        workerBroadcastInvited={
          !isOwner &&
          !!selectedShift &&
          broadcastShiftIds.has(selectedShift.shiftId)
        }
        onAcceptBroadcast={() =>
          selectedShift &&
          m.shift.acceptBroadcast.mutate({ shiftId: selectedShift.shiftId })
        }
        workerNeedsReconfirm={
          !isOwner &&
          !!selectedShift &&
          reconfirmShiftIds.has(selectedShift.shiftId)
        }
        cancelShiftOpen={cancelShiftOpen}
        setCancelShiftOpen={setCancelShiftOpen}
        offerSwapOpen={offerSwapOpen}
        setOfferSwapOpen={setOfferSwapOpen}
        onSwapOffered={() => {
          utils.subscription.listMine.invalidate();
          utils.swap.listMine.invalidate();
        }}
      />

      <RescheduleConflictDialog
        open={!!reschedulePrompt}
        onOpenChange={(open) => {
          if (!open) setReschedulePrompt(null);
        }}
        conflicts={reschedulePrompt?.conflicts ?? []}
        isPending={m.shift.update.isPending}
        onConfirm={() => {
          if (!reschedulePrompt) return;
          const { shiftId, newStart, newEnd, revert } = reschedulePrompt;
          commitReschedule(shiftId, newStart, newEnd, revert);
          setReschedulePrompt(null);
        }}
        onCancel={() => reschedulePrompt?.revert()}
      />

      <BulkRescheduleDialog
        open={bulkRescheduleOpen}
        onOpenChange={setBulkRescheduleOpen}
        count={selectedShiftIds.size}
        isPending={m.shift.bulkReschedule.isPending}
        onApply={(deltaMinutes) =>
          m.shift.bulkReschedule.mutate({
            ids: [...selectedShiftIds],
            deltaMinutes,
          })
        }
      />
    </div>
  );
}

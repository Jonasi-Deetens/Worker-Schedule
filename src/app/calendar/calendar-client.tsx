"use client";

import { useSession } from "next-auth/react";
import { useCallback, useMemo, useState } from "react";
import { useBusinessEvents } from "@/interface/hooks/use-business-events";
import { useTranslations } from "next-intl";
import { addMonths, endOfMonth, startOfMonth, endOfWeek, startOfWeek } from "date-fns";
import { Plus, Send } from "lucide-react";
import type { DisplayStatus, UserRole } from "@/domain/types";
import { AppHeader } from "@/interface/components/app-header";
import {
  AvailabilityDetailDialog,
  type AvailabilityItem,
} from "@/interface/components/availability-detail-dialog";
import { Button } from "@/interface/components/ui/button";
import { ConfirmDialog } from "@/interface/components/confirm-dialog";
import { KpiStrip } from "@/interface/components/kpi-strip";
import { CalendarFiltersBar } from "@/interface/components/calendar-filters-bar";
import { ShiftDetailDialog } from "@/interface/components/shift-detail-dialog";
import { OfferSwapDialog } from "@/interface/components/offer-swap-dialog";
import {
  AvailabilityFormDialog,
  ShiftFormDialog,
  type AvailabilityFormInitial,
  type ShiftFormInitial,
} from "@/interface/components/shift-form-dialog";
import {
  WorkCalendar,
  type CalendarRangeChange,
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
import { STATUS_HEX } from "@/lib/status-colors";
import { toast, trpcErrorMessage } from "@/lib/toast";

const DISPLAY_STATUSES: DisplayStatus[] = [
  "Open",
  "Pending",
  "Approved/Filled",
  "Rejected",
  "Withdrawn",
  "Cancelled",
];

function combineDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

interface SelectedShift {
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
}

function eventToSelectedShift(event: CalendarEvent): SelectedShift | null {
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
  };
}

function eventToSelectedAvailability(
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
  const markAttendance = trpc.attendance.mark.useMutation({
    onSuccess: () => {
      assignmentsQuery.refetch();
      toast.success(t("attendance.title"));
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const broadcastMutation = trpc.shift.broadcast.useMutation({
    onSuccess: (data) => {
      toast.success(t("shift.broadcastSent", { count: data?.notified ?? 0 }));
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const businessQuery = trpc.business.get.useQuery(undefined, {
    enabled: isOwner,
  });

  const createShift = trpc.shift.create.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.shift.kpis.invalidate();
      setShiftDialogOpen(false);
      setShiftDialogInitial(undefined);
      toast.success(t("toast.shiftCreated"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const createRecurringShift = trpc.shift.createRecurring.useMutation({
    onSuccess: (data) => {
      utils.shift.list.invalidate();
      utils.shift.kpis.invalidate();
      setShiftDialogOpen(false);
      setShiftDialogInitial(undefined);
      const count = Array.isArray(data) ? data.length : 1;
      toast.success(t("toast.shiftCreated"), {
        description: `${count}×`,
      });
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const updateShift = trpc.shift.update.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.shift.kpis.invalidate();
      setShiftDialogOpen(false);
      setShiftDialogInitial(undefined);
      setShiftDialogMode("create");
      toast.success(t("toast.shiftUpdated"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const deleteShift = trpc.shift.delete.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.shift.kpis.invalidate();
      setDetailOpen(false);
      setCancelShiftOpen(false);
      setSelectedShift(null);
      toast.success(t("toast.shiftCancelled"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const setAvailability = trpc.availability.set.useMutation({
    onSuccess: () => {
      utils.availability.list.invalidate();
      setAvailDialogOpen(false);
      setAvailDialogInitial(undefined);
      toast.success(t("toast.availabilitySet"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const deleteAvailability = trpc.availability.delete.useMutation({
    onSuccess: () => {
      utils.availability.list.invalidate();
      setAvailDetailOpen(false);
      setRemoveAvailabilityOpen(false);
      setSelectedAvailability(null);
      toast.success(t("toast.availabilityRemoved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const applyMutation = trpc.subscription.submit.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listMine.invalidate();
      utils.notification.unreadCount.invalidate();
      setDetailOpen(false);
      toast.success(t("toast.applicationSubmitted"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const withdrawMutation = trpc.subscription.withdraw.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listMine.invalidate();
      setDetailOpen(false);
      toast.success(t("toast.applicationWithdrawn"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const approveMutation = trpc.subscription.approve.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.shift.kpis.invalidate();
      utils.subscription.listForShift.invalidate();
      utils.notification.unreadCount.invalidate();
      toast.success(t("toast.applicationApproved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const rejectMutation = trpc.subscription.reject.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listForShift.invalidate();
      toast.success(t("toast.applicationRejected"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const approveManyMutation = trpc.subscription.approveMany.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.shift.kpis.invalidate();
      utils.subscription.listForShift.invalidate();
      utils.notification.unreadCount.invalidate();
      toast.success(t("toast.applicationApproved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const rejectManyMutation = trpc.subscription.rejectMany.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listForShift.invalidate();
      toast.success(t("toast.applicationRejected"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const publishRange = trpc.shift.publishRange.useMutation({
    onSuccess: (data) => {
      utils.shift.list.invalidate();
      utils.shift.kpis.invalidate();
      toast.success(t("toast.shiftPublished"), {
        description: t("calendar.published", { count: data.count }),
      });
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const duplicateWeek = trpc.shift.duplicateWeek.useMutation({
    onSuccess: (data) => {
      utils.shift.list.invalidate();
      toast.success(t("bulk.duplicated", { count: data?.created ?? 0 }));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });
  const cancelDay = trpc.shift.cancelDay.useMutation({
    onSuccess: (data) => {
      utils.shift.list.invalidate();
      toast.success(t("bulk.cancelled", { count: data?.cancelled ?? 0 }));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const assignWorker = trpc.shift.assign.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listForShift.invalidate();
      toast.success(t("toast.shiftAssigned"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const handlePublishWeek = () => {
    const today = new Date();
    publishRange.mutate({
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

  const handleEventClick = (event: CalendarEvent) => {
    const shift = eventToSelectedShift(event);
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

  const handleEventReschedule = ({
    shiftId,
    newStart,
    newEnd,
    revert,
  }: EventReschedule) => {
    updateShift.mutate(
      {
        id: shiftId,
        startsAt: newStart,
        endsAt: newEnd,
      },
      {
        onError: () => revert(),
      },
    );
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
    repeatWeekly?: boolean;
    repeatUntil?: string;
  }) => {
    if (shiftDialogMode === "edit" && selectedShift) {
      updateShift.mutate({
        id: selectedShift.shiftId,
        startsAt: combineDateTime(data.date, data.startTime),
        endsAt: combineDateTime(data.date, data.endTime),
        roleLabel: data.roleLabel,
        requiredSpots: data.requiredSpots,
        notes: data.notes ?? null,
      });
      return;
    }
    if (data.repeatWeekly && data.repeatUntil) {
      createRecurringShift.mutate({
        startsAt: combineDateTime(data.date, data.startTime),
        endsAt: combineDateTime(data.date, data.endTime),
        roleLabel: data.roleLabel,
        requiredSpots: data.requiredSpots,
        notes: data.notes,
        repeatUntil: combineDateTime(data.repeatUntil, "23:59"),
      });
      return;
    }
    createShift.mutate({
      startsAt: combineDateTime(data.date, data.startTime),
      endsAt: combineDateTime(data.date, data.endTime),
      roleLabel: data.roleLabel,
      requiredSpots: data.requiredSpots,
      notes: data.notes,
    });
  };

  const isMutating =
    createShift.isPending ||
    createRecurringShift.isPending ||
    updateShift.isPending ||
    deleteShift.isPending ||
    applyMutation.isPending ||
    withdrawMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    approveManyMutation.isPending ||
    rejectManyMutation.isPending ||
    deleteAvailability.isPending;

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
          <div className="flex gap-2">
            {isOwner ? (
              <>
                <Button
                  onClick={handlePublishWeek}
                  size="sm"
                  variant="outline"
                  disabled={publishRange.isPending}
                >
                  <Send className="mr-1 h-4 w-4" />
                  {t("calendar.publishWeek")}
                </Button>
                <Button
                  onClick={() => {
                    const today = new Date();
                    const fromWeek = startOfWeek(today, { weekStartsOn: 1 });
                    const toWeek = new Date(
                      fromWeek.getTime() + 7 * 86_400_000,
                    );
                    duplicateWeek.mutate({
                      fromWeekStart: fromWeek,
                      toWeekStart: toWeek,
                    });
                  }}
                  size="sm"
                  variant="outline"
                  disabled={duplicateWeek.isPending}
                  title={t("bulk.duplicateWeekHint")}
                >
                  {t("bulk.duplicateWeek")}
                </Button>
                <Button
                  onClick={() => {
                    if (!window.confirm(t("bulk.confirmCancelToday"))) return;
                    cancelDay.mutate({ date: new Date() });
                  }}
                  size="sm"
                  variant="outline"
                  disabled={cancelDay.isPending}
                  title={t("bulk.cancelDayHint")}
                >
                  {t("bulk.cancelDay")}
                </Button>
                <Button onClick={handleNewShiftClick} size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  {t("calendar.newShift")}
                </Button>
              </>
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

        <CalendarFiltersBar
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
          isLoading={shiftsQuery.isFetching || availQuery.isFetching}
          isError={shiftsQuery.isError || availQuery.isError}
          errorTitle={t("calendar.errorTitle")}
          retryLabel={t("calendar.errorRetry")}
          onRetry={() => {
            shiftsQuery.refetch();
            if (!isOwner) availQuery.refetch();
          }}
          emptyLabel={t("calendar.empty")}
          canSelect
          editable={isOwner}
          ariaLabel={isOwner ? t("calendar.ownerTitle") : t("calendar.workerTitle")}
        />

        <div className="mt-6 flex flex-wrap gap-2.5 text-xs">
          {DISPLAY_STATUSES.map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 shadow-sm"
            >
              <StatusDot status={status} />
              <span className="font-medium">{t(statusKey(status))}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800 shadow-sm">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-violet-400"
              style={{ background: "#a78bfa" }}
              aria-hidden
            />
            <span className="font-medium">{t("availability.available")}</span>
          </span>
        </div>
      </main>

      <ShiftFormDialog
        open={shiftDialogOpen}
        onOpenChange={(open) => {
          setShiftDialogOpen(open);
          if (!open) {
            setShiftDialogInitial(undefined);
            setShiftDialogMode("create");
          }
        }}
        isSubmitting={
          createShift.isPending ||
          createRecurringShift.isPending ||
          updateShift.isPending
        }
        mode={shiftDialogMode}
        initialData={shiftDialogInitial}
        allowRecurrence
        onSubmit={handleShiftSubmit}
      />

      <AvailabilityFormDialog
        open={availDialogOpen}
        onOpenChange={(open) => {
          setAvailDialogOpen(open);
          if (!open) setAvailDialogInitial(undefined);
        }}
        isSubmitting={setAvailability.isPending}
        initialData={availDialogInitial}
        onSubmit={(data) => {
          setAvailability.mutate({
            startsAt: combineDateTime(data.date, data.startTime),
            endsAt: combineDateTime(data.date, data.endTime),
          });
        }}
      />

      <AvailabilityDetailDialog
        open={availDetailOpen}
        onOpenChange={setAvailDetailOpen}
        availability={selectedAvailability}
        isDeleting={deleteAvailability.isPending}
        onDelete={() => setRemoveAvailabilityOpen(true)}
      />

      <ConfirmDialog
        open={removeAvailabilityOpen}
        onOpenChange={setRemoveAvailabilityOpen}
        title={t("confirm.removeAvailabilityTitle")}
        description={t("confirm.removeAvailabilityBody")}
        confirmLabel={t("confirm.yes")}
        cancelLabel={t("confirm.no")}
        isPending={deleteAvailability.isPending}
        onConfirm={() => {
          if (selectedAvailability) {
            deleteAvailability.mutate({ id: selectedAvailability.id });
          }
        }}
      />

      <ShiftDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        shift={
          selectedShift
            ? {
                id: selectedShift.shiftId,
                startsAt: selectedShift.startsAt,
                endsAt: selectedShift.endsAt,
                roleLabel: selectedShift.roleLabel,
                displayStatus: selectedShift.displayStatus,
                requiredSpots: selectedShift.requiredSpots,
                approvedCount: selectedShift.approvedCount,
                subscriptionId: selectedShift.subscriptionId,
                subscriptionStatus: selectedShift.subscriptionStatus,
                notes: selectedShift.notes,
              }
            : null
        }
        isOwner={isOwner}
        subscriptions={subscriptionsQuery.data ?? []}
        assignments={assignmentsQuery.data ?? []}
        onMarkAttendance={(assignmentId, status) =>
          markAttendance.mutate({ assignmentId, status })
        }
        onBroadcast={() =>
          selectedShift &&
          broadcastMutation.mutate({ shiftId: selectedShift.shiftId })
        }
        isLoading={isMutating}
        onApply={() =>
          selectedShift && applyMutation.mutate({ shiftId: selectedShift.shiftId })
        }
        onWithdraw={() =>
          selectedShift?.subscriptionId &&
          withdrawMutation.mutate({
            subscriptionId: selectedShift.subscriptionId,
          })
        }
        onApprove={(id) => approveMutation.mutate({ subscriptionId: id })}
        onReject={(id) => rejectMutation.mutate({ subscriptionId: id })}
        onBulkApprove={(ids) =>
          approveManyMutation.mutate({ subscriptionIds: ids })
        }
        onBulkReject={(ids) =>
          rejectManyMutation.mutate({ subscriptionIds: ids })
        }
        onEditShift={handleEditShift}
        onCancelShift={() => setCancelShiftOpen(true)}
        onOfferSwap={() => setOfferSwapOpen(true)}
        workerOptions={workerOptions}
        onAssignWorker={(workerId) =>
          selectedShift &&
          assignWorker.mutate({
            shiftId: selectedShift.shiftId,
            workerId,
          })
        }
      />

      <ConfirmDialog
        open={cancelShiftOpen}
        onOpenChange={setCancelShiftOpen}
        title={t("confirm.cancelShiftTitle")}
        description={t("confirm.cancelShiftBody")}
        confirmLabel={t("confirm.yes")}
        cancelLabel={t("confirm.no")}
        isPending={deleteShift.isPending}
        onConfirm={() => {
          if (selectedShift) {
            deleteShift.mutate({ id: selectedShift.shiftId });
          }
        }}
      />

      <OfferSwapDialog
        open={offerSwapOpen}
        onOpenChange={setOfferSwapOpen}
        subscriptionId={selectedShift?.subscriptionId ?? null}
        onOffered={() => {
          utils.subscription.listMine.invalidate();
          utils.swap.listMine.invalidate();
        }}
      />
    </div>
  );
}

function statusKey(status: DisplayStatus): string {
  switch (status) {
    case "Open":
      return "status.open";
    case "Pending":
      return "status.pending";
    case "Approved/Filled":
      return "status.filled";
    case "Rejected":
      return "status.rejected";
    case "Withdrawn":
      return "status.withdrawn";
    case "Cancelled":
      return "status.cancelled";
  }
}

function StatusDot({ status }: { status: DisplayStatus }) {
  const palette = STATUS_HEX[status];
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: palette.bg, boxShadow: `inset 0 0 0 1px ${palette.accent}` }}
      aria-hidden
    />
  );
}

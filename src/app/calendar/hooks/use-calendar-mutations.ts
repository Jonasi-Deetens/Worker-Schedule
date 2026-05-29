"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

/**
 * Side-effect callbacks the page wires into the mutation pipeline. Each is
 * optional so consumer pages only need to wire the ones they care about
 * (workers and owners share this hook but trigger different dialogs).
 */
export interface CalendarMutationsCallbacks {
  closeShiftDialog?: () => void;
  closeAvailabilityDialog?: () => void;
  closeDetail?: () => void;
  closeAvailabilityDetail?: () => void;
  closeCancelShift?: () => void;
  closeRemoveAvailability?: () => void;
  closeBulkReschedule?: () => void;
  clearSelectedShift?: () => void;
  clearSelectedAvailability?: () => void;
  refetchAssignments?: () => void;
}

/**
 * Bundles the ~20 mutations the calendar page kicks off so the page body
 * itself reads as composition rather than 200 lines of `useMutation`
 * scaffolding. Each mutation handles its own invalidation, the shared
 * `onError` toast, and the optional side-effects (closing dialogs, etc.)
 * that previously lived inline.
 */
export function useCalendarMutations(
  callbacks: CalendarMutationsCallbacks = {},
) {
  const t = useTranslations();
  const utils = trpc.useUtils();

  const onError = (error: unknown) => toast.error(trpcErrorMessage(error, t));

  const shiftListInvalidate = () => {
    utils.shift.list.invalidate();
    utils.shift.kpis.invalidate();
  };

  const markAttendance = trpc.attendance.mark.useMutation({
    onSuccess: () => {
      callbacks.refetchAssignments?.();
      toast.success(t("attendance.title"));
    },
    onError,
  });

  const broadcast = trpc.shift.broadcast.useMutation({
    onSuccess: (data) => {
      toast.success(t("shift.broadcastSent", { count: data?.notified ?? 0 }));
    },
    onError,
  });

  const acceptBroadcast = trpc.shift.acceptBroadcast.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.shift.openBroadcasts.invalidate();
      utils.notification.unreadCount.invalidate();
      callbacks.closeDetail?.();
      callbacks.clearSelectedShift?.();
      toast.success(t("applications.broadcastAccepted"));
    },
    onError,
  });

  const bulkReschedule = trpc.shift.bulkReschedule.useMutation({
    onSuccess: (data) => {
      shiftListInvalidate();
      callbacks.closeBulkReschedule?.();
      toast.success(t("bulk.rescheduled", { count: data?.moved ?? 0 }));
    },
    onError,
  });

  const createShift = trpc.shift.create.useMutation({
    onSuccess: () => {
      shiftListInvalidate();
      callbacks.closeShiftDialog?.();
      toast.success(t("toast.shiftCreated"));
    },
    onError,
  });

  const createRecurringShift = trpc.shift.createRecurring.useMutation({
    onSuccess: (data) => {
      shiftListInvalidate();
      callbacks.closeShiftDialog?.();
      const count = Array.isArray(data) ? data.length : 1;
      toast.success(t("toast.shiftCreated"), { description: `${count}×` });
    },
    onError,
  });

  const updateShift = trpc.shift.update.useMutation({
    onSuccess: () => {
      shiftListInvalidate();
      callbacks.closeShiftDialog?.();
      toast.success(t("toast.shiftUpdated"));
    },
    onError,
  });

  const deleteShift = trpc.shift.delete.useMutation({
    onSuccess: () => {
      shiftListInvalidate();
      callbacks.closeDetail?.();
      callbacks.closeCancelShift?.();
      callbacks.clearSelectedShift?.();
      toast.success(t("toast.shiftCancelled"));
    },
    onError,
  });

  const publishRange = trpc.shift.publishRange.useMutation({
    onSuccess: (data) => {
      shiftListInvalidate();
      toast.success(t("toast.shiftPublished"), {
        description: t("calendar.published", { count: data.count }),
      });
    },
    onError,
  });

  const publish = trpc.shift.publish.useMutation({
    onSuccess: () => {
      shiftListInvalidate();
      callbacks.closeDetail?.();
      callbacks.clearSelectedShift?.();
      toast.success(t("toast.shiftPublished"));
    },
    onError,
  });

  const duplicateWeek = trpc.shift.duplicateWeek.useMutation({
    onSuccess: (data) => {
      utils.shift.list.invalidate();
      toast.success(t("bulk.duplicated", { count: data?.created ?? 0 }));
    },
    onError,
  });

  const cancelDay = trpc.shift.cancelDay.useMutation({
    onSuccess: (data) => {
      utils.shift.list.invalidate();
      toast.success(t("bulk.cancelled", { count: data?.cancelled ?? 0 }));
    },
    onError,
  });

  const assignWorker = trpc.shift.assign.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listForShift.invalidate();
      callbacks.refetchAssignments?.();
      toast.success(t("toast.shiftAssigned"));
    },
    onError,
  });

  const unassignWorker = trpc.shift.unassign.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listForShift.invalidate();
      callbacks.refetchAssignments?.();
      toast.success(t("toast.offerCancelled"));
    },
    onError,
  });

  const setAvailability = trpc.availability.set.useMutation({
    onSuccess: () => {
      utils.availability.list.invalidate();
      callbacks.closeAvailabilityDialog?.();
      toast.success(t("toast.availabilitySet"));
    },
    onError,
  });

  const deleteAvailability = trpc.availability.delete.useMutation({
    onSuccess: () => {
      utils.availability.list.invalidate();
      callbacks.closeAvailabilityDetail?.();
      callbacks.closeRemoveAvailability?.();
      callbacks.clearSelectedAvailability?.();
      toast.success(t("toast.availabilityRemoved"));
    },
    onError,
  });

  const reconfirmInvalidate = () => {
    utils.shift.list.invalidate();
    utils.shift.pendingReconfirmations.invalidate();
    utils.notification.unreadCount.invalidate();
  };

  const confirmReschedule = trpc.shift.confirmReschedule.useMutation({
    onSuccess: () => {
      reconfirmInvalidate();
      callbacks.closeDetail?.();
      toast.success(t("toast.reconfirmConfirmed"));
    },
    onError,
  });

  const declineReschedule = trpc.shift.declineReschedule.useMutation({
    onSuccess: () => {
      reconfirmInvalidate();
      callbacks.closeDetail?.();
      toast.success(t("toast.reconfirmDeclined"));
    },
    onError,
  });

  const applyToShift = trpc.subscription.submit.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listMine.invalidate();
      utils.notification.unreadCount.invalidate();
      callbacks.closeDetail?.();
      toast.success(t("toast.applicationSubmitted"));
    },
    onError,
  });

  const withdrawApplication = trpc.subscription.withdraw.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listMine.invalidate();
      callbacks.closeDetail?.();
      toast.success(t("toast.applicationWithdrawn"));
    },
    onError,
  });

  const approveSubscription = trpc.subscription.approve.useMutation({
    onSuccess: () => {
      shiftListInvalidate();
      utils.subscription.listForShift.invalidate();
      utils.notification.unreadCount.invalidate();
      toast.success(t("toast.applicationApproved"));
    },
    onError,
  });

  const rejectSubscription = trpc.subscription.reject.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listForShift.invalidate();
      toast.success(t("toast.applicationRejected"));
    },
    onError,
  });

  const approveManySubscriptions = trpc.subscription.approveMany.useMutation({
    onSuccess: () => {
      shiftListInvalidate();
      utils.subscription.listForShift.invalidate();
      utils.notification.unreadCount.invalidate();
      toast.success(t("toast.applicationApproved"));
    },
    onError,
  });

  const rejectManySubscriptions = trpc.subscription.rejectMany.useMutation({
    onSuccess: () => {
      utils.shift.list.invalidate();
      utils.subscription.listForShift.invalidate();
      toast.success(t("toast.applicationRejected"));
    },
    onError,
  });

  return {
    utils,
    shift: {
      create: createShift,
      createRecurring: createRecurringShift,
      update: updateShift,
      delete: deleteShift,
      publishRange,
      publish,
      duplicateWeek,
      cancelDay,
      assign: assignWorker,
      unassign: unassignWorker,
      broadcast,
      acceptBroadcast,
      bulkReschedule,
      confirmReschedule,
      declineReschedule,
    },
    availability: {
      set: setAvailability,
      delete: deleteAvailability,
    },
    subscription: {
      apply: applyToShift,
      withdraw: withdrawApplication,
      approve: approveSubscription,
      reject: rejectSubscription,
      approveMany: approveManySubscriptions,
      rejectMany: rejectManySubscriptions,
    },
    attendance: {
      mark: markAttendance,
    },
  } as const;
}

export type CalendarMutations = ReturnType<typeof useCalendarMutations>;

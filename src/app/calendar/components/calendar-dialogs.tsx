"use client";

import { useTranslations } from "next-intl";
import {
  AvailabilityDetailDialog,
  type AvailabilityItem,
} from "@/interface/components/availability-detail-dialog";
import { ConfirmDialog } from "@/interface/components/confirm-dialog";
import { OfferSwapDialog } from "@/interface/components/offer-swap-dialog";
import { ShiftDetailDialog } from "@/interface/components/shift-detail-dialog";
import {
  AvailabilityFormDialog,
  ShiftFormDialog,
  type AvailabilityFormInitial,
  type ShiftFormInitial,
} from "@/interface/components/shift-form-dialog";
import type { CalendarMutations } from "../hooks/use-calendar-mutations";
import { combineDateTime, type SelectedShift } from "../lib/helpers";

interface CalendarDialogsProps {
  m: CalendarMutations;
  isOwner: boolean;
  // Shift form
  shiftDialogOpen: boolean;
  setShiftDialogOpen: (open: boolean) => void;
  shiftDialogMode: "create" | "edit";
  setShiftDialogMode: (mode: "create" | "edit") => void;
  shiftDialogInitial: ShiftFormInitial | undefined;
  setShiftDialogInitial: (v: ShiftFormInitial | undefined) => void;
  onShiftSubmit: (data: {
    date: string;
    startTime: string;
    endTime: string;
    roleLabel: string;
    requiredSpots: number;
    notes?: string;
    repeatWeekly?: boolean;
    repeatUntil?: string;
  }) => void;
  // Availability form
  availDialogOpen: boolean;
  setAvailDialogOpen: (open: boolean) => void;
  availDialogInitial: AvailabilityFormInitial | undefined;
  setAvailDialogInitial: (v: AvailabilityFormInitial | undefined) => void;
  // Availability detail
  availDetailOpen: boolean;
  setAvailDetailOpen: (open: boolean) => void;
  selectedAvailability: AvailabilityItem | null;
  // Remove availability confirm
  removeAvailabilityOpen: boolean;
  setRemoveAvailabilityOpen: (open: boolean) => void;
  // Shift detail
  detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
  selectedShift: SelectedShift | null;
  // Subscriptions + assignments for the detail dialog
  subscriptions: readonly unknown[];
  assignments: readonly unknown[];
  isMutating: boolean;
  workerOptions: ReadonlyArray<{ id: string; name: string }>;
  onEditShift: () => void;
  onCancelShiftClick: () => void;
  onOfferSwapClick: () => void;
  // Cancel shift confirm
  cancelShiftOpen: boolean;
  setCancelShiftOpen: (open: boolean) => void;
  // Offer swap
  offerSwapOpen: boolean;
  setOfferSwapOpen: (open: boolean) => void;
  onSwapOffered: () => void;
}

/**
 * Aggregates the seven dialogs the calendar page renders so the page body
 * stays focused on data fetching and orchestration. The component is still
 * controlled by the parent (every dialog's open/close lives in the parent's
 * state); we only own the markup.
 */
export function CalendarDialogs(props: CalendarDialogsProps) {
  const t = useTranslations();
  const { m, selectedShift } = props;

  return (
    <>
      <ShiftFormDialog
        open={props.shiftDialogOpen}
        onOpenChange={(open) => {
          props.setShiftDialogOpen(open);
          if (!open) {
            props.setShiftDialogInitial(undefined);
            props.setShiftDialogMode("create");
          }
        }}
        isSubmitting={
          m.shift.create.isPending ||
          m.shift.createRecurring.isPending ||
          m.shift.update.isPending
        }
        mode={props.shiftDialogMode}
        initialData={props.shiftDialogInitial}
        allowRecurrence
        onSubmit={props.onShiftSubmit}
      />

      <AvailabilityFormDialog
        open={props.availDialogOpen}
        onOpenChange={(open) => {
          props.setAvailDialogOpen(open);
          if (!open) props.setAvailDialogInitial(undefined);
        }}
        isSubmitting={m.availability.set.isPending}
        initialData={props.availDialogInitial}
        onSubmit={(data) => {
          m.availability.set.mutate({
            startsAt: combineDateTime(data.date, data.startTime),
            endsAt: combineDateTime(data.date, data.endTime),
          });
        }}
      />

      <AvailabilityDetailDialog
        open={props.availDetailOpen}
        onOpenChange={props.setAvailDetailOpen}
        availability={props.selectedAvailability}
        isDeleting={m.availability.delete.isPending}
        onDelete={() => props.setRemoveAvailabilityOpen(true)}
      />

      <ConfirmDialog
        open={props.removeAvailabilityOpen}
        onOpenChange={props.setRemoveAvailabilityOpen}
        title={t("confirm.removeAvailabilityTitle")}
        description={t("confirm.removeAvailabilityBody")}
        confirmLabel={t("confirm.yes")}
        cancelLabel={t("confirm.no")}
        isPending={m.availability.delete.isPending}
        onConfirm={() => {
          if (props.selectedAvailability) {
            m.availability.delete.mutate({ id: props.selectedAvailability.id });
          }
        }}
      />

      <ShiftDetailDialog
        open={props.detailOpen}
        onOpenChange={props.setDetailOpen}
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
        isOwner={props.isOwner}
        subscriptions={props.subscriptions as never}
        assignments={props.assignments as never}
        onMarkAttendance={(
          assignmentId: string,
          status: "ON_TIME" | "LATE" | "NO_SHOW" | "EXCUSED",
        ) => m.attendance.mark.mutate({ assignmentId, status })}
        onBroadcast={() =>
          selectedShift &&
          m.shift.broadcast.mutate({ shiftId: selectedShift.shiftId })
        }
        isLoading={props.isMutating}
        onApply={() =>
          selectedShift && m.subscription.apply.mutate({ shiftId: selectedShift.shiftId })
        }
        onWithdraw={() =>
          selectedShift?.subscriptionId &&
          m.subscription.withdraw.mutate({
            subscriptionId: selectedShift.subscriptionId,
          })
        }
        onApprove={(id: string) =>
          m.subscription.approve.mutate({ subscriptionId: id })
        }
        onReject={(id: string) =>
          m.subscription.reject.mutate({ subscriptionId: id })
        }
        onBulkApprove={(ids: string[]) =>
          m.subscription.approveMany.mutate({ subscriptionIds: ids })
        }
        onBulkReject={(ids: string[]) =>
          m.subscription.rejectMany.mutate({ subscriptionIds: ids })
        }
        onEditShift={props.onEditShift}
        onCancelShift={props.onCancelShiftClick}
        onOfferSwap={props.onOfferSwapClick}
        workerOptions={props.workerOptions}
        onAssignWorker={(workerId: string) =>
          selectedShift &&
          m.shift.assign.mutate({
            shiftId: selectedShift.shiftId,
            workerId,
          })
        }
      />

      <ConfirmDialog
        open={props.cancelShiftOpen}
        onOpenChange={props.setCancelShiftOpen}
        title={t("confirm.cancelShiftTitle")}
        description={t("confirm.cancelShiftBody")}
        confirmLabel={t("confirm.yes")}
        cancelLabel={t("confirm.no")}
        isPending={m.shift.delete.isPending}
        onConfirm={() => {
          if (selectedShift) {
            m.shift.delete.mutate({ id: selectedShift.shiftId });
          }
        }}
      />

      <OfferSwapDialog
        open={props.offerSwapOpen}
        onOpenChange={props.setOfferSwapOpen}
        subscriptionId={selectedShift?.subscriptionId ?? null}
        onOffered={props.onSwapOffered}
      />
    </>
  );
}

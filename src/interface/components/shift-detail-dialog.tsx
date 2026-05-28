"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { formatTimeRange } from "@/lib/calendar-utils";
import { Button } from "@/interface/components/ui/button";
import { StatusBadge } from "@/interface/components/status-badge";
import { ShiftMessagesPanel } from "@/interface/components/shift-messages-panel";
import { StaffingSuggestionsPanel } from "@/interface/components/staffing-suggestions-panel";
import type { DisplayStatus } from "@/domain/types";

export interface CalendarShiftItem {
  id: string;
  startsAt: Date;
  endsAt: Date;
  roleLabel: string;
  displayStatus: DisplayStatus;
  requiredSpots: number;
  approvedCount?: number;
  subscriptionId?: string;
  subscriptionStatus?: string;
  notes?: string | null;
}

interface ShiftDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: CalendarShiftItem | null;
  isOwner?: boolean;
  subscriptions?: {
    id: string;
    status: string;
    user: { id: string; name: string; email: string };
  }[];
  /** Approved assignments for past-shift attendance marking (owners only). */
  assignments?: {
    id: string;
    userId: string;
    userName: string;
    attendance: "ON_TIME" | "LATE" | "NO_SHOW" | "EXCUSED" | null;
  }[];
  workerOptions?: ReadonlyArray<{ id: string; name: string }>;
  onApply?: () => void;
  onWithdraw?: () => void;
  onApprove?: (subscriptionId: string) => void;
  onReject?: (subscriptionId: string) => void;
  onCancelShift?: () => void;
  onEditShift?: () => void;
  onAssignWorker?: (workerId: string) => void;
  onMarkAttendance?: (
    assignmentId: string,
    status: "ON_TIME" | "LATE" | "NO_SHOW" | "EXCUSED",
  ) => void;
  onBroadcast?: () => void;
  onAcceptBroadcast?: () => void;
  onOfferSwap?: () => void;
  workerBroadcastInvited?: boolean;
  onBulkApprove?: (subscriptionIds: string[]) => void;
  onBulkReject?: (subscriptionIds: string[]) => void;
  isLoading?: boolean;
}

export function ShiftDetailDialog({
  open,
  onOpenChange,
  shift,
  isOwner = false,
  subscriptions = [],
  assignments = [],
  workerOptions = [],
  onApply,
  onWithdraw,
  onApprove,
  onReject,
  onCancelShift,
  onEditShift,
  onAssignWorker,
  onMarkAttendance,
  onBroadcast,
  onAcceptBroadcast,
  onOfferSwap,
  workerBroadcastInvited = false,
  onBulkApprove,
  onBulkReject,
  isLoading,
}: ShiftDetailDialogProps) {
  const t = useTranslations();
  const assignedIds = new Set(
    subscriptions
      .filter((s) => s.status === "APPROVED")
      .map((s) => s.user.id),
  );
  const eligibleAssignees = workerOptions.filter((w) => !assignedIds.has(w.id));

  if (!shift) return null;

  const canApply =
    !isOwner &&
    !shift.subscriptionId &&
    shift.displayStatus !== "Cancelled" &&
    shift.displayStatus !== "Approved/Filled";

  const canWithdraw =
    !isOwner && shift.subscriptionStatus === "PENDING" && shift.subscriptionId;

  const pendingSubscriptionIds = subscriptions
    .filter((s) => s.status === "PENDING")
    .map((s) => s.id);
  const hasBulkActions =
    isOwner && pendingSubscriptionIds.length > 1 && (onBulkApprove || onBulkReject);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
          <Dialog.Title className="text-xl font-semibold text-slate-900">
            {shift.roleLabel}
          </Dialog.Title>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={shift.displayStatus} />
            {shift.approvedCount !== undefined && (
              <span className="text-sm text-slate-600">
                {t("shift.filledCount", {
                  filled: shift.approvedCount,
                  required: shift.requiredSpots,
                })}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {formatTimeRange(new Date(shift.startsAt), new Date(shift.endsAt))}
          </p>

          {shift.notes && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("shift.notes")}
              </p>
              <p className="mt-1 whitespace-pre-line">{shift.notes}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {canApply && (
              <Button onClick={onApply} disabled={isLoading}>
                {t("shift.apply")}
              </Button>
            )}
            {canWithdraw && (
              <Button variant="secondary" onClick={onWithdraw} disabled={isLoading}>
                {t("shift.withdraw")}
              </Button>
            )}
            {!isOwner &&
              onOfferSwap &&
              shift.subscriptionStatus === "APPROVED" &&
              new Date(shift.startsAt) > new Date() && (
                <Button
                  variant="outline"
                  onClick={onOfferSwap}
                  disabled={isLoading}
                >
                  {t("swap.offerSwap")}
                </Button>
              )}
            {isOwner && onEditShift && shift.displayStatus !== "Cancelled" && (
              <Button variant="secondary" onClick={onEditShift} disabled={isLoading}>
                <Pencil className="mr-1.5 h-4 w-4" />
                {t("shift.edit")}
              </Button>
            )}
            {isOwner &&
              onBroadcast &&
              shift.displayStatus !== "Cancelled" &&
              (shift.approvedCount ?? 0) < shift.requiredSpots && (
                <Button
                  variant="secondary"
                  onClick={onBroadcast}
                  disabled={isLoading}
                >
                  {t("shift.broadcast")}
                </Button>
              )}
            {!isOwner && workerBroadcastInvited && onAcceptBroadcast && (
              <Button onClick={onAcceptBroadcast} disabled={isLoading}>
                {t("shift.acceptBroadcast")}
              </Button>
            )}
            {isOwner && onCancelShift && shift.displayStatus !== "Cancelled" && (
              <Button
                variant="destructive"
                onClick={onCancelShift}
                disabled={isLoading}
              >
                {t("shift.cancel")}
              </Button>
            )}
          </div>

          {isOwner && onAssignWorker && eligibleAssignees.length > 0 && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("shift.assign")}
              </p>
              <select
                className="flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    onAssignWorker(e.target.value);
                    e.currentTarget.value = "";
                  }
                }}
                disabled={isLoading}
                aria-label={t("shift.assign")}
              >
                <option value="">{t("shift.assign")}…</option>
                {eligibleAssignees.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {(shift.approvedCount ?? 0) < shift.requiredSpots && (
                <StaffingSuggestionsPanel
                  shiftId={shift.id}
                  assignedUserIds={assignments.map((a) => a.userId)}
                  onAssign={onAssignWorker}
                  disabled={isLoading}
                />
              )}
            </div>
          )}

          {isOwner && subscriptions.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {t("shift.applications")}
                </h3>
                {hasBulkActions && (
                  <div className="flex gap-1.5">
                    {onBulkApprove && (
                      <Button
                        size="sm"
                        onClick={() => onBulkApprove(pendingSubscriptionIds)}
                        disabled={isLoading}
                      >
                        {t("shift.approve")} ({pendingSubscriptionIds.length})
                      </Button>
                    )}
                    {onBulkReject && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onBulkReject(pendingSubscriptionIds)}
                        disabled={isLoading}
                      >
                        {t("shift.reject")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <ul className="space-y-2">
                {subscriptions.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{sub.user.name}</p>
                      <p className="text-xs text-slate-500">{sub.status}</p>
                    </div>
                    {sub.status === "PENDING" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => onApprove?.(sub.id)}
                          disabled={isLoading}
                        >
                          {t("shift.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReject?.(sub.id)}
                          disabled={isLoading}
                        >
                          {t("shift.reject")}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isOwner &&
            assignments.length > 0 &&
            new Date(shift.startsAt) < new Date() && (
              <section className="mt-6 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  {t("attendance.title")}
                </h3>
                <ul className="space-y-2">
                  {assignments.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-sm text-slate-800">{a.userName}</span>
                      <div className="flex flex-wrap gap-1">
                        {(["ON_TIME", "LATE", "NO_SHOW", "EXCUSED"] as const).map(
                          (status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => onMarkAttendance?.(a.id, status)}
                              disabled={isLoading}
                              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                                a.attendance === status
                                  ? "bg-indigo-600 text-white"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {t(`attendance.${status}`)}
                            </button>
                          ),
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          <ShiftMessagesPanel shiftId={shift.id} />

          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary">{t("shift.close")}</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/interface/components/ui/button";

export interface RescheduleConflict {
  userId: string;
  userName: string;
}

interface RescheduleConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ReadonlyArray<RescheduleConflict>;
  isPending?: boolean;
  /** Commit the move (drops affected assignments to pending reconfirmation). */
  onConfirm: () => void;
  /** Abandon the move and revert the dragged event to its original slot. */
  onCancel: () => void;
}

/**
 * Shown after an owner drag-reschedules a shift whose new time clashes with
 * assigned workers' other shifts. Lists the affected workers and explains that
 * confirming will move the shift and drop those assignments to "needs
 * reconfirmation". Cancelling reverts the drag entirely.
 */
export function RescheduleConflictDialog({
  open,
  onOpenChange,
  conflicts,
  isPending,
  onConfirm,
  onCancel,
}: RescheduleConflictDialogProps) {
  const t = useTranslations();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Closing via overlay/escape is treated as a cancel so the drag reverts.
        if (!next) onCancel();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="flex items-start gap-3">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600"
              aria-hidden
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-slate-900">
                {t("reschedule.conflictTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600">
                {t("reschedule.conflictBody")}
              </Dialog.Description>
            </div>
          </div>

          <ul className="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {conflicts.map((c) => (
              <li key={c.userId} className="font-medium">
                {c.userName}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onCancel();
                onOpenChange(false);
              }}
              autoFocus
            >
              {t("reschedule.conflictCancel")}
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
            >
              {t("reschedule.conflictConfirm")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { formatTimeRange } from "@/lib/calendar-utils";

export interface AvailabilityItem {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

interface AvailabilityDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availability: AvailabilityItem | null;
  onDelete: () => void;
  isDeleting?: boolean;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function AvailabilityDetailDialog({
  open,
  onOpenChange,
  availability,
  onDelete,
  isDeleting,
}: AvailabilityDetailDialogProps) {
  const t = useTranslations();
  if (!availability) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900">
                {t("availability.title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs uppercase tracking-wide text-violet-700">
                {t("availability.youAreAvailable")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("shift.close")}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
            <p className="font-medium">{formatDate(availability.startsAt)}</p>
            <p className="mt-1 font-mono text-base text-violet-950">
              {formatTimeRange(availability.startsAt, availability.endsAt)}
            </p>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            {t("availability.removeHelp")}
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary" type="button">
                {t("shift.close")}
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isDeleting}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {isDeleting ? t("availability.removing") : t("availability.remove")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

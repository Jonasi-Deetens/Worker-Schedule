"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";

interface BulkRescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of shifts currently selected on the calendar. */
  count: number;
  isPending?: boolean;
  /** Commit the move with a signed minute offset (negative = earlier). */
  onApply: (deltaMinutes: number) => void;
}

/**
 * Lets an owner shift every selected shift by a fixed offset (days + hours +
 * minutes, earlier or later). The offset is converted to signed minutes and
 * handed to `shift.bulkReschedule`, which re-triggers reconfirmation for any
 * assigned workers server-side.
 */
export function BulkRescheduleDialog({
  open,
  onOpenChange,
  count,
  isPending,
  onApply,
}: BulkRescheduleDialogProps) {
  const t = useTranslations();
  const [direction, setDirection] = useState<"later" | "earlier">("later");
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);

  const magnitude = days * 24 * 60 + hours * 60 + minutes;
  const deltaMinutes = direction === "earlier" ? -magnitude : magnitude;
  const canApply = count > 0 && magnitude !== 0 && !isPending;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="text-lg font-semibold text-slate-900">
            {t("bulk.rescheduleTitle")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-600">
            {t("bulk.rescheduleBody", { count })}
          </Dialog.Description>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("bulk.rescheduleDirection")}
            </legend>
            <div className="mt-2 flex gap-2">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
                <input
                  type="radio"
                  name="bulk-direction"
                  value="earlier"
                  checked={direction === "earlier"}
                  onChange={() => setDirection("earlier")}
                />
                {t("bulk.rescheduleEarlier")}
              </label>
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
                <input
                  type="radio"
                  name="bulk-direction"
                  value="later"
                  checked={direction === "later"}
                  onChange={() => setDirection("later")}
                />
                {t("bulk.rescheduleLater")}
              </label>
            </div>
          </fieldset>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="bulk-days">{t("bulk.rescheduleDays")}</Label>
              <Input
                id="bulk-days"
                type="number"
                min={0}
                max={7}
                value={days}
                onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <Label htmlFor="bulk-hours">{t("bulk.rescheduleHours")}</Label>
              <Input
                id="bulk-hours"
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <Label htmlFor="bulk-minutes">{t("bulk.rescheduleMinutes")}</Label>
              <Input
                id="bulk-minutes"
                type="number"
                min={0}
                max={59}
                step={5}
                value={minutes}
                onChange={(e) =>
                  setMinutes(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                {t("shift.close")}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              onClick={() => onApply(deltaMinutes)}
              disabled={!canApply}
            >
              {t("bulk.rescheduleApply")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

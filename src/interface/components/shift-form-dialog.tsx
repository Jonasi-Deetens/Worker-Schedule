"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { cn } from "@/lib/utils";

export interface ShiftFormData {
  date: string;
  startTime: string;
  endTime: string;
  roleLabel: string;
  requiredSpots: number;
  notes?: string;
  repeatWeekly?: boolean;
  repeatUntil?: string;
}

export interface ShiftFormInitial {
  date?: string;
  startTime?: string;
  endTime?: string;
  roleLabel?: string;
  requiredSpots?: number;
  notes?: string;
}

interface ShiftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ShiftFormData) => void;
  isSubmitting?: boolean;
  title?: string;
  mode?: "create" | "edit";
  initialData?: ShiftFormInitial;
  /** When true, the recurrence ("repeat weekly until") block is shown. */
  allowRecurrence?: boolean;
}

export function ShiftFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  title,
  mode = "create",
  initialData,
  allowRecurrence = false,
}: ShiftFormDialogProps) {
  const t = useTranslations();
  const formKey = useId();
  const [repeatWeekly, setRepeatWeekly] = useState(false);

  useEffect(() => {
    if (open) setRepeatWeekly(false);
  }, [open, initialData?.date]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      date: form.get("date") as string,
      startTime: form.get("startTime") as string,
      endTime: form.get("endTime") as string,
      roleLabel: form.get("roleLabel") as string,
      requiredSpots: Number(form.get("requiredSpots")),
      notes: (form.get("notes") as string) || undefined,
      repeatWeekly: repeatWeekly || undefined,
      repeatUntil: repeatWeekly
        ? ((form.get("repeatUntil") as string) || undefined)
        : undefined,
    });
  };

  const resolvedTitle =
    title ?? (mode === "edit" ? t("shift.edit") : t("shift.create"));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none",
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {resolvedTitle}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("shift.close")}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <form
            key={`${formKey}-${initialData?.date ?? ""}-${initialData?.startTime ?? ""}`}
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="date">{t("shift.date")}</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={initialData?.date ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="startTime">{t("shift.start")}</Label>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  defaultValue={initialData?.startTime ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="endTime">{t("shift.end")}</Label>
                <Input
                  id="endTime"
                  name="endTime"
                  type="time"
                  defaultValue={initialData?.endTime ?? ""}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="roleLabel">{t("shift.role")}</Label>
              <Input
                id="roleLabel"
                name="roleLabel"
                placeholder={t("shift.rolePlaceholder")}
                defaultValue={initialData?.roleLabel ?? ""}
                required
              />
            </div>
            <div>
              <Label htmlFor="requiredSpots">{t("shift.requiredSpots")}</Label>
              <Input
                id="requiredSpots"
                name="requiredSpots"
                type="number"
                min={1}
                defaultValue={initialData?.requiredSpots ?? 1}
                required
              />
            </div>
            <div>
              <Label htmlFor="notes">{t("shift.notes")}</Label>
              <Input
                id="notes"
                name="notes"
                placeholder={t("shift.notesPlaceholder")}
                defaultValue={initialData?.notes ?? ""}
              />
            </div>

            {allowRecurrence && mode === "create" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    name="repeatWeekly"
                    checked={repeatWeekly}
                    onChange={(e) => setRepeatWeekly(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t("shift.repeatWeekly")}
                </label>
                {repeatWeekly && (
                  <div className="mt-3">
                    <Label htmlFor="repeatUntil">{t("shift.repeatUntil")}</Label>
                    <Input
                      id="repeatUntil"
                      name="repeatUntil"
                      type="date"
                      required={repeatWeekly}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  {t("shift.close")}
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("shift.saving") : t("shift.save")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface AvailabilityFormData {
  date: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityFormInitial {
  date?: string;
  startTime?: string;
  endTime?: string;
}

interface AvailabilityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AvailabilityFormData) => void;
  isSubmitting?: boolean;
  initialData?: AvailabilityFormInitial;
}

export function AvailabilityFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  initialData,
}: AvailabilityFormDialogProps) {
  const t = useTranslations();
  const formKey = useId();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      date: form.get("date") as string,
      startTime: form.get("startTime") as string,
      endTime: form.get("endTime") as string,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
          <Dialog.Title className="mb-4 text-lg font-semibold">
            {t("calendar.setAvailability")}
          </Dialog.Title>
          <form
            key={`${formKey}-${initialData?.date ?? ""}-${initialData?.startTime ?? ""}`}
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="avail-date">{t("shift.date")}</Label>
              <Input
                id="avail-date"
                name="date"
                type="date"
                defaultValue={initialData?.date ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="avail-start">{t("shift.start")}</Label>
                <Input
                  id="avail-start"
                  name="startTime"
                  type="time"
                  defaultValue={initialData?.startTime ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="avail-end">{t("shift.end")}</Label>
                <Input
                  id="avail-end"
                  name="endTime"
                  type="time"
                  defaultValue={initialData?.endTime ?? ""}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  {t("shift.close")}
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("shift.saving") : t("availability.save")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

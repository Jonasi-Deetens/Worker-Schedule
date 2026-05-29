"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const APPLY_WEEKS = 4;

interface EditingState {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export function AvailabilityTemplatesClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const templatesQuery = trpc.availabilityTemplate.list.useQuery();

  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [editing, setEditing] = useState<EditingState | null>(null);

  const resetForm = () => {
    setEditing(null);
    setDayOfWeek(1);
    setStartTime("09:00");
    setEndTime("17:00");
  };

  const createTemplate = trpc.availabilityTemplate.create.useMutation({
    onSuccess: () => {
      utils.availabilityTemplate.list.invalidate();
      resetForm();
      toast.success(t("availabilityTemplates.created"));
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const updateTemplate = trpc.availabilityTemplate.update.useMutation({
    onSuccess: () => {
      utils.availabilityTemplate.list.invalidate();
      resetForm();
      toast.success(t("availabilityTemplates.updated"));
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const deleteTemplate = trpc.availabilityTemplate.delete.useMutation({
    onSuccess: () => {
      utils.availabilityTemplate.list.invalidate();
      toast.success(t("availabilityTemplates.removed"));
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const materialise = trpc.availabilityTemplate.materialise.useMutation({
    onSuccess: (data) => {
      utils.availability.list.invalidate();
      toast.success(
        t("availabilityTemplates.applied", { count: data?.count ?? 0 }),
      );
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (startTime >= endTime) {
      toast.error(t("errors.endBeforeStart"));
      return;
    }
    if (editing) {
      updateTemplate.mutate({ id: editing.id, dayOfWeek, startTime, endTime });
    } else {
      createTemplate.mutate({ dayOfWeek, startTime, endTime });
    }
  };

  const startEdit = (tpl: {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }) => {
    setEditing({
      id: tpl.id,
      dayOfWeek: tpl.dayOfWeek,
      startTime: tpl.startTime,
      endTime: tpl.endTime,
    });
    setDayOfWeek(tpl.dayOfWeek);
    setStartTime(tpl.startTime);
    setEndTime(tpl.endTime);
  };

  const handleApply = () => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + APPLY_WEEKS * 7);
    materialise.mutate({ from, to });
  };

  const templates = templatesQuery.data ?? [];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t("availabilityTemplates.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t("availabilityTemplates.subtitle")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleApply}
            disabled={materialise.isPending || templates.length === 0}
            title={t("availabilityTemplates.applyHelp")}
          >
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            {t("availabilityTemplates.apply")}
          </Button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            {editing
              ? t("availabilityTemplates.editTitle")
              : t("availabilityTemplates.addTitle")}
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[160px] flex-1">
              <Label htmlFor="tpl-day">{t("availabilityTemplates.day")}</Label>
              <select
                id="tpl-day"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="mt-1 flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`availabilityTemplates.weekdays.${d}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="tpl-start">
                {t("availabilityTemplates.start")}
              </Label>
              <Input
                id="tpl-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="tpl-end">{t("availabilityTemplates.end")}</Label>
              <Input
                id="tpl-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSaving}>
                {editing ? (
                  <>
                    <Pencil className="mr-1 h-4 w-4" />
                    {t("availabilityTemplates.save")}
                  </>
                ) : (
                  <>
                    <Plus className="mr-1 h-4 w-4" />
                    {t("availabilityTemplates.add")}
                  </>
                )}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  <X className="mr-1 h-4 w-4" />
                  {t("availabilityTemplates.cancel")}
                </Button>
              )}
            </div>
          </div>
        </form>

        <section className="mt-6">
          {templatesQuery.isLoading && (
            <p className="text-sm text-slate-500">{t("hours.loading")}</p>
          )}
          {!templatesQuery.isLoading && templates.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              {t("availabilityTemplates.empty")}
            </p>
          )}
          <ul className="space-y-2">
            {templates.map((tpl) => (
              <li
                key={tpl.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex min-w-[5.5rem] justify-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                    {t(`availabilityTemplates.weekdays.${tpl.dayOfWeek}`)}
                  </span>
                  <span className="font-medium text-slate-900">
                    {tpl.startTime}–{tpl.endTime}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(tpl)}
                    aria-label={t("availabilityTemplates.editTitle")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTemplate.mutate({ id: tpl.id })}
                    disabled={deleteTemplate.isPending}
                    aria-label={t("availabilityTemplates.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

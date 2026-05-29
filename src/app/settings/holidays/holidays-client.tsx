"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

interface HolidayEntry {
  date: string;
  name: string;
  custom: boolean;
  id?: string;
}

export function HolidaysClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(currentYear);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const holidaysQuery = trpc.holiday.list.useQuery({ year });

  const addHoliday = trpc.holiday.add.useMutation({
    onSuccess: () => {
      utils.holiday.list.invalidate();
      setDate("");
      setName("");
      toast.success(t("holidays.saved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const removeHoliday = trpc.holiday.remove.useMutation({
    onSuccess: () => {
      utils.holiday.list.invalidate();
      toast.success(t("holidays.removed"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const holidays = (holidaysQuery.data ?? []) as HolidayEntry[];
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("holidays.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("holidays.subtitle")}</p>

        <div className="mt-4 flex items-center gap-2">
          <Label htmlFor="holiday-year" className="text-sm">
            {t("holidays.year")}
          </Label>
          <select
            id="holiday-year"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!date || !name.trim()) return;
            addHoliday.mutate({ date: new Date(date), name: name.trim() });
          }}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="min-w-[160px]">
            <Label htmlFor="holiday-date">{t("holidays.date")}</Label>
            <Input
              id="holiday-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="holiday-name">{t("holidays.name")}</Label>
            <Input
              id="holiday-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <Button type="submit" disabled={addHoliday.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            {t("holidays.add")}
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">{t("holidays.help")}</p>

        <section className="mt-6">
          {holidaysQuery.isLoading && (
            <p className="text-sm text-slate-500">{t("hours.loading")}</p>
          )}
          <ul className="space-y-2">
            {holidays.map((holiday) => (
              <li
                key={holiday.date}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />
                  <span className="font-medium text-slate-900">
                    {new Date(holiday.date).toLocaleDateString(undefined, {
                      timeZone: "UTC",
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="text-sm text-slate-600">{holiday.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      holiday.custom
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {holiday.custom
                      ? t("holidays.custom")
                      : t("holidays.statutory")}
                  </span>
                </div>
                {holiday.custom && holiday.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeHoliday.mutate({ id: holiday.id! })}
                    disabled={removeHoliday.isPending}
                    aria-label={t("holidays.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

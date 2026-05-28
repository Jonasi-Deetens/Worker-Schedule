"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { AppHeader } from "@/interface/components/app-header";
import { trpc } from "@/interface/trpc/client";

function startOfWeekMon(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function HoursClient() {
  const t = useTranslations();
  const now = useMemo(() => new Date(), []);
  const weekRange = useMemo(() => {
    const from = startOfWeekMon(now);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }, [now]);
  const monthRange = useMemo(() => {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to };
  }, [now]);
  const yearRange = useMemo(() => {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear() + 1, 0, 1);
    return { from, to };
  }, [now]);

  const week = trpc.me.hours.useQuery(weekRange);
  const month = trpc.me.hours.useQuery(monthRange);
  const year = trpc.me.hours.useQuery(yearRange);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("hours.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("hours.subtitle")}</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card label={t("hours.thisWeek")} value={week.data?.total ?? null} loading={week.isLoading} />
          <Card label={t("hours.thisMonth")} value={month.data?.total ?? null} loading={month.isLoading} />
          <Card label={t("hours.thisYear")} value={year.data?.total ?? null} loading={year.isLoading} />
        </div>
      </main>
    </div>
  );
}

function Card({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">
        {loading ? "…" : value?.toFixed(1) ?? "0"}
        <span className="ml-1 text-base text-slate-500">h</span>
      </p>
    </div>
  );
}

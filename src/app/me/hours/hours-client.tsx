"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { AppHeader } from "@/interface/components/app-header";
import { trpc } from "@/interface/trpc/client";
import { formatDuration } from "@/lib/format-duration";
import { addWeeks, resolveLocalTimeZone, startOfWeek } from "@/lib/week";

export function HoursClient() {
  const t = useTranslations();
  const now = useMemo(() => new Date(), []);
  const weekRange = useMemo(() => {
    // Use the shared week helper (Monday start, browser timezone) so the
    // week boundary matches how analytics/payroll bucket the same week.
    const from = startOfWeek(now, 1, resolveLocalTimeZone());
    return { from, to: addWeeks(from, 1) };
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
  const recent = trpc.timeClock.listMine.useQuery(monthRange);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("hours.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("hours.subtitle")}</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card
            label={t("hours.thisWeek")}
            scheduled={week.data?.scheduled ?? null}
            worked={week.data?.worked ?? null}
            loading={week.isLoading}
            t={t}
          />
          <Card
            label={t("hours.thisMonth")}
            scheduled={month.data?.scheduled ?? null}
            worked={month.data?.worked ?? null}
            loading={month.isLoading}
            t={t}
          />
          <Card
            label={t("hours.thisYear")}
            scheduled={year.data?.scheduled ?? null}
            worked={year.data?.worked ?? null}
            loading={year.isLoading}
            t={t}
          />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("hours.recentEntries")}
          </h2>
          {recent.isLoading && (
            <p className="mt-3 text-sm text-slate-500">{t("hours.loading")}</p>
          )}
          {!recent.isLoading && (recent.data?.length ?? 0) === 0 && (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {t("hours.noEntries")}
            </p>
          )}
          {(recent.data?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-2">
              {recent.data!.map((entry) => {
                const gross = entry.clockOutAt
                  ? Math.round(
                      (new Date(entry.clockOutAt).getTime() -
                        new Date(entry.clockInAt).getTime()) /
                        60000,
                    )
                  : 0;
                const net = Math.max(0, gross - entry.breakMinutes);
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {new Date(entry.clockInAt).toLocaleDateString()}
                        {entry.shift ? ` · ${entry.shift.roleLabel}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(entry.clockInAt).toLocaleTimeString()}
                        {entry.clockOutAt
                          ? ` → ${new Date(entry.clockOutAt).toLocaleTimeString()}`
                          : ` · ${t("hours.open")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-700">
                        {entry.clockOutAt ? formatDuration(net) : "—"}
                      </p>
                      <StatusPill status={entry.status} t={t} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: "PENDING" | "APPROVED" | "REJECTED";
  t: ReturnType<typeof useTranslations>;
}) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-rose-100 text-rose-800",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {t(`hours.status.${status}`)}
    </span>
  );
}

function Card({
  label,
  scheduled,
  worked,
  loading,
  t,
}: {
  label: string;
  scheduled: number | null;
  worked: number | null;
  loading: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {t("hours.scheduled")}
        </p>
        <p className="text-2xl font-bold text-slate-900">
          {loading ? "…" : formatDuration(Math.round((scheduled ?? 0) * 60))}
        </p>
      </div>
      <div className="mt-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {t("hours.worked")}
        </p>
        <p className="text-2xl font-bold text-emerald-600">
          {loading ? "…" : formatDuration(Math.round((worked ?? 0) * 60))}
        </p>
      </div>
    </div>
  );
}

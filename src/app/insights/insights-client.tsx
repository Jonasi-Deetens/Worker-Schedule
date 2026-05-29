"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

const WEEK_OPTIONS = [4, 8, 12, 26, 52];

export function InsightsClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const [weeks, setWeeks] = useState(12);
  const { data, isLoading } = trpc.analytics.weekly.useQuery({ weeks });

  const setRevenue = trpc.analytics.setRevenue.useMutation({
    onSuccess: () => {
      utils.analytics.weekly.invalidate();
      toast.success(t("insights.revenueSaved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const fmtHours = (n: number) => `${n.toFixed(1)}h`;
  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
  const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

  const totals =
    data?.reduce(
      (acc, row) => ({
        scheduled: acc.scheduled + row.scheduledHours,
        filled: acc.filled + row.filledHours,
        actual: acc.actual + row.actualHours,
        cost: acc.cost + row.labourCost,
        revenue: acc.revenue + (row.revenue ?? 0),
      }),
      { scheduled: 0, filled: 0, actual: 0, cost: 0, revenue: 0 },
    ) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t("insights.title")}
          </h1>
          <p className="text-sm text-slate-600">{t("insights.subtitle")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          {t("insights.range")}
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1"
          >
            {WEEK_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {t("insights.weeksOption", { count: w })}
              </option>
            ))}
          </select>
        </label>
      </header>

      {totals && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label={t("insights.scheduled")} value={fmtHours(totals.scheduled)} />
          <KpiCard label={t("insights.actual")} value={fmtHours(totals.actual)} />
          <KpiCard
            label={t("insights.fillRate")}
            value={fmtPct(
              totals.scheduled > 0 ? totals.filled / totals.scheduled : 0,
            )}
          />
          <KpiCard label={t("insights.labourCost")} value={fmtMoney(totals.cost)} />
          <KpiCard
            label={t("insights.costRevenue")}
            value={
              totals.revenue > 0 ? fmtPct(totals.cost / totals.revenue) : "—"
            }
          />
        </section>
      )}

      <section className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{t("insights.week")}</th>
              <th className="px-3 py-2 text-right">{t("insights.scheduled")}</th>
              <th className="px-3 py-2 text-right">{t("insights.filled")}</th>
              <th className="px-3 py-2 text-right">{t("insights.actual")}</th>
              <th className="px-3 py-2 text-right">{t("insights.variance")}</th>
              <th className="px-3 py-2 text-right">{t("insights.fillRate")}</th>
              <th className="px-3 py-2 text-right">{t("insights.cost")}</th>
              <th className="px-3 py-2 text-right">{t("insights.revenue")}</th>
              <th className="px-3 py-2 text-right">{t("insights.costToRevenue")}</th>
              <th className="px-3 py-2 text-right">{t("insights.noShow")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  {t("insights.loading")}
                </td>
              </tr>
            )}
            {data?.map((row) => (
              <tr key={row.weekStart} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">
                  {row.weekStart}
                </td>
                <td className="px-3 py-2 text-right">{fmtHours(row.scheduledHours)}</td>
                <td className="px-3 py-2 text-right">{fmtHours(row.filledHours)}</td>
                <td className="px-3 py-2 text-right">{fmtHours(row.actualHours)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.actualVariance < 0
                      ? "text-rose-600"
                      : row.actualVariance > 0
                        ? "text-emerald-600"
                        : "text-slate-500"
                  }`}
                >
                  {row.actualVariance > 0 ? "+" : ""}
                  {fmtHours(row.actualVariance)}
                </td>
                <td className="px-3 py-2 text-right">{fmtPct(row.fillRate)}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(row.labourCost)}</td>
                <td className="px-3 py-2 text-right">
                  <RevenueCell
                    initial={row.revenue}
                    pending={setRevenue.isPending}
                    onSave={(amount) =>
                      setRevenue.mutate({
                        weekStart: new Date(row.weekStart),
                        amount,
                      })
                    }
                    placeholder={t("insights.revenueAdd")}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {row.costToRevenue !== null
                    ? fmtPct(row.costToRevenue)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.attendanceMarked > 0
                    ? `${row.noShows} (${fmtPct(row.noShowRate)})`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

/** Inline revenue editor: commits on blur or Enter. Empty clears the value. */
function RevenueCell({
  initial,
  onSave,
  pending,
  placeholder,
}: {
  initial: number | null;
  onSave: (amount: number | null) => void;
  pending: boolean;
  placeholder: string;
}) {
  const [value, setValue] = useState(initial !== null ? String(initial) : "");

  const commit = () => {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    const current = initial;
    if (next === current) return;
    if (next !== null && Number.isNaN(next)) return;
    onSave(next);
  };

  return (
    <input
      type="number"
      min={0}
      inputMode="decimal"
      disabled={pending}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder={placeholder}
      className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    />
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { trpc } from "@/interface/trpc/client";

const WEEK_OPTIONS = [4, 8, 12, 26, 52];

export function InsightsClient() {
  const [weeks, setWeeks] = useState(12);
  const { data, isLoading } = trpc.analytics.weekly.useQuery({ weeks });

  const fmtHours = (n: number) => `${n.toFixed(1)}h`;
  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
  const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

  const totals =
    data?.reduce(
      (acc, row) => ({
        scheduled: acc.scheduled + row.scheduledHours,
        filled: acc.filled + row.filledHours,
        cost: acc.cost + row.labourCost,
        revenue: acc.revenue + (row.revenue ?? 0),
      }),
      { scheduled: 0, filled: 0, cost: 0, revenue: 0 },
    ) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Insights</h1>
          <p className="text-sm text-slate-600">
            Fill rate, labour cost and cost-to-revenue trends.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Range
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1"
          >
            {WEEK_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </label>
      </header>

      {totals && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Scheduled" value={fmtHours(totals.scheduled)} />
          <KpiCard
            label="Fill rate"
            value={fmtPct(
              totals.scheduled > 0 ? totals.filled / totals.scheduled : 0,
            )}
          />
          <KpiCard label="Labour cost" value={fmtMoney(totals.cost)} />
          <KpiCard
            label="Cost / revenue"
            value={
              totals.revenue > 0 ? fmtPct(totals.cost / totals.revenue) : "—"
            }
          />
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Week</th>
              <th className="px-3 py-2 text-right">Scheduled</th>
              <th className="px-3 py-2 text-right">Filled</th>
              <th className="px-3 py-2 text-right">Fill rate</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cost/rev</th>
              <th className="px-3 py-2 text-right">No-show</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Loading…
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
                <td className="px-3 py-2 text-right">{fmtPct(row.fillRate)}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(row.labourCost)}</td>
                <td className="px-3 py-2 text-right">
                  {row.revenue !== null ? fmtMoney(row.revenue) : "—"}
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { formatDuration } from "@/lib/format-duration";

type Tab = "pending" | "approved";

function grossMinutesOf(entry: {
  clockInAt: string | Date;
  clockOutAt: string | Date | null;
}): number {
  if (!entry.clockOutAt || !entry.clockInAt) return 0;
  return Math.max(
    0,
    Math.round(
      (new Date(entry.clockOutAt).getTime() -
        new Date(entry.clockInAt).getTime()) /
        60000,
    ),
  );
}

export function TimeEntriesClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("pending");
  const pending = trpc.timeClock.listPending.useQuery();
  const approved = trpc.timeClock.listApproved.useQuery(undefined, {
    enabled: tab === "approved",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const approve = trpc.timeClock.approve.useMutation({
    onSuccess: () => {
      utils.timeClock.listPending.invalidate();
      utils.timeClock.listApproved.invalidate();
      setSelected(new Set());
      toast.success(t("toast.timeEntriesApproved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pendingItems = pending.data ?? [];
  const approvedItems = approved.data ?? [];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t("payroll.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t("payroll.subtitle")}
            </p>
          </div>
          {tab === "pending" && (
            <Button
              disabled={selected.size === 0 || approve.isPending}
              onClick={() => approve.mutate({ ids: [...selected] })}
            >
              <Check className="mr-1 h-4 w-4" />
              {t("clock.approveSelected")} ({selected.size})
            </Button>
          )}
        </div>

        <div
          role="tablist"
          aria-label={t("payroll.title")}
          className="mt-5 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
        >
          {(["pending", "approved"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                tab === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {key === "pending"
                ? t("payroll.tabPending")
                : t("payroll.tabApproved")}
            </button>
          ))}
        </div>

        {tab === "pending" ? (
          <>
            {pending.isLoading && (
              <p className="mt-6 text-sm text-slate-500">
                {t("hours.loading")}
              </p>
            )}
            {!pending.isLoading && pendingItems.length === 0 && (
              <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                {t("clock.noPending")}
              </p>
            )}
            {pendingItems.length > 0 && (
              <ul className="mt-6 space-y-2">
                {pendingItems.map((entry) => {
                  const grossMinutes = grossMinutesOf(entry);
                  const netMinutes = Math.max(
                    0,
                    grossMinutes - entry.breakMinutes,
                  );
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <label className="flex flex-1 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          onChange={() => toggle(entry.id)}
                        />
                        <span>
                          <span className="block font-medium text-slate-900">
                            {entry.user.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {new Date(entry.clockInAt).toLocaleString()}
                            {entry.clockOutAt
                              ? ` → ${new Date(entry.clockOutAt).toLocaleString()}`
                              : ""}
                            {entry.shift ? ` · ${entry.shift.roleLabel}` : ""}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {t("payroll.grossHours", {
                              value: formatDuration(grossMinutes),
                            })}
                            {" · "}
                            {t("payroll.breakMinutes", {
                              value: formatDuration(entry.breakMinutes),
                            })}
                          </span>
                          {entry.notes && (
                            <span className="mt-0.5 block text-xs italic text-slate-400">
                              {entry.notes}
                            </span>
                          )}
                        </span>
                      </label>
                      <span className="text-right">
                        <span className="block text-sm font-semibold text-slate-700">
                          {formatDuration(netMinutes)}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                          {t("payroll.netLabel")}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <>
            {approved.isLoading && (
              <p className="mt-6 text-sm text-slate-500">
                {t("hours.loading")}
              </p>
            )}
            {!approved.isLoading && approvedItems.length === 0 && (
              <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                {t("payroll.noApproved")}
              </p>
            )}
            {approvedItems.length > 0 && (
              <ul className="mt-6 space-y-2">
                {approvedItems.map((entry) => {
                  const grossMinutes = grossMinutesOf(entry);
                  const netMinutes = Math.max(
                    0,
                    grossMinutes - entry.breakMinutes,
                  );
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <span className="flex-1">
                        <span className="block font-medium text-slate-900">
                          {entry.user.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {new Date(entry.clockInAt).toLocaleString()}
                          {entry.clockOutAt
                            ? ` → ${new Date(entry.clockOutAt).toLocaleString()}`
                            : ""}
                          {entry.shift ? ` · ${entry.shift.roleLabel}` : ""}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {t("payroll.grossHours", {
                            value: formatDuration(grossMinutes),
                          })}
                          {" · "}
                          {t("payroll.breakMinutes", {
                            value: formatDuration(entry.breakMinutes),
                          })}
                        </span>
                        {entry.approvedAt && (
                          <span className="mt-0.5 block text-xs text-emerald-600">
                            {t("payroll.approvedMeta", {
                              name: entry.approvedBy?.name ?? "—",
                              date: new Date(
                                entry.approvedAt,
                              ).toLocaleDateString(),
                            })}
                          </span>
                        )}
                        {entry.notes && (
                          <span className="mt-0.5 block text-xs italic text-slate-400">
                            {entry.notes}
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold text-slate-700">
                          {formatDuration(netMinutes)}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                          {t("payroll.netLabel")}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

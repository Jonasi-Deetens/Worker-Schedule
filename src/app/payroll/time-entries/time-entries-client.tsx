"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, X } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { formatDuration } from "@/lib/format-duration";

type Tab = "pending" | "approved";

interface EditState {
  clockInAt: string;
  clockOutAt: string;
  breakMinutes: number;
  notes: string;
}

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

/** Formats a date for a `datetime-local` input in the viewer's local zone. */
function toLocalInput(value: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function TimeEntriesClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("pending");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const rangeInput = useMemo(() => {
    if (!filterFrom && !filterTo) return undefined;
    return {
      ...(filterFrom ? { from: new Date(filterFrom) } : {}),
      ...(filterTo ? { to: new Date(`${filterTo}T23:59:59`) } : {}),
    };
  }, [filterFrom, filterTo]);

  const pending = trpc.timeClock.listPending.useQuery(rangeInput);
  const approved = trpc.timeClock.listApproved.useQuery(rangeInput, {
    enabled: tab === "approved",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  const invalidate = () => {
    utils.timeClock.listPending.invalidate();
    utils.timeClock.listApproved.invalidate();
    setSelected(new Set());
  };

  const approve = trpc.timeClock.approve.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("toast.timeEntriesApproved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const reject = trpc.timeClock.reject.useMutation({
    onSuccess: () => {
      invalidate();
      setRejectReason("");
      toast.success(t("toast.timeEntriesRejected"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const update = trpc.timeClock.update.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEdit(null);
      toast.success(t("toast.timeEntryUpdated"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const startEdit = (entry: {
    id: string;
    clockInAt: string | Date;
    clockOutAt: string | Date | null;
    breakMinutes: number;
    notes: string | null;
  }) => {
    setEditingId(entry.id);
    setEdit({
      clockInAt: toLocalInput(entry.clockInAt),
      clockOutAt: toLocalInput(entry.clockOutAt),
      breakMinutes: entry.breakMinutes,
      notes: entry.notes ?? "",
    });
  };

  const saveEdit = (id: string) => {
    if (!edit) return;
    update.mutate({
      id,
      clockInAt: edit.clockInAt ? new Date(edit.clockInAt) : undefined,
      clockOutAt: edit.clockOutAt ? new Date(edit.clockOutAt) : undefined,
      breakMinutes: edit.breakMinutes,
      notes: edit.notes || null,
    });
  };

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
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={selected.size === 0 || approve.isPending}
                onClick={() => approve.mutate({ ids: [...selected] })}
              >
                <Check className="mr-1 h-4 w-4" />
                {t("clock.approveSelected")} ({selected.size})
              </Button>
              <Button
                variant="destructive"
                disabled={selected.size === 0 || reject.isPending}
                onClick={() =>
                  reject.mutate({
                    ids: [...selected],
                    reason: rejectReason || undefined,
                  })
                }
              >
                <X className="mr-1 h-4 w-4" />
                {t("payroll.rejectSelected")} ({selected.size})
              </Button>
            </div>
          )}
        </div>

        {/* Date-range filter */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="filterFrom">{t("payroll.filterFrom")}</Label>
            <Input
              id="filterFrom"
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="filterTo">{t("payroll.filterTo")}</Label>
            <Input
              id="filterTo"
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          {(filterFrom || filterTo) && (
            <button
              type="button"
              onClick={() => {
                setFilterFrom("");
                setFilterTo("");
              }}
              className="pb-2 text-sm text-slate-500 underline hover:text-slate-700"
            >
              {t("payroll.clearFilter")}
            </button>
          )}
          {tab === "pending" && (
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="rejectReason">{t("payroll.rejectReason")}</Label>
              <Input
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t("payroll.rejectReasonPlaceholder")}
              />
            </div>
          )}
        </div>

        <ExportPanel />

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
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
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
                      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
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
                        <div className="flex items-center gap-3">
                          <span className="text-right">
                            <span className="block text-sm font-semibold text-slate-700">
                              {formatDuration(netMinutes)}
                            </span>
                            <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                              {t("payroll.netLabel")}
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              editingId === entry.id
                                ? setEditingId(null)
                                : startEdit(entry)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {editingId === entry.id && edit && (
                        <div className="mt-4 grid grid-cols-1 gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`in-${entry.id}`}>
                              {t("payroll.editClockIn")}
                            </Label>
                            <Input
                              id={`in-${entry.id}`}
                              type="datetime-local"
                              value={edit.clockInAt}
                              onChange={(e) =>
                                setEdit({ ...edit, clockInAt: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`out-${entry.id}`}>
                              {t("payroll.editClockOut")}
                            </Label>
                            <Input
                              id={`out-${entry.id}`}
                              type="datetime-local"
                              value={edit.clockOutAt}
                              onChange={(e) =>
                                setEdit({ ...edit, clockOutAt: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`break-${entry.id}`}>
                              {t("payroll.editBreak")}
                            </Label>
                            <Input
                              id={`break-${entry.id}`}
                              type="number"
                              min={0}
                              value={edit.breakMinutes}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  breakMinutes: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`notes-${entry.id}`}>
                              {t("payroll.editNotes")}
                            </Label>
                            <Input
                              id={`notes-${entry.id}`}
                              value={edit.notes}
                              onChange={(e) =>
                                setEdit({ ...edit, notes: e.target.value })
                              }
                            />
                          </div>
                          <div className="sm:col-span-2 flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null);
                                setEdit(null);
                              }}
                            >
                              {t("payroll.editCancel")}
                            </Button>
                            <Button
                              size="sm"
                              disabled={update.isPending}
                              onClick={() => saveEdit(entry.id)}
                            >
                              {t("payroll.editSave")}
                            </Button>
                          </div>
                        </div>
                      )}
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

type Provider = "sdworx" | "securex" | "generic";

/**
 * Builds a `/api/payroll` download link from a from/to range and provider, and
 * triggers a CSV download. The route is owner/manager-gated server-side.
 */
function ExportPanel() {
  const t = useTranslations();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [provider, setProvider] = useState<Provider>("generic");

  const download = () => {
    const params = new URLSearchParams({ provider });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.location.href = `/api/payroll?${params.toString()}`;
  };

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        {t("payroll.exportTitle")}
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">{t("payroll.exportHelp")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="exportFrom">{t("payroll.filterFrom")}</Label>
          <Input
            id="exportFrom"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="exportTo">{t("payroll.filterTo")}</Label>
          <Input
            id="exportTo"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="exportProvider">{t("payroll.provider")}</Label>
          <select
            id="exportProvider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="block h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <option value="generic">{t("payroll.providerGeneric")}</option>
            <option value="sdworx">SD Worx</option>
            <option value="securex">Securex</option>
          </select>
        </div>
        <Button onClick={download}>{t("payroll.export")}</Button>
      </div>
    </section>
  );
}

"use client";

import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";

/**
 * Known actions are derived from the Prisma enum at the call-site. We keep
 * the list literal here so the dropdown is deterministic and doesn't depend
 * on a runtime query; new enum values just need to be appended.
 */
const ACTIONS = [
  "SHIFT_CREATED",
  "SHIFT_UPDATED",
  "SHIFT_DELETED",
  "SHIFT_PUBLISHED",
  "SHIFT_ASSIGNED",
  "SHIFT_BROADCAST_SENT",
  "SUBSCRIPTION_APPLIED",
  "SUBSCRIPTION_APPROVED",
  "SUBSCRIPTION_REJECTED",
  "SUBSCRIPTION_WITHDRAWN",
  "AVAILABILITY_SET",
  "AVAILABILITY_DELETED",
  "TIME_ENTRY_APPROVED",
  "DIMONA_DECLARED",
  "ATTENDANCE_MARKED",
] as const;

export function AuditViewer() {
  const t = useTranslations();
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [fromStr, setFromStr] = useState("");
  const [toStr, setToStr] = useState("");

  const filters = useMemo(
    () => ({
      q: q || undefined,
      action: action || undefined,
      userId: userId || undefined,
      from: fromStr ? new Date(fromStr) : undefined,
      to: toStr ? new Date(toStr) : undefined,
      take: 100,
    }),
    [q, action, userId, fromStr, toStr],
  );

  const search = trpc.audit.search.useQuery(filters, {
    placeholderData: (prev) => prev,
  });
  const members = trpc.audit.members.useQuery();

  const events = search.data?.events ?? [];
  const isEmpty = !search.isLoading && events.length === 0;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("audit.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("audit.subtitle")}</p>

        <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("audit.search")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2"
          />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">{t("audit.allActions")}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">{t("audit.allUsers")}</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 sm:col-span-1">
            <input
              type="date"
              value={fromStr}
              onChange={(e) => setFromStr(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              aria-label={t("audit.from")}
            />
            <input
              type="date"
              value={toStr}
              onChange={(e) => setToStr(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              aria-label={t("audit.to")}
            />
          </div>
          {(q || action || userId || fromStr || toStr) && (
            <div className="sm:col-span-5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQ("");
                  setAction("");
                  setUserId("");
                  setFromStr("");
                  setToStr("");
                }}
              >
                {t("audit.clear")}
              </Button>
            </div>
          )}
        </div>

        {isEmpty ? (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {t("audit.empty")}
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-1/3 px-3 py-2">{t("audit.action")}</th>
                  <th className="w-1/4 px-3 py-2">{t("audit.user")}</th>
                  <th className="w-1/4 px-3 py-2">{t("audit.entity")}</th>
                  <th className="w-1/6 px-3 py-2">{t("audit.when")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {event.action}
                    </td>
                    <td className="px-3 py-2">{event.user?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-slate-500">
                        {event.entityType}
                      </span>{" "}
                      <span className="font-mono text-[11px] text-slate-400">
                        {event.entityId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {formatDistanceToNow(new Date(event.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

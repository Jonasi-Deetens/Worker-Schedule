"use client";

import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";

/**
 * Full list of `AuditAction` enum values, kept in sync with
 * `prisma/schema.prisma`. We keep the list literal here so the dropdown is
 * deterministic and doesn't depend on a runtime query; new enum values must be
 * appended both here and to the `audit.actions.*` i18n labels.
 */
const ACTIONS = [
  "SHIFT_CREATED",
  "SHIFT_UPDATED",
  "SHIFT_DELETED",
  "SHIFT_PUBLISHED",
  "SHIFT_ASSIGNED",
  "SUBSCRIPTION_APPLIED",
  "SUBSCRIPTION_APPROVED",
  "SUBSCRIPTION_REJECTED",
  "SUBSCRIPTION_WITHDRAWN",
  "AVAILABILITY_SET",
  "AVAILABILITY_DELETED",
  "INVITE_SENT",
  "INVITE_ACCEPTED",
  "WORKER_SUSPENDED",
  "WORKER_REACTIVATED",
  "WORKER_ARCHIVED",
  "TIMEOFF_REQUESTED",
  "TIMEOFF_APPROVED",
  "TIMEOFF_REJECTED",
  "TIMEOFF_CANCELLED",
  "TIMEOFF_UPDATED",
  "TIMEOFF_REVOKED",
  "SWAP_REQUESTED",
  "SWAP_DECIDED",
  "TIME_ENTRY_APPROVED",
  "TIME_ENTRY_REJECTED",
  "TIME_ENTRY_EDITED",
  "DIMONA_DECLARED",
  "DIMONA_CANCELLED",
  "DIMONA_OUT_DECLARED",
  "CONTRACT_SENT",
  "CONTRACT_SIGNED",
  "CONTRACT_DECLINED",
  "WORKER_PROFILE_UPDATED",
  "BUSINESS_SETTINGS_UPDATED",
  "ATTENDANCE_MARKED",
  "SHIFT_BROADCAST_SENT",
  "SHIFT_RESCHEDULE_PENDING",
  "SHIFT_RECONFIRMED",
  "SHIFT_RECONFIRM_DECLINED",
  "SHIFT_ASSIGNMENT_ACCEPTED",
  "SHIFT_ASSIGNMENT_DECLINED",
  "GDPR_DELETE_REQUESTED",
  "GDPR_PURGED",
] as const;

/**
 * Localised label for an audit action, falling back to the raw enum value for
 * any action not yet translated (so the UI never shows an empty cell).
 */
function useActionLabel() {
  const t = useTranslations("audit.actions");
  return (action: string) => {
    const label = t(action as never);
    return label === `audit.actions.${action}` ? action : label;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fmtMaybeDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * Surfaces the human-relevant parts of an audit event's metadata: the change
 * reason and, for hour corrections (`TIME_ENTRY_EDITED`), the before→after
 * snapshot so who/when/reason/before→after is visible directly in the trail.
 */
function AuditDetails({ metadata }: { metadata: unknown }) {
  const t = useTranslations("audit");
  const meta = asRecord(metadata);
  if (!meta) return null;
  const reason = typeof meta.reason === "string" ? meta.reason : null;
  const hasBeforeAfter =
    "prevClockInAt" in meta || "newClockInAt" in meta || "clockInAt" in meta;
  if (!reason && !hasBeforeAfter) return null;

  return (
    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
      {reason && (
        <p>
          <span className="font-medium">{t("metaReason")}:</span> {reason}
        </p>
      )}
      {"prevClockInAt" in meta && (
        <p>
          <span className="font-medium">{t("metaBefore")}:</span>{" "}
          {fmtMaybeDate(meta.prevClockInAt)} → {fmtMaybeDate(meta.prevClockOutAt)}
          {typeof meta.prevBreakMinutes === "number"
            ? ` · ${meta.prevBreakMinutes}m`
            : ""}
        </p>
      )}
      {"clockInAt" in meta && (
        <p>
          <span className="font-medium">{t("metaAfter")}:</span>{" "}
          {fmtMaybeDate(meta.clockInAt)} → {fmtMaybeDate(meta.clockOutAt)}
          {typeof meta.breakMinutes === "number"
            ? ` · ${meta.breakMinutes}m`
            : ""}
        </p>
      )}
    </div>
  );
}

export function AuditViewer() {
  const t = useTranslations();
  const actionLabel = useActionLabel();
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
                {actionLabel(a)}
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
          <div className="mt-4 overflow-x-auto rounded-2xl border border-hairline bg-white shadow-card">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
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
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-700">
                        {actionLabel(event.action)}
                      </span>
                      <AuditDetails metadata={event.metadata} />
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { GraduationCap } from "lucide-react";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

interface QuotaUsage {
  year: number;
  limit: number;
  reservedHours: number;
  workedHours: number;
  attestationBalanceHours: number | null;
  usedHours: number;
  remainingHours: number;
  percentUsed: number;
  level: "ok" | "warn80" | "warn95" | "exceeded";
}

interface RegionalAdvisory {
  region: string;
  limitType: "quarter" | "month" | "none";
  limitHours: number;
  periods: { label: string; hours: number; limit: number; exceeded: boolean }[];
}

interface AttestationStatus {
  required: boolean;
  maxAgeDays: number;
  present: boolean;
  uploadedAt: string | Date | null;
  stale: boolean;
}

interface QuotaResponse {
  usage: QuotaUsage;
  region: string | null;
  regional: RegionalAdvisory | null;
  attestation: AttestationStatus;
}

const LEVEL_BAR: Record<QuotaUsage["level"], string> = {
  ok: "bg-emerald-500",
  warn80: "bg-amber-500",
  warn95: "bg-orange-500",
  exceeded: "bg-rose-600",
};

/**
 * Belgian student-worker 650h/year quota widget. In `self` mode it reads the
 * calling user's quota; in `manager` mode it reads a specific worker's quota and
 * lets a manager enter the national remaining balance from the Student@Work
 * attestation (which is not API-readable).
 */
export function StudentQuotaWidget(
  props: { mode: "self" } | { mode: "manager"; userId: string },
) {
  const t = useTranslations();
  const utils = trpc.useUtils();

  const mineQuery = trpc.quota.mine.useQuery(undefined, {
    enabled: props.mode === "self",
  });
  const workerQuery = trpc.quota.forWorker.useQuery(
    { userId: props.mode === "manager" ? props.userId : "" },
    { enabled: props.mode === "manager" },
  );

  const data = (
    props.mode === "self" ? mineQuery.data : workerQuery.data
  ) as QuotaResponse | null | undefined;

  const [balance, setBalance] = useState("");
  useEffect(() => {
    if (data?.usage.attestationBalanceHours != null) {
      setBalance(String(data.usage.attestationBalanceHours));
    }
  }, [data?.usage.attestationBalanceHours]);

  const setAttestation = trpc.quota.setAttestation.useMutation({
    onSuccess: () => {
      if (props.mode === "manager") {
        utils.quota.forWorker.invalidate({ userId: props.userId });
      }
      toast.success(t("quota.attestationSaved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  if (!data) return null;

  const { usage, regional, attestation } = data;
  const percent = Math.min(100, Math.max(0, Math.round(usage.percentUsed * 100)));
  const attestationIssue =
    attestation?.required && (!attestation.present || attestation.stale);

  return (
    <section
      className="mb-4 mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-labelledby="quota-heading"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="quota-heading"
          className="flex items-center gap-2 text-sm font-semibold text-slate-900"
        >
          <GraduationCap className="h-4 w-4 text-emerald-600" />
          {t("quota.title", { year: usage.year })}
        </h2>
        <span className="text-xs font-medium text-slate-500">
          {t("quota.remaining", { hours: usage.remainingHours })}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>{t("quota.used", { used: usage.usedHours, limit: usage.limit })}</span>
          <span>{percent}%</span>
        </div>
        <div
          className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full ${LEVEL_BAR[usage.level]}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-[11px] text-slate-500">{t("quota.reserved")}</dt>
          <dd className="text-sm font-semibold text-slate-900">
            {usage.reservedHours}h
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-[11px] text-slate-500">{t("quota.worked")}</dt>
          <dd className="text-sm font-semibold text-slate-900">
            {usage.workedHours}h
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-[11px] text-slate-500">{t("quota.balance")}</dt>
          <dd className="text-sm font-semibold text-slate-900">
            {usage.attestationBalanceHours != null
              ? `${usage.attestationBalanceHours}h`
              : "—"}
          </dd>
        </div>
      </dl>

      {usage.level !== "ok" && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            usage.level === "exceeded"
              ? "bg-rose-50 text-rose-700"
              : usage.level === "warn95"
                ? "bg-orange-50 text-orange-700"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {t(`quota.warning.${usage.level}`)}
        </p>
      )}

      {attestationIssue && (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <p className="font-medium">
            {attestation.present
              ? t("quota.attestationStale", { days: attestation.maxAgeDays })
              : t("quota.attestationMissing")}
          </p>
          {props.mode === "self" && (
            <Link
              href="/settings/profile"
              className="mt-1 inline-block font-medium underline"
            >
              {t("quota.attestationUpload")}
            </Link>
          )}
        </div>
      )}

      {regional && regional.limitType !== "none" && (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-600">
            {t(`quota.regional.${regional.limitType}`, {
              region: t(`workers.regions.${regional.region}`),
              limit: regional.limitHours,
            })}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {regional.periods
              .filter((p) => p.hours > 0)
              .map((p) => (
                <span
                  key={p.label}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    p.exceeded
                      ? "bg-rose-100 text-rose-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {p.label}: {p.hours}/{p.limit}h
                </span>
              ))}
          </div>
        </div>
      )}

      {props.mode === "manager" && (
        <form
          className="mt-4 flex items-end gap-2 border-t border-slate-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            setAttestation.mutate({
              userId: props.userId,
              balanceHours: balance === "" ? null : parseInt(balance, 10),
            });
          }}
        >
          <div className="flex-1">
            <Label htmlFor="attestationBalance">{t("quota.attestationLabel")}</Label>
            <Input
              id="attestationBalance"
              type="number"
              min={0}
              max={650}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="650"
            />
            <p className="mt-1 text-xs text-slate-500">{t("quota.attestationHelp")}</p>
          </div>
          <Button type="submit" disabled={setAttestation.isPending}>
            {t("quota.attestationSave")}
          </Button>
        </form>
      )}
    </section>
  );
}

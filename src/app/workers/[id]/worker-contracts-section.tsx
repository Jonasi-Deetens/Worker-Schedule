"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import {
  ContractSignDialog,
  type ContractSignTarget,
} from "@/interface/components/contract-sign-dialog";

const CONTRACT_TYPES = ["FLEXI", "JOBSTUDENT", "EMPLOYEE", "EXTRA"] as const;

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function WorkerContractsSection({ workerId }: { workerId: string }) {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const contractsQuery = trpc.contract.listForWorker.useQuery({ userId: workerId });

  const [contractType, setContractType] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scheduleText, setScheduleText] = useState("");
  const [hourlyWage, setHourlyWage] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [locale, setLocale] = useState<"nl" | "fr">("nl");

  const prefillQuery = trpc.contract.prefill.useQuery(
    {
      userId: workerId,
      contractType: (contractType as (typeof CONTRACT_TYPES)[number]) || undefined,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      scheduleText: scheduleText || null,
      hourlyWageCents: hourlyWage
        ? Math.round(parseFloat(hourlyWage) * 100)
        : null,
      jobDescription: jobDescription || null,
      locale,
    },
    { enabled: Boolean(workerId) },
  );

  const initialized = useRef(false);
  useEffect(() => {
    const p = prefillQuery.data;
    if (!p || initialized.current) return;
    initialized.current = true;
    if (p.contractType) setContractType(p.contractType);
    setStartDate(toDateInput(new Date(p.startDate)));
    setEndDate(toDateInput(new Date(p.endDate)));
    if (p.hourlyWageCents != null) {
      setHourlyWage((p.hourlyWageCents / 100).toFixed(2));
    }
    if (p.scheduleText) setScheduleText(p.scheduleText);
    if (p.jobDescription) setJobDescription(p.jobDescription);
  }, [prefillQuery.data]);

  const send = trpc.contract.send.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.sent"));
      utils.contract.listForWorker.invalidate({ userId: workerId });
      utils.contract.prefill.invalidate();
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const preview = trpc.contractTemplate.preview.useMutation({
    onSuccess: (data) => {
      const blob = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" }),
      );
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const missingLabels = useMemo(() => {
    const missing = prefillQuery.data?.completeness.missing ?? [];
    const map: Record<string, string> = {
      employer_name: t("contracts.checkEmployerName"),
      employer_address: t("contracts.checkEmployerAddress"),
      employer_cbe: t("contracts.checkEmployerCbe"),
      student_name: t("contracts.checkStudentName"),
      student_niss: t("contracts.checkStudentNiss"),
      student_address: t("contracts.checkStudentAddress"),
      hourly_wage: t("contracts.checkWage"),
      job_description: t("contracts.checkJob"),
      schedule: t("contracts.checkSchedule"),
    };
    return missing.map((k) => map[k] ?? k);
  }, [prefillQuery.data?.completeness.missing, t]);

  const canSend =
    prefillQuery.data?.completeness.ready &&
    startDate &&
    endDate &&
    !send.isPending;

  const [signOpen, setSignOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<ContractSignTarget | null>(null);

  const signEmployer = trpc.contract.signAsEmployer.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.employerSigned"));
      utils.contract.listForWorker.invalidate({ userId: workerId });
      utils.contract.pendingEmployerCount.invalidate();
      setSignOpen(false);
      setSignTarget(null);
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const contracts = (contractsQuery.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    signedAt: Date | string | null;
    studentSignerLabel: string | null;
    pdfUrl: string | null;
  }>;

  const statusLabel = (status: string) => {
    const keys: Record<string, string> = {
      DRAFT: "contracts.statusDraft",
      SENT: "contracts.statusSent",
      WORKER_SIGNED: "contracts.statusWorkerSigned",
      SIGNED: "contracts.statusSigned",
      DECLINED: "contracts.statusDeclined",
    };
    return t(keys[status] ?? "contracts.statusDraft");
  };

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          {t("contracts.workerSectionTitle")}
        </h2>
        <p className="text-xs text-slate-500">{t("contracts.workerSectionHelp")}</p>
      </div>

      {contracts.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {contracts.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{c.title}</p>
                <p className="text-xs text-slate-500">
                  {statusLabel(c.status)}
                  {c.signedAt &&
                    ` · ${t("contracts.signedAt", {
                      date: new Date(c.signedAt).toLocaleDateString(),
                    })}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {c.pdfUrl && (
                  <a
                    href={c.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    {t("contracts.viewPdf")}
                  </a>
                )}
                {c.status === "WORKER_SIGNED" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSignTarget({ id: c.id, title: c.title, pdfUrl: c.pdfUrl });
                      setSignOpen(true);
                    }}
                  >
                    {t("contracts.signAsEmployer")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ContractSignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        contract={signTarget}
        mode="employer"
        signing={signEmployer.isPending}
        onSign={(input) => signEmployer.mutate(input)}
      />

      {contracts.length === 0 && !contractsQuery.isLoading && (
        <p className="text-sm text-slate-500">{t("contracts.empty")}</p>
      )}

      <form
        className="space-y-3 border-t border-slate-100 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate({
            userId: workerId,
            contractType: (contractType as (typeof CONTRACT_TYPES)[number]) || undefined,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            scheduleText: scheduleText || null,
            hourlyWageCents: hourlyWage
              ? Math.round(parseFloat(hourlyWage) * 100)
              : null,
            jobDescription: jobDescription || null,
            locale,
          });
        }}
      >
        <p className="text-sm font-medium text-slate-800">
          {t("contracts.generateTitle")}
        </p>
        <p className="text-xs text-slate-500">{t("contracts.generateHelp")}</p>

        {missingLabels.length > 0 && (
          <ul className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {missingLabels.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="contractLocale" className="text-sm">
            {t("contracts.templateLocale")}
          </Label>
          <select
            id="contractLocale"
            value={locale}
            onChange={(e) => setLocale(e.target.value as "nl" | "fr")}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="nl">{t("contractTemplates.nl")}</option>
            <option value="fr">{t("contractTemplates.fr")}</option>
          </select>
        </div>

        <div>
          <Label htmlFor="contractTypeSend">{t("workers.contractType")}</Label>
          <select
            id="contractTypeSend"
            value={contractType}
            onChange={(e) => setContractType(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t("workers.noContract")}</option>
            {CONTRACT_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="contractStart">{t("contracts.startDateLabel")}</Label>
            <Input
              id="contractStart"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="contractEnd">{t("contracts.endDateLabel")}</Label>
            <Input
              id="contractEnd"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="contractWage">{t("contracts.wageLabel")}</Label>
            <Input
              id="contractWage"
              type="number"
              step="0.01"
              min="0"
              value={hourlyWage}
              onChange={(e) => setHourlyWage(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="contractSchedule">{t("contracts.scheduleLabel")}</Label>
            <Input
              id="contractSchedule"
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              placeholder={t("contracts.schedulePlaceholder")}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="contractJob">{t("contracts.jobDescriptionLabel")}</Label>
          <textarea
            id="contractJob"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={2}
            className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        {prefillQuery.data?.title && (
          <p className="text-xs text-slate-500">
            {t("contracts.previewTitle", { title: prefillQuery.data.title })}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canSend}>
            {t("contracts.generateSend")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={preview.isPending || prefillQuery.isLoading}
            onClick={() => preview.mutate({ userId: workerId, locale })}
          >
            {t("contracts.previewPdf")}
          </Button>
        </div>
        <p className="text-xs text-slate-500">{t("contracts.templateNote")}</p>
      </form>
    </section>
  );
}

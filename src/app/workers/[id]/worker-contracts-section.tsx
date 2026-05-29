"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

const CONTRACT_TYPES = ["FLEXI", "JOBSTUDENT", "EMPLOYEE", "EXTRA"] as const;

export function WorkerContractsSection({ workerId }: { workerId: string }) {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const contractsQuery = trpc.contract.listForWorker.useQuery({ userId: workerId });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contractType, setContractType] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scheduleText, setScheduleText] = useState("");
  const [hourlyWage, setHourlyWage] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const send = trpc.contract.send.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.sent"));
      utils.contract.listForWorker.invalidate({ userId: workerId });
      setTitle("");
      setBody("");
      setStartDate("");
      setEndDate("");
      setScheduleText("");
      setHourlyWage("");
      setJobDescription("");
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const contracts = (contractsQuery.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    signedAt: Date | string | null;
    signatureName: string | null;
    pdfUrl: string | null;
  }>;

  const statusLabel = (status: string) => {
    const keys: Record<string, string> = {
      DRAFT: "contracts.statusDraft",
      SENT: "contracts.statusSent",
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
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
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
                {c.signatureName && (
                  <span className="text-xs text-slate-600">
                    {c.signatureName}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {contracts.length === 0 && !contractsQuery.isLoading && (
        <p className="text-sm text-slate-500">{t("contracts.empty")}</p>
      )}

      <form
        className="space-y-3 border-t border-slate-100 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate({
            userId: workerId,
            title,
            body: body || undefined,
            contractType: (contractType as (typeof CONTRACT_TYPES)[number]) || undefined,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            scheduleText: scheduleText || null,
            hourlyWageCents: hourlyWage
              ? Math.round(parseFloat(hourlyWage) * 100)
              : null,
            jobDescription: jobDescription || null,
          });
        }}
      >
        <p className="text-sm font-medium text-slate-800">{t("contracts.sendTitle")}</p>
        <div>
          <Label htmlFor="contractTitle">{t("contracts.titleLabel")}</Label>
          <Input
            id="contractTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
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
            />
          </div>
          <div>
            <Label htmlFor="contractEnd">{t("contracts.endDateLabel")}</Label>
            <Input
              id="contractEnd"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
            rows={3}
            className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <Label htmlFor="contractBody">{t("contracts.bodyLabel")}</Label>
          <textarea
            id="contractBody"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-slate-500">{t("contracts.pdfPending")}</p>
        <Button type="submit" disabled={!title.trim() || send.isPending}>
          {t("contracts.sendButton")}
        </Button>
      </form>
    </section>
  );
}

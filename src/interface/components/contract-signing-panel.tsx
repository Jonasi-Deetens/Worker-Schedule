"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileSignature } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

type PendingContract = {
  id: string;
  title: string;
  body: string | null;
  fileUrl: string | null;
  sentAt: Date | string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  scheduleText: string | null;
  hourlyWageCents: number | null;
  jobDescription: string | null;
  pdfUrl: string | null;
};

function fmtDate(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

/**
 * Surfaces pending worker contracts with a sign / decline dialog.
 * Used on /me and /applications so workers can accept before clock-in.
 */
export function ContractSigningPanel() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const pendingQuery = trpc.contract.listPendingMine.useQuery();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PendingContract | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const sign = trpc.contract.sign.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.signed"));
      utils.contract.listPendingMine.invalidate();
      utils.contract.listMine.invalidate();
      setOpen(false);
      setSignatureName("");
      setAgreed(false);
      setActive(null);
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const decline = trpc.contract.decline.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.declined"));
      utils.contract.listPendingMine.invalidate();
      utils.contract.listMine.invalidate();
      setOpen(false);
      setActive(null);
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const pending = (pendingQuery.data ?? []) as PendingContract[];
  if (pendingQuery.isLoading || pending.length === 0) return null;

  const openContract = (contract: PendingContract) => {
    setActive(contract);
    setSignatureName("");
    setAgreed(false);
    setOpen(true);
  };

  return (
    <>
      <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-amber-900">
              {t("contracts.pendingBanner")}
            </h2>
            <ul className="mt-2 space-y-2">
              {pending.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-900">{c.title}</span>
                  <Button size="sm" onClick={() => openContract(c)}>
                    {t("contracts.reviewAndSign")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              {t("contracts.signTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-600">
              {active?.title}
            </Dialog.Description>

            {active &&
              (active.startDate ||
                active.endDate ||
                active.scheduleText ||
                active.hourlyWageCents != null ||
                active.jobDescription) && (
                <dl className="mt-4 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("contracts.termsHeading")}
                  </p>
                  {active.startDate && (
                    <Term label={t("contracts.termStart")} value={fmtDate(active.startDate)} />
                  )}
                  {active.endDate && (
                    <Term label={t("contracts.termEnd")} value={fmtDate(active.endDate)} />
                  )}
                  {active.hourlyWageCents != null && (
                    <Term
                      label={t("contracts.termWage")}
                      value={`€ ${(active.hourlyWageCents / 100).toFixed(2)}`}
                    />
                  )}
                  {active.scheduleText && (
                    <Term label={t("contracts.termSchedule")} value={active.scheduleText} />
                  )}
                  {active.jobDescription && (
                    <Term label={t("contracts.termJob")} value={active.jobDescription} />
                  )}
                </dl>
              )}

            {active?.body && (
              <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                {active.body}
              </div>
            )}
            {active?.pdfUrl && (
              <a
                href={active.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:underline"
              >
                {t("contracts.viewPdf")}
              </a>
            )}
            {active?.fileUrl && !active?.pdfUrl && (
              <a
                href={active.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:underline"
              >
                {t("contracts.viewDocument")}
              </a>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="signatureName">{t("contracts.signatureName")}</Label>
                <Input
                  id="signatureName"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder={t("contracts.signaturePlaceholder")}
                  autoComplete="name"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1"
                />
                {t("contracts.agreeLabel")}
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                disabled={decline.isPending}
                onClick={() => active && decline.mutate({ id: active.id })}
              >
                {t("contracts.declineButton")}
              </Button>
              <Button
                disabled={
                  !agreed ||
                  signatureName.trim().length < 2 ||
                  sign.isPending ||
                  !active
                }
                onClick={() =>
                  active &&
                  sign.mutate({
                    contractId: active.id,
                    signatureName: signatureName.trim(),
                  })
                }
              >
                {t("contracts.signButton")}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

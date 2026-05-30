"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import {
  ContractSignDialog,
  type ContractSignTarget,
} from "@/interface/components/contract-sign-dialog";

type ContractRow = ContractSignTarget & {
  status: string;
  signedAt: Date | string | null;
  studentSignedAt: Date | string | null;
  pdfUrl: string | null;
};

export function MeContractsClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const listQuery = trpc.contract.listMine.useQuery();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ContractRow | null>(null);

  const sign = trpc.contract.signAsWorker.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.signed"));
      utils.contract.listMine.invalidate();
      utils.contract.listPendingMine.invalidate();
      setOpen(false);
      setActive(null);
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const decline = trpc.contract.decline.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.declined"));
      utils.contract.listMine.invalidate();
      utils.contract.listPendingMine.invalidate();
      setOpen(false);
      setActive(null);
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const statusLabel = useMemo(() => {
    const keys: Record<string, string> = {
      DRAFT: "contracts.statusDraft",
      SENT: "contracts.statusSent",
      WORKER_SIGNED: "contracts.statusWorkerSigned",
      SIGNED: "contracts.statusSigned",
      DECLINED: "contracts.statusDeclined",
    };
    return (status: string) => t(keys[status] ?? "contracts.statusDraft");
  }, [t]);

  const rows = (listQuery.data ?? []) as ContractRow[];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">
        {t("contracts.myContractsTitle")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("contracts.myContractsHelp")}
      </p>

      {listQuery.isLoading && (
        <p className="mt-6 text-sm text-slate-500">{t("contracts.loading")}</p>
      )}

      {!listQuery.isLoading && rows.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">{t("contracts.emptyMine")}</p>
      )}

      <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="font-medium text-slate-900">{c.title}</p>
              <p className="text-xs text-slate-500">{statusLabel(c.status)}</p>
            </div>
            <div className="flex items-center gap-2">
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
              {c.status === "SENT" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setActive(c);
                    setOpen(true);
                  }}
                >
                  {t("contracts.reviewAndSign")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ContractSignDialog
        open={open}
        onOpenChange={setOpen}
        contract={active}
        mode="worker"
        signing={sign.isPending}
        declining={decline.isPending}
        onSign={(input) => sign.mutate(input)}
        onDecline={(id) => decline.mutate({ id })}
      />
    </main>
  );
}

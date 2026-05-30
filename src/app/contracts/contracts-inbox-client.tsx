"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import {
  ContractSignDialog,
  type ContractSignTarget,
} from "@/interface/components/contract-sign-dialog";

type PendingRow = ContractSignTarget & {
  user: { id: string; name: string | null; email: string | null };
  studentSignedAt: Date | string | null;
  pdfUrl: string | null;
};

export function ContractsInboxClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const pendingQuery = trpc.contract.listPendingEmployer.useQuery();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PendingRow | null>(null);

  const sign = trpc.contract.signAsEmployer.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.employerSigned"));
      utils.contract.listPendingEmployer.invalidate();
      utils.contract.pendingEmployerCount.invalidate();
      setOpen(false);
      setActive(null);
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const rows = (pendingQuery.data ?? []) as PendingRow[];

  const fmtDate = useMemo(
    () => (value: Date | string | null) => {
      if (!value) return "—";
      return new Date(value).toLocaleDateString();
    },
    [],
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">
        {t("contracts.inboxTitle")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">{t("contracts.inboxHelp")}</p>

      {pendingQuery.isLoading && (
        <p className="mt-6 text-sm text-slate-500">{t("contracts.loading")}</p>
      )}

      {!pendingQuery.isLoading && rows.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">{t("contracts.inboxEmpty")}</p>
      )}

      <ul className="mt-6 space-y-3">
        {rows.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="font-medium text-slate-900">{c.title}</p>
            <p className="text-sm text-slate-600">
              {c.user.name ?? c.user.email ?? c.user.id}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("contracts.workerSignedAt", {
                date: fmtDate(c.studentSignedAt),
              })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setActive(c);
                  setOpen(true);
                }}
              >
                {t("contracts.signAsEmployer")}
              </Button>
              {c.pdfUrl && (
                <a
                  href={c.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-emerald-600 hover:underline"
                >
                  {t("contracts.viewPdf")}
                </a>
              )}
              <Link
                href={`/workers/${c.user.id}`}
                className="inline-flex items-center text-sm text-slate-600 hover:underline"
              >
                {t("contracts.openWorker")}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <ContractSignDialog
        open={open}
        onOpenChange={setOpen}
        contract={active}
        mode="employer"
        signing={sign.isPending}
        onSign={(input) => sign.mutate(input)}
      />
    </main>
  );
}

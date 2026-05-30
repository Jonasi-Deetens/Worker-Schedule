"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import {
  ContractSignDialog,
  type ContractSignTarget,
} from "@/interface/components/contract-sign-dialog";

type PendingContract = ContractSignTarget & {
  body: string | null;
  fileUrl: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  scheduleText: string | null;
  hourlyWageCents: number | null;
  jobDescription: string | null;
};

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

  const sign = trpc.contract.signAsWorker.useMutation({
    onSuccess: () => {
      toast.success(t("contracts.signed"));
      utils.contract.listPendingMine.invalidate();
      utils.contract.listMine.invalidate();
      setOpen(false);
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
            <Link
              href="/me/contracts"
              className="mt-2 inline-block text-xs font-medium text-amber-800 hover:underline"
            >
              {t("contracts.viewAll")}
            </Link>
          </div>
        </div>
      </section>

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
    </>
  );
}

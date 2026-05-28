"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/interface/trpc/client";
import { Button } from "@/interface/components/ui/button";
import { toast, trpcErrorMessage } from "@/lib/toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string | null;
  onOffered?: () => void;
}

/**
 * "Offer this shift to a colleague" dialog. The list of candidates comes from
 * the server (`swap.candidates`) so we never present a worker that can't
 * actually take the shift.
 */
export function OfferSwapDialog({
  open,
  onOpenChange,
  subscriptionId,
  onOffered,
}: Props) {
  const t = useTranslations();
  const [toUserId, setToUserId] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const candidates = trpc.swap.candidates.useQuery(
    { subscriptionId: subscriptionId ?? "" },
    { enabled: open && Boolean(subscriptionId) },
  );

  const offer = trpc.swap.offer.useMutation({
    onSuccess: () => {
      toast.success(t("swap.offered"));
      setToUserId("");
      setMessage("");
      onOpenChange(false);
      onOffered?.();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-slate-900">
            {t("swap.offerSwap")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-slate-500">
            {t("swap.offerHelp")}
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-slate-700">
              {t("swap.toColleague")}
              <select
                className="mt-1 flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                disabled={candidates.isLoading || offer.isPending}
              >
                <option value="">{t("swap.pickColleague")}</option>
                {(candidates.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!candidates.isLoading &&
              (candidates.data?.length ?? 0) === 0 && (
                <p className="text-xs text-amber-700">
                  {t("swap.noCandidates")}
                </p>
              )}

            <label className="block text-xs font-medium text-slate-700">
              {t("swap.message")}
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                rows={3}
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("swap.messagePlaceholder")}
                disabled={offer.isPending}
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={offer.isPending}
            >
              {t("shift.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                subscriptionId &&
                toUserId &&
                offer.mutate({
                  subscriptionId,
                  toUserId,
                  message: message || undefined,
                })
              }
              disabled={!toUserId || offer.isPending}
            >
              {t("swap.send")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

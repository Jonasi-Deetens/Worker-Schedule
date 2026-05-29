"use client";

import { useTranslations } from "next-intl";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function SwapClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const list = trpc.swap.listMine.useQuery();

  const decide = trpc.swap.decide.useMutation({
    onSuccess: (_, vars) => {
      utils.swap.listMine.invalidate();
      toast.success(vars.accept ? t("toast.swapAccepted") : t("toast.swapRejected"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const cancel = trpc.swap.cancel.useMutation({
    onSuccess: () => utils.swap.listMine.invalidate(),
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("shift.swap")}</h1>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Incoming
          </h2>
          <ul className="space-y-2">
            {(list.data?.incoming ?? []).map((swap) => (
              <li
                key={swap.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-hairline bg-white p-4 shadow-card"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {swap.fromSubscription.user.name} →{" "}
                    {swap.fromSubscription.shift.roleLabel}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(swap.fromSubscription.shift.startsAt).toLocaleString()}
                  </p>
                </div>
                {swap.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide.mutate({ id: swap.id, accept: true })}
                    >
                      {t("timeOff.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide.mutate({ id: swap.id, accept: false })}
                    >
                      {t("timeOff.reject")}
                    </Button>
                  </div>
                )}
                {swap.status !== "PENDING" && (
                  <span className="text-xs text-slate-500">{swap.status}</span>
                )}
              </li>
            ))}
            {list.data && list.data.incoming.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                Nothing here.
              </p>
            )}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Outgoing
          </h2>
          <ul className="space-y-2">
            {(list.data?.outgoing ?? []).map((swap) => (
              <li
                key={swap.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-hairline bg-white p-4 shadow-card"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {swap.fromSubscription.shift.roleLabel} → {swap.toUser.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(swap.fromSubscription.shift.startsAt).toLocaleString()}
                  </p>
                </div>
                {swap.status === "PENDING" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancel.mutate({ id: swap.id })}
                  >
                    {t("confirm.no")}
                  </Button>
                )}
                {swap.status !== "PENDING" && (
                  <span className="text-xs text-slate-500">{swap.status}</span>
                )}
              </li>
            ))}
            {list.data && list.data.outgoing.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                Nothing here.
              </p>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}

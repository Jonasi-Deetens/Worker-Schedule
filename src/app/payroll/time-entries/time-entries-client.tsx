"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function TimeEntriesClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const pending = trpc.timeClock.listPending.useQuery();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const approve = trpc.timeClock.approve.useMutation({
    onSuccess: () => {
      utils.timeClock.listPending.invalidate();
      setSelected(new Set());
      toast.success(t("toast.timeEntriesApproved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const items = pending.data ?? [];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t("payroll.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{t("payroll.subtitle")}</p>
          </div>
          <Button
            disabled={selected.size === 0 || approve.isPending}
            onClick={() => approve.mutate({ ids: [...selected] })}
          >
            <Check className="mr-1 h-4 w-4" />
            {t("clock.approveSelected")} ({selected.size})
          </Button>
        </div>

        {pending.isLoading && (
          <p className="mt-6 text-sm text-slate-500">{t("hours.loading")}</p>
        )}
        {!pending.isLoading && items.length === 0 && (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {t("clock.noPending")}
          </p>
        )}

        {items.length > 0 && (
          <ul className="mt-6 space-y-2">
            {items.map((entry) => {
              const minutes =
                entry.clockOutAt && entry.clockInAt
                  ? Math.max(
                      0,
                      Math.round(
                        (new Date(entry.clockOutAt).getTime() -
                          new Date(entry.clockInAt).getTime()) /
                          60000 -
                          entry.breakMinutes,
                      ),
                    )
                  : 0;
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <label className="flex flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">
                        {entry.user.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {new Date(entry.clockInAt).toLocaleString()}
                        {entry.clockOutAt
                          ? ` → ${new Date(entry.clockOutAt).toLocaleString()}`
                          : ""}
                        {entry.shift
                          ? ` · ${entry.shift.roleLabel}`
                          : ""}
                      </span>
                    </span>
                  </label>
                  <span className="text-sm font-semibold text-slate-700">
                    {(minutes / 60).toFixed(2)} h
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

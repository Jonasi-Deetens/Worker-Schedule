"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function MyDataClient() {
  const t = useTranslations("myData");
  const tk = useTranslations();
  const exportMutation = trpc.gdpr.exportMine.useQuery(undefined, {
    enabled: false,
  });
  const deleteMutation = trpc.gdpr.deleteMine.useMutation({
    onSuccess: (res) => {
      const count =
        typeof res === "object" && res && "deletedAssignments" in res
          ? (res as { deletedAssignments: number }).deletedAssignments
          : 0;
      const days =
        typeof res === "object" && res && "retentionDays" in res
          ? (res as { retentionDays: number }).retentionDays
          : 90;
      toast.success(t("deleteScheduled", { days, count }));
    },
    onError: (e) => toast.error(trpcErrorMessage(e, tk)),
  });
  const [confirmDelete, setConfirmDelete] = useState("");

  async function handleDownload() {
    const res = await exportMutation.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-calendar-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("exportTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t("exportHelp")}</p>
        <div className="mt-3">
          <Button onClick={handleDownload} disabled={exportMutation.isFetching}>
            {exportMutation.isFetching ? t("exportPreparing") : t("exportCta")}
          </Button>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
        <h2 className="text-lg font-semibold text-red-900">
          {t("deleteTitle")}
        </h2>
        <p className="mt-1 text-sm text-red-800">{t("deleteHelp")}</p>
        <label className="mt-3 block text-sm text-red-900">
          {t("deleteConfirmLabel")}
          <input
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2"
          />
        </label>
        <div className="mt-3">
          <Button
            variant="destructive"
            disabled={confirmDelete !== "DELETE" || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {t("deleteCta")}
          </Button>
        </div>
      </section>
    </main>
  );
}

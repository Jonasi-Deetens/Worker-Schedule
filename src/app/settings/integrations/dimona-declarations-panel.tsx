"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { formatTimeRange } from "@/lib/calendar-utils";

type DeclarationStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

const STATUS_CLASS: Record<DeclarationStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-800 border-rose-200",
  CANCELLED: "bg-slate-50 text-slate-600 border-slate-200",
};

export function DimonaDeclarationsPanel() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<DeclarationStatus | "">("");

  const listQuery = trpc.dimona.list.useQuery(
    statusFilter ? { status: statusFilter } : undefined,
  );

  const retry = trpc.dimona.retry.useMutation({
    onSuccess: () => {
      toast.success(t("integrations.dimonaRetrySuccess"));
      utils.dimona.list.invalidate();
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const cancel = trpc.dimona.cancel.useMutation({
    onSuccess: () => {
      toast.success(t("integrations.dimonaCancelSuccess"));
      utils.dimona.list.invalidate();
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const declarations = listQuery.data ?? [];

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {t("integrations.dimonaDeclarationsTitle")}
          </h2>
          <p className="text-xs text-slate-500">
            {t("integrations.dimonaDeclarationsHelp")}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as DeclarationStatus | "")
          }
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">{t("integrations.dimonaFilterAll")}</option>
          <option value="PENDING">PENDING</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
      </div>

      {listQuery.isLoading && (
        <p className="text-sm text-slate-500">{t("hours.loading")}</p>
      )}

      {!listQuery.isLoading && declarations.length === 0 && (
        <p className="text-sm text-slate-500">
          {t("integrations.dimonaDeclarationsEmpty")}
        </p>
      )}

      {declarations.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {declarations.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {d.workerName}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[d.status as DeclarationStatus]}`}
                  >
                    {d.status}
                  </span>
                  {d.outDeclaredAt && (
                    <span className="text-xs text-emerald-700">
                      {t("integrations.dimonaOutDeclared")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  {d.shift.roleLabel} ·{" "}
                  {formatTimeRange(
                    new Date(d.shift.startsAt),
                    new Date(d.shift.endsAt),
                  )}
                </p>
                {d.errorMessage && (
                  <p className="mt-1 text-xs text-rose-600">{d.errorMessage}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {(d.status === "REJECTED" || d.status === "PENDING") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate({ id: d.id })}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    {t("integrations.dimonaRetry")}
                  </Button>
                )}
                {d.status === "CONFIRMED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() =>
                      cancel.mutate({
                        shiftId: d.shiftId,
                        workerId: d.workerId,
                      })
                    }
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    {t("integrations.dimonaCancel")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatTimeRange } from "@/lib/calendar-utils";
import { AppHeader } from "@/interface/components/app-header";
import { StatusBadge } from "@/interface/components/status-badge";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { subscriptionToDisplayStatus } from "@/domain/rules/scheduling";
import { toast, trpcErrorMessage } from "@/lib/toast";
import type { SubscriptionStatus } from "@/domain/types";
import { ContractSigningPanel } from "@/interface/components/contract-signing-panel";

interface Item {
  id: string;
  status: SubscriptionStatus;
  shift: {
    id: string;
    startsAt: Date | string;
    endsAt: Date | string;
    roleLabel: string;
  };
}

export function ApplicationsPageClient() {
  const t = useTranslations();
  const { data, isLoading } = trpc.subscription.listMine.useQuery();
  const utils = trpc.useUtils();
  const broadcastsQuery = trpc.shift.openBroadcasts.useQuery();
  const reconfirmQuery = trpc.shift.pendingReconfirmations.useQuery();
  const accept = trpc.shift.acceptBroadcast.useMutation({
    onSuccess: () => {
      toast.success(t("applications.broadcastAccepted"));
      broadcastsQuery.refetch();
      utils.subscription.listMine.invalidate();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const invalidateReconfirm = () => {
    reconfirmQuery.refetch();
    utils.shift.list.invalidate();
    utils.notification.unreadCount.invalidate();
  };
  const confirmReschedule = trpc.shift.confirmReschedule.useMutation({
    onSuccess: () => {
      toast.success(t("toast.reconfirmConfirmed"));
      invalidateReconfirm();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const declineReschedule = trpc.shift.declineReschedule.useMutation({
    onSuccess: () => {
      toast.success(t("toast.reconfirmDeclined"));
      invalidateReconfirm();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const reconfirmPending =
    confirmReschedule.isPending || declineReschedule.isPending;

  const groups = useMemo(() => {
    const items = ((data ?? []) as unknown as Item[]).slice();
    return {
      pending: items.filter((i) => i.status === "PENDING"),
      approved: items.filter((i) => i.status === "APPROVED"),
      other: items.filter(
        (i) => i.status === "REJECTED" || i.status === "WITHDRAWN",
      ),
    };
  }, [data]);

  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {t("applications.title")}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t("applications.subtitle")}
        </p>

        <ContractSigningPanel />

        {isLoading && (
          <p className="mt-6 text-sm text-slate-500">
            {t("notifications.loading")}
          </p>
        )}

        {reconfirmQuery.data && reconfirmQuery.data.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-rose-700">
              {t("reconfirm.title")}
            </h2>
            <p className="mb-3 text-xs text-slate-600">{t("reconfirm.help")}</p>
            <ul className="space-y-2">
              {reconfirmQuery.data.map((s) => {
                const start = new Date(s.startsAt);
                const end = new Date(s.endsAt);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {s.roleLabel}
                      </div>
                      <div className="text-xs text-slate-600">
                        {start.toLocaleDateString()} ·{" "}
                        {formatTimeRange(start, end)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          confirmReschedule.mutate({ shiftId: s.id })
                        }
                        disabled={reconfirmPending}
                      >
                        {t("reconfirm.confirm")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          declineReschedule.mutate({ shiftId: s.id })
                        }
                        disabled={reconfirmPending}
                      >
                        {t("reconfirm.decline")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {broadcastsQuery.data && broadcastsQuery.data.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700">
              {t("applications.broadcastsTitle")}
            </h2>
            <ul className="space-y-2">
              {broadcastsQuery.data.map((s) => {
                const start = new Date(s.startsAt);
                const end = new Date(s.endsAt);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {s.roleLabel}
                      </div>
                      <div className="text-xs text-slate-600">
                        {start.toLocaleDateString()} · {formatTimeRange(start, end)}{" "}
                        · {s.approvedCount}/{s.requiredSpots}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => accept.mutate({ shiftId: s.id })}
                      disabled={accept.isPending}
                    >
                      {t("shift.acceptBroadcast")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {isEmpty && (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {t("applications.empty")}
          </p>
        )}

        <ApplicationGroup
          title={t("applications.groupPending")}
          items={groups.pending}
        />
        <ApplicationGroup
          title={t("applications.groupApproved")}
          items={groups.approved}
        />
        <ApplicationGroup
          title={t("applications.groupRejected")}
          items={groups.other}
        />
      </main>
    </div>
  );
}

function ApplicationGroup({
  title,
  items,
}: {
  title: string;
  items: Item[];
}) {
  const t = useTranslations();
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <ul className="space-y-2">
        {items.map((item) => {
          const start = new Date(item.shift.startsAt);
          const end = new Date(item.shift.endsAt);
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-card"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-ink">
                    {item.shift.roleLabel}
                  </p>
                  <StatusBadge
                    status={subscriptionToDisplayStatus(item.status)}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {start.toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {formatTimeRange(start, end)}
                </p>
              </div>
              <Link
                href="/calendar"
                className="text-xs font-medium text-emerald-600 hover:underline"
              >
                {t("applications.viewOnCalendar")} →
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

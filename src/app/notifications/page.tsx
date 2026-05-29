"use client";

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export default function NotificationsPage() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading } = trpc.notification.list.useQuery(
    { limit: 25, cursor },
    { placeholderData: (prev) => prev },
  );

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
      toast.success(t("toast.notificationsRead"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const items = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? null;
  const isEmpty = !isLoading && items.length === 0 && !cursor;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {t("notifications.title")}
          </h1>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            {t("notifications.markAllRead")}
          </Button>
        </div>

        {isLoading && (
          <p className="text-sm text-slate-500">
            {t("notifications.loading")}
          </p>
        )}

        {isEmpty && (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {t("notifications.empty")}
          </p>
        )}

        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border p-4 ${
                n.readAt
                  ? "border-slate-200 bg-white"
                  : "border-emerald-200 bg-emerald-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{n.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {formatDistanceToNow(new Date(n.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                {!n.readAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markRead.mutate({ id: n.id })}
                  >
                    {t("notifications.markRead")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCursor(nextCursor)}
            >
              Load more
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

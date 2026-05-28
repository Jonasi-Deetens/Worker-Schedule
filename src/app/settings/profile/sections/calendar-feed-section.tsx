"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function CalendarFeedSection() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const calendarUrl = trpc.me.calendarUrl.useQuery();
  const rotate = trpc.me.rotateCalendarToken.useMutation({
    onSuccess: () => {
      toast.success(t("profile.calendarRotated"));
      utils.me.calendarUrl.invalidate();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const url = calendarUrl.data?.url ?? null;
  const fullUrl = url && url.startsWith("/")
    ? typeof window !== "undefined"
      ? `${window.location.origin}${url}`
      : url
    : url;

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">
        {t("profile.calendarFeed")}
      </h2>
      <p className="text-xs text-slate-500">{t("profile.calendarHelp")}</p>
      {fullUrl ? (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={fullUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(fullUrl);
                toast.success(t("profile.calendarCopied"));
              }}
            >
              {t("profile.copy")}
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => rotate.mutate()}
              disabled={rotate.isPending}
            >
              {t("profile.calendarRotate")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500">…</p>
      )}
    </section>
  );
}

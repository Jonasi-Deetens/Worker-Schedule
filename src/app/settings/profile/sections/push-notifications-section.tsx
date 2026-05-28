"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { usePushNotifications } from "@/interface/hooks/use-push-notifications";

export function PushNotificationsSection() {
  const t = useTranslations();
  const { status, subscribe, unsubscribe } = usePushNotifications();

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">
        {t("profile.push")}
      </h2>
      <p className="text-xs text-slate-500">{t("profile.pushHelp")}</p>
      {status === "unsupported" && (
        <p className="text-xs text-amber-700">{t("profile.pushUnsupported")}</p>
      )}
      {status === "denied" && (
        <p className="text-xs text-red-700">{t("profile.pushDenied")}</p>
      )}
      {status === "subscribed" && (
        <Button variant="outline" onClick={() => unsubscribe()}>
          {t("profile.pushDisable")}
        </Button>
      )}
      {status === "unsubscribed" && (
        <Button onClick={() => subscribe()}>{t("profile.pushEnable")}</Button>
      )}
      {status === "loading" && (
        <p className="text-xs text-slate-500">…</p>
      )}
    </section>
  );
}

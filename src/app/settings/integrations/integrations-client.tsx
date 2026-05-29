"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function IntegrationsClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const settings = trpc.business.settings.useQuery();

  const [employerId, setEmployerId] = useState("");
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setEmployerId(settings.data.dimonaEmployerId ?? "");
  }, [settings.data]);

  const update = trpc.business.updateDimona.useMutation({
    onSuccess: () => {
      utils.business.settings.invalidate();
      setToken("");
      toast.success(t("integrations.saved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Only send credentials when the owner actually typed a new token, so we
    // never overwrite a stored secret with an empty value on a plain save.
    const credentials = token
      ? JSON.stringify({ token, ...(baseUrl ? { baseUrl } : {}) })
      : undefined;
    update.mutate({
      dimonaEmployerId: employerId || null,
      dimonaCredentials: credentials,
    });
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("integrations.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t("integrations.subtitle")}
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {t("integrations.dimonaTitle")}
          </div>
          <p className="text-xs text-slate-500">{t("integrations.dimonaHelp")}</p>

          <div>
            <Label htmlFor="employerId">{t("integrations.employerId")}</Label>
            <Input
              id="employerId"
              value={employerId}
              onChange={(e) => setEmployerId(e.target.value)}
              placeholder="ONSS / RSZ"
            />
          </div>

          <div>
            <Label htmlFor="token">{t("integrations.token")}</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                settings.data?.dimonaConfigured
                  ? t("integrations.tokenSet")
                  : t("integrations.tokenPlaceholder")
              }
            />
            <p className="mt-1 text-xs text-slate-500">
              {t("integrations.tokenHelp")}
            </p>
          </div>

          <div>
            <Label htmlFor="baseUrl">{t("integrations.baseUrl")}</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://services.socialsecurity.be/REST/dimona/v1"
            />
          </div>

          <Button type="submit" disabled={update.isPending}>
            {t("integrations.save")}
          </Button>
        </form>
      </main>
    </div>
  );
}

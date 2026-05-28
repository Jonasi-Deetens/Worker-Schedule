"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function TwoFactorSection() {
  const t = useTranslations();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(
    null,
  );
  const [token, setToken] = useState("");
  const setupMutation = trpc.twoFactor.setup.useMutation({
    onSuccess: (data) => setSetup(data ?? null),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const enableMutation = trpc.twoFactor.enable.useMutation({
    onSuccess: () => {
      toast.success(t("profile.twoFactorEnabled"));
      setSetup(null);
      setToken("");
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const disableMutation = trpc.twoFactor.disable.useMutation({
    onSuccess: () => toast.success(t("profile.twoFactorDisabled")),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">
        {t("profile.twoFactor")}
      </h2>
      <p className="text-xs text-slate-500">{t("profile.twoFactorHelp")}</p>
      {!setup && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
            {t("profile.twoFactorSetup")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => disableMutation.mutate()}
            disabled={disableMutation.isPending}
          >
            {t("profile.twoFactorDisable")}
          </Button>
        </div>
      )}
      {setup && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">{t("profile.twoFactorScan")}</p>
          <code className="block break-all rounded-lg bg-slate-100 p-2 text-xs">
            {setup.secret}
          </code>
          <a
            href={setup.otpauthUrl}
            className="text-xs text-indigo-600 hover:underline"
          >
            otpauth://
          </a>
          <div className="flex gap-2">
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              className="max-w-[8rem]"
            />
            <Button
              disabled={token.length !== 6 || enableMutation.isPending}
              onClick={() => enableMutation.mutate({ secret: setup.secret, token })}
            >
              {t("profile.twoFactorEnable")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

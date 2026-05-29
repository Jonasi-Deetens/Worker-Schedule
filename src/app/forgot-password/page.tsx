"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [submitted, setSubmitted] = useState(false);

  const request = trpc.auth.requestPasswordReset.useMutation({
    // Enumeration-safe: success and error both land on the same confirmation
    // copy so the page never reveals whether an email is registered.
    onSettled: () => setSubmitted(true),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    request.mutate({ email: form.get("email") as string });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("forgotTitle")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("forgotSubtitle")}</p>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <p
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
              role="status"
            >
              {t("resetEmailSent")}
            </p>
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-emerald-600 hover:underline"
            >
              {t("backToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={request.isPending}
            >
              {request.isPending ? t("sending") : t("sendResetLink")}
            </Button>
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-emerald-600 hover:underline"
            >
              {t("backToLogin")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

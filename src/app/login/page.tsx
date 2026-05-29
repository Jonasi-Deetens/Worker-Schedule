"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";

/**
 * Maps the stable error codes thrown by the credentials `authorize` flow to a
 * localized message. NextAuth returns the thrown message (or wraps it), so a
 * substring match keeps this robust against any wrapping.
 */
function resolveError(
  raw: string,
  t: ReturnType<typeof useTranslations>,
): { message: string; requiresTotp: boolean } {
  if (raw.includes("TOTP_REQUIRED")) {
    return { message: t("totpRequired"), requiresTotp: true };
  }
  if (raw.includes("TOTP_INVALID")) {
    return { message: t("totpInvalid"), requiresTotp: true };
  }
  if (raw.includes("ACCOUNT_NOT_ACTIVE")) {
    return { message: t("accountNotActive"), requiresTotp: false };
  }
  return { message: t("invalidCredentials"), requiresTotp: false };
}

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [showTotp, setShowTotp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const totp = (form.get("totp") as string | null)?.trim() || undefined;
    const result = await signIn("credentials", {
      email: form.get("email") as string,
      password: form.get("password") as string,
      totp,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      const resolved = resolveError(result.error, t);
      setError(resolved.message);
      if (resolved.requiresTotp) setShowTotp(true);
      return;
    }

    router.push("/calendar");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t("signIn")}</h1>
        <p className="mt-1 text-sm text-slate-600">Work Calendar</p>

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
          <div>
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <Label htmlFor="totp">{t("totpCode")}</Label>
            <Input
              id="totp"
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              aria-describedby="totp-help"
              autoFocus={showTotp}
            />
            <p id="totp-help" className="mt-1 text-xs text-slate-500">
              {t("totpCodeHelp")}
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          <Link
            href="/forgot-password"
            className="font-medium text-emerald-600 hover:underline"
          >
            {t("forgotPassword")}
          </Link>
        </p>

        <p className="mt-2 text-center text-sm text-slate-600">
          {t("noAccount")}{" "}
          <Link
            href="/register"
            className="font-medium text-emerald-600 hover:underline"
          >
            {t("register")}
          </Link>
        </p>
      </div>
    </div>
  );
}

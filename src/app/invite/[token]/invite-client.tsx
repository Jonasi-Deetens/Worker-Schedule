"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function InviteAcceptClient({ token }: { token: string }) {
  const t = useTranslations();
  const router = useRouter();
  const lookup = trpc.invite.lookup.useQuery({ token });
  const accept = trpc.invite.accept.useMutation({
    onSuccess: async (data) => {
      const email = (data as { email?: string } | undefined)?.email;
      if (email && password) {
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (!result?.error) {
          router.push("/calendar");
          return;
        }
      }
      router.push("/login");
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  if (lookup.isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <p className="text-sm text-slate-500">{t("hours.loading")}</p>
      </main>
    );
  }

  const invite = lookup.data;
  if (!invite || invite.acceptedAt || new Date(invite.expiresAt) < new Date()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <h1 className="text-2xl font-bold text-slate-900">{t("app.name")}</h1>
        <p className="mt-4 text-center text-sm text-slate-600">
          {t("invite.expired")}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-bold text-slate-900">{t("invite.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("invite.fromBusiness", { business: invite.businessName })}
      </p>
      <p className="mt-1 text-xs text-slate-500">{t("invite.subtitle")}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate({
            token,
            name,
            password,
            // Link-only invites have no fixed email, so we collect one here.
            email: invite.email ? undefined : email,
          });
        }}
        className="mt-6 space-y-3"
      >
        {invite.email ? (
          <div>
            <Label>{t("auth.email")}</Label>
            <Input value={invite.email} disabled />
          </div>
        ) : (
          <div>
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t("invite.emailPlaceholder")}
            />
          </div>
        )}
        <div>
          <Label htmlFor="name">{t("auth.name")}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
          />
        </div>
        <div>
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <Button type="submit" className="w-full" disabled={accept.isPending}>
          {accept.isPending ? t("invite.accepting") : t("invite.accept")}
        </Button>
      </form>
    </main>
  );
}

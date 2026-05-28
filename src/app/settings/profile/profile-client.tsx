"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { AvatarSection } from "./sections/avatar-section";
import { CalendarFeedSection } from "./sections/calendar-feed-section";
import { DocumentsSection } from "./sections/documents-section";
import { PushNotificationsSection } from "./sections/push-notifications-section";
import { TwoFactorSection } from "./sections/two-factor-section";

const LOCALES = ["en", "nl", "fr"] as const;

const EMAIL_EVENTS = [
  "INVITE",
  "APPLICATION_DECISION",
  "SHIFT_REMINDER",
  "TIMEOFF_DECISION",
] as const;

export function ProfileClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const profile = trpc.me.profile.useQuery();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState<string>("en");
  const [emailPrefs, setEmailPrefs] = useState<Record<string, boolean>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.name ?? "");
    setPhone(profile.data.phone ?? "");
    setLocale(profile.data.locale ?? "en");
    const prefs = (profile.data.notificationPrefs as
      | { email?: Record<string, boolean> }
      | null) ?? null;
    setEmailPrefs(prefs?.email ?? {});
  }, [profile.data]);

  const update = trpc.me.updateProfile.useMutation({
    onSuccess: () => {
      utils.me.profile.invalidate();
      toast.success(t("toast.profileSaved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const changePassword = trpc.me.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      toast.success(t("toast.passwordChanged"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("profile.subtitle")}</p>

        <AvatarSection />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              name: name || undefined,
              phone: phone || null,
              locale: locale as "en" | "nl" | "fr",
              notificationPrefs: { email: emailPrefs },
            });
            document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
          }}
          className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">{t("profile.displayName")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phone">{t("profile.phone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="locale">{t("profile.locale")}</Label>
              <select
                id="locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {t(`profile.locales.${code}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="border-t border-slate-200 pt-4">
            <legend className="text-sm font-semibold text-slate-700">
              {t("profile.notifications")}
            </legend>
            <p className="mb-3 text-xs text-slate-500">
              {t("profile.notificationsHelp")}
            </p>
            <ul className="space-y-2">
              {EMAIL_EVENTS.map((event) => (
                <li key={event} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={`pref-${event}`}
                    checked={emailPrefs[event] !== false}
                    onChange={(e) =>
                      setEmailPrefs((prev) => ({
                        ...prev,
                        [event]: e.target.checked,
                      }))
                    }
                  />
                  <label htmlFor={`pref-${event}`} className="text-slate-700">
                    {event.replace(/_/g, " ").toLowerCase()}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <Button type="submit" disabled={update.isPending}>
            {t("profile.save")}
          </Button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            changePassword.mutate({ currentPassword, newPassword });
          }}
          className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-700">
            {t("profile.password")}
          </h2>
          <div>
            <Label htmlFor="currentPassword">{t("profile.currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <Label htmlFor="newPassword">{t("profile.newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={changePassword.isPending}>
            {t("profile.changePassword")}
          </Button>
        </form>

        <PushNotificationsSection />
        <CalendarFeedSection />
        <DocumentsSection />
        <TwoFactorSection />
      </main>
    </div>
  );
}

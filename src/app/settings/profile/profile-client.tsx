"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { usePushNotifications } from "@/interface/hooks/use-push-notifications";

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

function PushNotificationsSection() {
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

function CalendarFeedSection() {
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

function TwoFactorSection() {
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

const DOC_KINDS = [
  "ID_CARD",
  "WORK_CONTRACT",
  "RESIDENCE_PERMIT",
  "FOOD_SAFETY",
  "OTHER",
] as const;

/**
 * Drag-and-drop uploader and listing for the current user's documents.
 *
 * The browser does the heavy lifting (presigned PUT directly to S3/R2 so
 * we never proxy the file through the Next.js server). When storage is
 * not configured, we hide the whole section to avoid teasing a feature
 * that doesn't exist.
 */
function DocumentsSection() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const status = trpc.document.storageStatus.useQuery();
  const docs = trpc.document.listMine.useQuery();
  const presign = trpc.document.presignUpload.useMutation();
  const create = trpc.document.create.useMutation({
    onSuccess: () => utils.document.listMine.invalidate(),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const remove = trpc.document.delete.useMutation({
    onSuccess: () => utils.document.listMine.invalidate(),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const [kind, setKind] = useState<(typeof DOC_KINDS)[number]>("OTHER");
  const [expiresOn, setExpiresOn] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  if (status.data && !status.data.configured) {
    return null;
  }

  const handleFile = async (file: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const pres = await presign.mutateAsync({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      const putRes = await fetch(pres!.url, {
        method: "PUT",
        body: file,
        headers: pres!.headers,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      await create.mutateAsync({
        kind,
        url: pres!.url.split("?")[0]!, // strip the signed query so URL stays stable
        fileName: file.name,
        contentType: file.type || undefined,
        sizeBytes: file.size,
        expiresOn: expiresOn ? new Date(expiresOn) : null,
      });
      setExpiresOn("");
      toast.success(t("docs.uploaded"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{t("docs.title")}</h2>
      <p className="text-xs text-slate-500">{t("docs.help")}</p>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="doc-kind">{t("docs.kind")}</Label>
          <select
            id="doc-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof DOC_KINDS)[number])}
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            {DOC_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`docs.kind_${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="doc-expires">{t("docs.expiresOn")}</Label>
          <Input
            id="doc-expires"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
      </div>

      <label
        className={`flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm transition ${
          dragOver
            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
            : "border-slate-300 text-slate-600 hover:border-indigo-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void handleFile(file);
          }}
          disabled={busy}
        />
        {busy ? t("docs.uploading") : t("docs.dropzone")}
      </label>

      <ul className="space-y-2">
        {(docs.data ?? []).map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium text-slate-900">
                {t(`docs.kind_${d.kind}`)}
              </div>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate text-xs text-indigo-600 hover:underline"
              >
                {d.fileName}
              </a>
              {d.expiresOn && (
                <span className="ml-2 text-xs text-slate-500">
                  · {new Date(d.expiresOn).toLocaleDateString()}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove.mutate({ id: d.id })}
              disabled={remove.isPending}
            >
              ×
            </Button>
          </li>
        ))}
        {(docs.data ?? []).length === 0 && (
          <li className="text-xs text-slate-500">{t("docs.empty")}</li>
        )}
      </ul>
    </section>
  );
}

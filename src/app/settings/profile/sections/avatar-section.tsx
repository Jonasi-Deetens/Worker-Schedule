"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/interface/components/avatar";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

/**
 * Avatar uploader. Uses the same presign-then-PUT pipeline as documents but
 * with a smaller cap (2 MiB) and image-only types. The new URL is persisted
 * via `me.updateProfile` (avatarUrl is already part of that schema).
 */
export function AvatarSection() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const profile = trpc.me.profile.useQuery();
  const presign = trpc.me.presignAvatar.useMutation();
  const update = trpc.me.updateProfile.useMutation({
    onSuccess: () => {
      utils.me.profile.invalidate();
      toast.success(t("toast.profileSaved"));
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("avatar.imageOnly"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("avatar.tooLarge"));
      return;
    }
    const ct = file.type === "image/jpeg"
      || file.type === "image/png"
      || file.type === "image/webp"
      ? (file.type as "image/jpeg" | "image/png" | "image/webp")
      : null;
    if (!ct) {
      toast.error(t("avatar.unsupported"));
      return;
    }
    setBusy(true);
    try {
      const pres = await presign.mutateAsync({
        contentType: ct,
        sizeBytes: file.size,
      });
      const putRes = await fetch(pres!.url, {
        method: "PUT",
        body: file,
        headers: pres!.headers,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      const stableUrl = pres!.url.split("?")[0]!;
      await update.mutateAsync({ avatarUrl: stableUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    setBusy(true);
    try {
      await update.mutateAsync({ avatarUrl: null });
    } finally {
      setBusy(false);
    }
  };

  const data = profile.data;
  if (!data) return null;

  return (
    <section className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Avatar name={data.name ?? "?"} url={data.avatarUrl} size="xl" />
      <div className="flex-1 min-w-[180px]">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("avatar.title")}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{t("avatar.help")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy
              ? t("avatar.uploading")
              : data.avatarUrl
                ? t("avatar.replace")
                : t("avatar.upload")}
          </Button>
          {data.avatarUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={removeAvatar}
              disabled={busy}
            >
              {t("avatar.remove")}
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

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
export function DocumentsSection() {
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

"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Button } from "@/interface/components/ui/button";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

type Locale = "nl" | "fr";

export function ContractTemplatesPanel() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const settings = trpc.business.settings.useQuery();
  const fieldSpec = trpc.contractTemplate.fieldSpec.useQuery();
  const storageQuery = trpc.document.storageStatus.useQuery();
  const storageConfigured = storageQuery.data?.configured ?? false;

  const nlInputRef = useRef<HTMLInputElement>(null);
  const frInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<Locale | null>(null);

  const presign = trpc.contractTemplate.presignUpload.useMutation();
  const updateUrl = trpc.contractTemplate.updateUrl.useMutation({
    onSuccess: () => {
      utils.business.settings.invalidate();
      toast.success(t("contractTemplates.saved"));
      setUploading(null);
    },
    onError: (e) => {
      setUploading(null);
      toast.error(trpcErrorMessage(e, t));
    },
  });

  const uploadTemplate = async (locale: Locale, file: File) => {
    if (file.type !== "application/pdf") {
      toast.error(t("contractTemplates.pdfOnly"));
      return;
    }
    setUploading(locale);
    try {
      const presigned = await presign.mutateAsync({
        locale,
        fileName: file.name,
        contentType: "application/pdf",
        sizeBytes: file.size,
      });
      const res = await fetch(presigned.url, {
        method: "PUT",
        body: file,
        headers: presigned.headers,
      });
      if (!res.ok) throw new Error("Upload failed");
      await updateUrl.mutateAsync({ locale, fileUrl: presigned.fileUrl });
    } catch (e) {
      setUploading(null);
      toast.error(trpcErrorMessage(e, t));
    }
  };

  const templateNl = settings.data?.contractTemplateUrlNl;
  const templateFr = settings.data?.contractTemplateUrlFr;

  return (
    <section className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-5 w-5 text-emerald-600" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {t("contractTemplates.title")}
          </h2>
          <p className="text-xs text-slate-500">{t("contractTemplates.help")}</p>
        </div>
      </div>

      {fieldSpec.data && (
        <details className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">
            {t("contractTemplates.fieldSpec")}
          </summary>
          <p className="mt-2 font-mono leading-relaxed">
            {fieldSpec.data.fields.join(", ")}
          </p>
        </details>
      )}

      {!storageConfigured && (
        <p className="text-xs text-amber-700">{t("contractTemplates.noStorage")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TemplateSlot
          label={t("contractTemplates.nl")}
          url={templateNl}
          inputRef={nlInputRef}
          disabled={!storageConfigured || uploading !== null}
          uploading={uploading === "nl"}
          onPick={() => nlInputRef.current?.click()}
          onClear={() =>
            updateUrl.mutate({ locale: "nl", fileUrl: null })
          }
          clearLabel={t("contractTemplates.remove")}
          viewLabel={t("contractTemplates.view")}
        />
        <input
          ref={nlInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadTemplate("nl", f);
            e.target.value = "";
          }}
        />
        <TemplateSlot
          label={t("contractTemplates.fr")}
          url={templateFr}
          inputRef={frInputRef}
          disabled={!storageConfigured || uploading !== null}
          uploading={uploading === "fr"}
          onPick={() => frInputRef.current?.click()}
          onClear={() =>
            updateUrl.mutate({ locale: "fr", fileUrl: null })
          }
          clearLabel={t("contractTemplates.remove")}
          viewLabel={t("contractTemplates.view")}
        />
        <input
          ref={frInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadTemplate("fr", f);
            e.target.value = "";
          }}
        />
      </div>
    </section>
  );
}

function TemplateSlot({
  label,
  url,
  disabled,
  uploading,
  onPick,
  onClear,
  clearLabel,
  viewLabel,
  inputRef: _inputRef,
}: {
  label: string;
  url?: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  uploading: boolean;
  onPick: () => void;
  onClear: () => void;
  clearLabel: string;
  viewLabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <Label className="text-sm">{label}</Label>
      <p className="mt-1 text-xs text-slate-500">
        {url ? viewLabel : "—"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onPick}
        >
          {uploading ? "…" : label}
        </Button>
        {url && (
          <>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs font-medium text-emerald-600 hover:underline"
            >
              {viewLabel}
            </a>
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              {clearLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

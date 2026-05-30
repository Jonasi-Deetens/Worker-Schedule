"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { useSignatureCanvas } from "@/interface/components/use-signature-canvas";

export type ContractSignTarget = {
  id: string;
  title: string;
  pdfUrl?: string | null;
  sentAt?: Date | string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: ContractSignTarget | null;
  mode: "worker" | "employer";
  onSign: (input: {
    contractId: string;
    signaturePngBase64: string;
    signerLabel?: string;
  }) => void;
  onDecline?: (contractId: string) => void;
  signing?: boolean;
  declining?: boolean;
};

export function ContractSignDialog({
  open,
  onOpenChange,
  contract,
  mode,
  onSign,
  onDecline,
  signing = false,
  declining = false,
}: Props) {
  const t = useTranslations("contracts");
  const [signerLabel, setSignerLabel] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signError, setSignError] = useState(false);

  const { setCanvasRef, clear, isEmpty, toPngDataUrl } = useSignatureCanvas(open);

  useEffect(() => {
    if (open) {
      console.log(
        "[signature-pad] dialog open — filter console with 'signature-pad'; force logs: localStorage.debugSignaturePad='1'",
      );
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSignerLabel("");
      setAgreed(false);
      setSignError(false);
      clear();
    }
  }, [open, clear]);

  useEffect(() => {
    if (open) {
      setSignError(false);
      clear();
    }
  }, [open, contract?.id, clear]);

  const handleClear = () => {
    setSignError(false);
    clear();
  };

  const handleSubmit = () => {
    if (!contract) return;
    if (isEmpty()) {
      setSignError(true);
      return;
    }
    setSignError(false);
    onSign({
      contractId: contract.id,
      signaturePngBase64: toPngDataUrl(),
      signerLabel: signerLabel.trim() || undefined,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(100vw-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900">
            {contract?.title ?? t("signTitle")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-600">
            {mode === "worker" ? t("signWorkerHint") : t("signEmployerHint")}
          </Dialog.Description>

          {contract?.pdfUrl && (
            <a
              href={contract.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              {t("viewPdf")}
            </a>
          )}

          <div className="mt-4">
            <Label>{t("signDrawHere")}</Label>
            <div className="relative z-10 mt-1 h-36 w-full min-w-0 overflow-hidden rounded-md border border-slate-300 bg-white">
              {open && (
                <canvas
                  ref={setCanvasRef}
                  className="block h-full w-full cursor-crosshair touch-none"
                  style={{ touchAction: "none" }}
                  aria-label={t("signDrawHere")}
                />
              )}
            </div>
            {signError && (
              <p className="mt-1 text-xs text-red-600">{t("signEmpty")}</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleClear}
            >
              {t("signClear")}
            </Button>
          </div>

          <div className="mt-3">
            <Label htmlFor="signerLabel">{t("signerLabelOptional")}</Label>
            <Input
              id="signerLabel"
              value={signerLabel}
              onChange={(e) => setSignerLabel(e.target.value)}
              placeholder={t("signerLabelPlaceholder")}
              className="mt-1"
            />
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            {t("agreeLabel")}
          </label>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={handleSubmit} disabled={signing || !agreed}>
              {signing ? t("signSubmitting") : t("signSubmit")}
            </Button>
            {mode === "worker" && onDecline && contract && (
              <Button
                type="button"
                variant="outline"
                disabled={declining || signing}
                onClick={() => onDecline(contract.id)}
              >
                {t("declineButton")}
              </Button>
            )}
            <Dialog.Close asChild>
              <Button type="button" variant="ghost">
                {t("signCancel")}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

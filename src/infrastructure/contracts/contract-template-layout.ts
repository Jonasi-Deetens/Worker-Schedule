import type { ContractTemplateLocale } from "./contract-pdf";

/** Rectangle in PDF user space (origin bottom-left). */
export type SignatureBox = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContractSignatureLayout = {
  student: SignatureBox;
  employer: SignatureBox;
  signedAt: { pageIndex: number; x: number; y: number; width: number; height: number };
};

/**
 * Fixed signature box positions for official NL/FR templates (page 2).
 * Must stay in sync with scripts/generate-contract-templates.ts.
 */
export const OFFICIAL_CONTRACT_SIGNATURE_LAYOUT: Record<
  ContractTemplateLocale,
  ContractSignatureLayout
> = {
  nl: {
    student: { pageIndex: 1, x: 50, y: 200, width: 495, height: 48 },
    employer: { pageIndex: 1, x: 50, y: 120, width: 495, height: 48 },
    signedAt: { pageIndex: 1, x: 50, y: 72, width: 200, height: 16 },
  },
  fr: {
    student: { pageIndex: 1, x: 50, y: 200, width: 495, height: 48 },
    employer: { pageIndex: 1, x: 50, y: 120, width: 495, height: 48 },
    signedAt: { pageIndex: 1, x: 50, y: 72, width: 200, height: 16 },
  },
};

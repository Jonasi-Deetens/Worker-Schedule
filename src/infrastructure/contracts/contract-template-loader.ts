import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ContractTemplateLocale } from "./contract-pdf";
import { createDefaultFillableTemplate } from "./create-default-template";

/**
 * Fetches template PDF bytes from a stored object URL (S3/MinIO public URL).
 */
export async function fetchTemplateBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load contract template (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export function resolveTemplateUrl(
  business: {
    contractTemplateUrlNl?: string | null;
    contractTemplateUrlFr?: string | null;
  },
  locale: ContractTemplateLocale,
): string | null {
  if (locale === "fr" && business.contractTemplateUrlFr) {
    return business.contractTemplateUrlFr;
  }
  return business.contractTemplateUrlNl ?? business.contractTemplateUrlFr ?? null;
}

export async function loadBusinessTemplate(
  business: {
    contractTemplateUrlNl?: string | null;
    contractTemplateUrlFr?: string | null;
  },
  locale: ContractTemplateLocale = "nl",
): Promise<Uint8Array | null> {
  const url = resolveTemplateUrl(business, locale);
  if (!url) return null;
  return fetchTemplateBytes(url);
}

/** Built-in NL/FR assets, then minimal dev template. */
export async function loadContractTemplateBytes(
  business: {
    contractTemplateUrlNl?: string | null;
    contractTemplateUrlFr?: string | null;
  },
  locale: ContractTemplateLocale = "nl",
): Promise<Uint8Array> {
  const custom = await loadBusinessTemplate(business, locale);
  if (custom) return custom;

  const fileName =
    locale === "fr"
      ? "student-jobstudent-fr.pdf"
      : "student-jobstudent-nl.pdf";
  const assetPath = path.join(process.cwd(), "assets", "contracts", fileName);
  try {
    const buf = await readFile(assetPath);
    return new Uint8Array(buf);
  } catch {
    return createDefaultFillableTemplate();
  }
}

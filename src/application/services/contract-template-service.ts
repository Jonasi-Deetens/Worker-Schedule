import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import { isStorageConfigured, MAX_UPLOAD_BYTES } from "./document-service";
import { presignS3Put } from "@/infrastructure/storage/s3-presign";
import { createDefaultFillableTemplate } from "@/infrastructure/contracts/create-default-template";
import { CONTRACT_TEMPLATE_FIELD_NAMES } from "@/infrastructure/contracts/contract-template-fields";
import {
  buildContractPrefill,
  fieldValuesWithSignature,
} from "./contract-field-mapper";
import { generateContractPdf } from "@/infrastructure/contracts/contract-pdf";
import { loadBusinessTemplate } from "@/infrastructure/contracts/contract-template-loader";
import type { ContractTemplateLocale } from "@/infrastructure/contracts/contract-pdf";

export class ContractTemplateService {
  constructor(private readonly db: PrismaClient) {}

  async presignTemplateUpload(input: {
    businessId: string;
    locale: ContractTemplateLocale;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }) {
    if (!isStorageConfigured()) {
      throw new Error("Object storage is not configured");
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error("File is larger than 10 MiB");
    }
    if (input.contentType !== "application/pdf") {
      throw new Error("Only PDF templates are supported");
    }
    const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
    const key = `contract-templates/${input.businessId}/${input.locale}-${randomUUID()}-${safeName}`;
    const presigned = presignS3Put({
      endpoint: env.STORAGE_ENDPOINT!,
      region: env.STORAGE_REGION!,
      bucket: env.STORAGE_BUCKET!,
      accessKeyId: env.STORAGE_ACCESS_KEY!,
      secretAccessKey: env.STORAGE_SECRET_KEY!,
      key,
      contentType: input.contentType,
      expiresInSeconds: 600,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === true,
    });
    const fileUrl = presigned.url.split("?")[0]!;
    return { ...presigned, key, fileUrl };
  }

  async updateTemplateUrl(input: {
    businessId: string;
    actorId: string;
    locale: ContractTemplateLocale;
    fileUrl: string | null;
  }) {
    const data =
      input.locale === "nl"
        ? { contractTemplateUrlNl: input.fileUrl }
        : { contractTemplateUrlFr: input.fileUrl };

    const updated = await this.db.business.update({
      where: { id: input.businessId },
      data,
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "BUSINESS_SETTINGS_UPDATED",
        entityType: "Business",
        entityId: input.businessId,
        metadata: { contractTemplateLocale: input.locale },
      },
    });

    return {
      contractTemplateUrlNl: updated.contractTemplateUrlNl,
      contractTemplateUrlFr: updated.contractTemplateUrlFr,
    };
  }

  fieldSpec() {
    return { fields: CONTRACT_TEMPLATE_FIELD_NAMES };
  }

  async previewFilledPdf(input: {
    businessId: string;
    userId: string;
    locale?: ContractTemplateLocale;
  }): Promise<{ pdfBase64: string; usedTemplate: boolean }> {
    const prefill = await buildContractPrefill(this.db, {
      businessId: input.businessId,
      userId: input.userId,
    });
    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
      select: {
        contractTemplateUrlNl: true,
        contractTemplateUrlFr: true,
      },
    });
    const locale = input.locale ?? "nl";
    const templateBytes = business
      ? await loadBusinessTemplate(business, locale)
      : null;

    const bytes = await generateContractPdf({
      pdfInput: prefill.pdfInput,
      fieldValues: prefill.fieldValues,
      templateBytes,
    });

    return {
      pdfBase64: Buffer.from(bytes).toString("base64"),
      usedTemplate: Boolean(templateBytes),
    };
  }

  async defaultTemplateBytes(): Promise<Uint8Array> {
    return createDefaultFillableTemplate();
  }
}

export { buildContractPrefill, fieldValuesWithSignature };

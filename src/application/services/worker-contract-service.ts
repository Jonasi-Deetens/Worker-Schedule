import { createHash } from "node:crypto";
import type { ContractStatus, ContractType, PrismaClient } from "@prisma/client";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { logger } from "@/infrastructure/logging/logger";
import {
  generateContractPdf,
  type ContractTemplateLocale,
} from "@/infrastructure/contracts/contract-pdf";
import { fillContractWithSignatures } from "@/infrastructure/contracts/contract-signature-pdf";
import { loadContractTemplateBytes } from "@/infrastructure/contracts/contract-template-loader";
import {
  buildContractPrefill,
  fieldValuesWithSignedAt,
  type ContractSendOverrides,
} from "./contract-field-mapper";
import { isStorageConfigured } from "./document-service";
import {
  contractEmployerSignatureKey,
  contractPdfKey,
  contractStudentSignatureKey,
  uploadBytes,
} from "@/infrastructure/storage/s3-upload";
import { parseSignaturePngBase64, loadSignaturePngBytes } from "@/lib/signature-image";
import { NotificationService } from "./notification-service";

function withinTwelveMonths(start: Date, end: Date): boolean {
  const maxEnd = new Date(start);
  maxEnd.setMonth(maxEnd.getMonth() + 12);
  return end.getTime() <= maxEnd.getTime();
}

async function storeSignaturePng(
  contractId: string,
  role: "student" | "employer",
  pngBytes: Uint8Array,
): Promise<string> {
  if (isStorageConfigured()) {
    const key =
      role === "student"
        ? contractStudentSignatureKey(contractId)
        : contractEmployerSignatureKey(contractId);
    return uploadBytes({
      key,
      body: pngBytes,
      contentType: "image/png",
    });
  }
  const b64 = Buffer.from(pngBytes).toString("base64");
  return `data:image/png;base64,${b64}`;
}

export class WorkerContractService {
  private readonly notifications: NotificationService;

  constructor(private readonly db: PrismaClient) {
    this.notifications = new NotificationService(db);
  }

  listForWorker(userId: string, businessId: string) {
    return this.db.workerContract.findMany({
      where: { userId, businessId },
      orderBy: { createdAt: "desc" },
    });
  }

  listPendingForWorker(userId: string, businessId: string) {
    return this.db.workerContract.findMany({
      where: { userId, businessId, status: "SENT" },
      orderBy: { sentAt: "desc" },
    });
  }

  listPendingEmployerSignature(businessId: string) {
    return this.db.workerContract.findMany({
      where: { businessId, status: "WORKER_SIGNED" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { studentSignedAt: "desc" },
    });
  }

  listForBusiness(businessId: string, userId?: string) {
    return this.db.workerContract.findMany({
      where: {
        businessId,
        ...(userId ? { userId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async prefillForWorker(input: {
    businessId: string;
    userId: string;
    overrides?: ContractSendOverrides;
    locale?: ContractTemplateLocale;
  }) {
    return buildContractPrefill(this.db, {
      businessId: input.businessId,
      userId: input.userId,
      overrides: input.overrides,
      locale: input.locale,
    });
  }

  async send(input: {
    businessId: string;
    userId: string;
    actorId: string;
    title?: string;
    fileUrl?: string;
    contractType?: ContractType;
    startDate?: Date | null;
    endDate?: Date | null;
    scheduleText?: string | null;
    hourlyWageCents?: number | null;
    jobDescription?: string | null;
    locale?: ContractTemplateLocale;
    skipCompletenessCheck?: boolean;
  }) {
    const membership = await this.db.membership.findFirst({
      where: {
        businessId: input.businessId,
        userId: input.userId,
        status: "ACTIVE",
      },
    });
    if (!membership) throw new Error("Worker not found in this business");

    const prefill = await buildContractPrefill(this.db, {
      businessId: input.businessId,
      userId: input.userId,
      overrides: {
        title: input.title,
        contractType: input.contractType,
        startDate: input.startDate,
        endDate: input.endDate,
        scheduleText: input.scheduleText,
        hourlyWageCents: input.hourlyWageCents,
        jobDescription: input.jobDescription,
      },
      locale: input.locale,
    });

    if (!input.skipCompletenessCheck && !prefill.completeness.ready) {
      throw new Error("errors.contractIncomplete");
    }

    if (!withinTwelveMonths(prefill.startDate, prefill.endDate)) {
      throw new Error("errors.contractTooLong");
    }

    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
      select: {
        contractTemplateUrlNl: true,
        contractTemplateUrlFr: true,
      },
    });
    const locale = input.locale ?? "nl";
    const templateBytes = business
      ? await loadContractTemplateBytes(business, locale)
      : await loadContractTemplateBytes({}, locale);

    const employerSnapshot = prefill.pdfInput.employer;
    const studentSnapshot = prefill.pdfInput.student;

    let pdfUrl: string | null = input.fileUrl ?? null;
    let pdfHash: string | null = null;
    try {
      const bytes = await generateContractPdf({
        pdfInput: prefill.pdfInput,
        fieldValues: prefill.fieldValues,
        templateBytes,
      });
      pdfHash = createHash("sha256").update(bytes).digest("hex");
      if (isStorageConfigured()) {
        pdfUrl = await uploadBytes({
          key: contractPdfKey(input.userId),
          body: bytes,
          contentType: "application/pdf",
        });
      }
    } catch (err) {
      logger.warn({
        event: "contract.pdf.failed",
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const contract = await this.db.workerContract.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        title: prefill.title,
        body: null,
        fileUrl: input.fileUrl,
        contractType: prefill.contractType,
        status: "SENT",
        sentAt: new Date(),
        startDate: prefill.startDate,
        endDate: prefill.endDate,
        scheduleText: prefill.scheduleText,
        hourlyWageCents: prefill.hourlyWageCents,
        jobDescription: prefill.jobDescription,
        employerSnapshot,
        studentSnapshot,
        pdfUrl,
        pdfHash,
      },
    });

    await this.notifications.create({
      userId: input.userId,
      type: "CONTRACT_SENT",
      title: "Contract awaiting your signature",
      body: prefill.title,
      payload: { contractId: contract.id },
      url: "/me/contracts",
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "CONTRACT_SENT",
        entityType: "WorkerContract",
        entityId: contract.id,
        metadata: { workerId: input.userId, templated: Boolean(templateBytes) },
      },
    });

    publishEvent(input.businessId, { type: "contract.changed", userId: input.userId });
    return contract;
  }

  async signAsWorker(input: {
    contractId: string;
    userId: string;
    businessId: string;
    signaturePngBase64: string;
    signerLabel?: string | null;
    signatureIp?: string | null;
  }) {
    const contract = await this.db.workerContract.findFirst({
      where: {
        id: input.contractId,
        userId: input.userId,
        businessId: input.businessId,
        status: "SENT",
      },
    });
    if (!contract) throw new Error("Contract not found or not awaiting signature");

    const pngBytes = parseSignaturePngBase64(input.signaturePngBase64);
    const studentSignedAt = new Date();
    const studentSignatureUrl = await storeSignaturePng(
      contract.id,
      "student",
      pngBytes,
    );
    const label = input.signerLabel?.trim() || null;

    const updated = await this.db.workerContract.update({
      where: { id: contract.id },
      data: {
        status: "WORKER_SIGNED",
        studentSignatureUrl,
        studentSignedAt,
        studentSignatureIp: input.signatureIp ?? null,
        studentSignerLabel: label,
      },
    });

    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
      select: { ownerId: true, name: true },
    });

    if (business?.ownerId) {
      await this.notifications.create({
        userId: business.ownerId,
        type: "CONTRACT_WORKER_SIGNED",
        title: "Contract awaiting employer signature",
        body: contract.title,
        payload: { contractId: contract.id, workerId: input.userId },
        url: "/contracts",
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "CONTRACT_WORKER_SIGNED",
        entityType: "WorkerContract",
        entityId: contract.id,
        metadata: { studentSignedAt: studentSignedAt.toISOString() },
      },
    });

    publishEvent(input.businessId, { type: "contract.changed", userId: input.userId });
    return updated;
  }

  async signAsEmployer(input: {
    contractId: string;
    actorId: string;
    businessId: string;
    signaturePngBase64: string;
    signerLabel?: string | null;
    signatureIp?: string | null;
    locale?: ContractTemplateLocale;
  }) {
    const contract = await this.db.workerContract.findFirst({
      where: {
        id: input.contractId,
        businessId: input.businessId,
        status: "WORKER_SIGNED",
      },
    });
    if (!contract) {
      throw new Error("Contract not found or not awaiting employer signature");
    }
    if (!contract.studentSignatureUrl) {
      throw new Error("Student signature is missing");
    }

    const employerPng = parseSignaturePngBase64(input.signaturePngBase64);
    const employerSignedAt = new Date();
    const signedAt = employerSignedAt;
    const employerSignatureUrl = await storeSignaturePng(
      contract.id,
      "employer",
      employerPng,
    );
    const label = input.signerLabel?.trim() || null;
    const locale = input.locale ?? "nl";

    let pdfUrl = contract.pdfUrl;
    let pdfHash = contract.pdfHash;

    try {
      const studentPng = await loadSignaturePngBytes(contract.studentSignatureUrl);
      const prefill = await buildContractPrefill(this.db, {
        businessId: input.businessId,
        userId: contract.userId,
        overrides: {
          title: contract.title,
          contractType: contract.contractType ?? undefined,
          startDate: contract.startDate,
          endDate: contract.endDate,
          scheduleText: contract.scheduleText,
          hourlyWageCents: contract.hourlyWageCents,
          jobDescription: contract.jobDescription,
        },
        locale,
      });

      const signedFields = fieldValuesWithSignedAt(prefill.fieldValues, signedAt);

      const business = await this.db.business.findUnique({
        where: { id: input.businessId },
        select: {
          contractTemplateUrlNl: true,
          contractTemplateUrlFr: true,
        },
      });
      const templateBytes = business
        ? await loadContractTemplateBytes(business, locale)
        : await loadContractTemplateBytes({}, locale);

      const bytes = await fillContractWithSignatures({
        templateBytes,
        fieldValues: signedFields,
        locale,
        studentSignaturePng: studentPng,
        employerSignaturePng: employerPng,
        flatten: true,
      });
      pdfHash = createHash("sha256").update(bytes).digest("hex");
      if (isStorageConfigured()) {
        pdfUrl = await uploadBytes({
          key: contractPdfKey(contract.userId),
          body: bytes,
          contentType: "application/pdf",
        });
      }
    } catch (err) {
      logger.warn({
        event: "contract.pdf.employer-sign.failed",
        contractId: contract.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const updated = await this.db.workerContract.update({
      where: { id: contract.id },
      data: {
        status: "SIGNED",
        signedAt,
        employerSignatureUrl,
        employerSignedAt,
        employerSignatureIp: input.signatureIp ?? null,
        employerSignerId: input.actorId,
        employerSignerLabel: label,
        pdfUrl,
        pdfHash,
      },
    });

    await this.notifications.create({
      userId: contract.userId,
      type: "CONTRACT_FULLY_SIGNED",
      title: "Contract fully signed",
      body: contract.title,
      payload: { contractId: contract.id },
      url: "/me/contracts",
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "CONTRACT_EMPLOYER_SIGNED",
        entityType: "WorkerContract",
        entityId: contract.id,
        metadata: { signedAt: signedAt.toISOString() },
      },
    });

    publishEvent(input.businessId, {
      type: "contract.changed",
      userId: contract.userId,
    });
    return updated;
  }

  async decline(input: {
    contractId: string;
    userId: string;
    businessId: string;
  }) {
    const contract = await this.db.workerContract.findFirst({
      where: {
        id: input.contractId,
        userId: input.userId,
        businessId: input.businessId,
        status: "SENT",
      },
    });
    if (!contract) throw new Error("Contract not found or not awaiting signature");

    const updated = await this.db.workerContract.update({
      where: { id: contract.id },
      data: { status: "DECLINED" },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "CONTRACT_DECLINED",
        entityType: "WorkerContract",
        entityId: contract.id,
      },
    });

    publishEvent(input.businessId, { type: "contract.changed", userId: input.userId });
    return updated;
  }

  async hasSignedContract(userId: string, businessId: string): Promise<boolean> {
    const signed = await this.db.workerContract.findFirst({
      where: { userId, businessId, status: "SIGNED" },
      select: { id: true },
    });
    return Boolean(signed);
  }
}

export type { ContractStatus };

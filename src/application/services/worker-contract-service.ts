import { createHash } from "node:crypto";
import type { ContractStatus, ContractType, PrismaClient } from "@prisma/client";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { logger } from "@/infrastructure/logging/logger";
import { decryptPiiNullable } from "@/infrastructure/crypto/pii";
import {
  generateContractPdf,
  type ContractPdfInput,
} from "@/infrastructure/contracts/contract-pdf";
import { isStorageConfigured } from "./document-service";
import { contractPdfKey, uploadBytes } from "@/infrastructure/storage/s3-upload";
import { NotificationService } from "./notification-service";

/**
 * Belgian student contracts may not exceed 12 uninterrupted months. Returns
 * true when [start, end] is within that window (inclusive).
 */
function withinTwelveMonths(start: Date, end: Date): boolean {
  const maxEnd = new Date(start);
  maxEnd.setMonth(maxEnd.getMonth() + 12);
  return end.getTime() <= maxEnd.getTime();
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

  async send(input: {
    businessId: string;
    userId: string;
    actorId: string;
    title: string;
    body?: string;
    fileUrl?: string;
    contractType?: ContractType;
    startDate?: Date | null;
    endDate?: Date | null;
    scheduleText?: string | null;
    hourlyWageCents?: number | null;
    jobDescription?: string | null;
  }) {
    const membership = await this.db.membership.findFirst({
      where: {
        businessId: input.businessId,
        userId: input.userId,
        status: "ACTIVE",
      },
    });
    if (!membership) throw new Error("Worker not found in this business");

    // Belgian rule: a student contract may not exceed 12 uninterrupted months.
    if (
      input.startDate &&
      input.endDate &&
      !withinTwelveMonths(input.startDate, input.endDate)
    ) {
      throw new Error("errors.contractTooLong");
    }

    // Snapshot the legally-relevant employer + student data at send time so the
    // signed record is self-contained even if profiles change later.
    const [business, student] = await Promise.all([
      this.db.business.findUnique({
        where: { id: input.businessId },
        select: {
          name: true,
          dimonaEmployerId: true,
          addressLine: true,
          postalCode: true,
          city: true,
          cbeNumber: true,
        },
      }),
      this.db.user.findUnique({
        where: { id: input.userId },
        select: {
          name: true,
          nationalNumber: true,
          addressLine: true,
          postalCode: true,
          city: true,
        },
      }),
    ]);

    const studentAddress = [
      student?.addressLine,
      [student?.postalCode, student?.city].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");

    const employerAddress = [
      business?.addressLine,
      [business?.postalCode, business?.city].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");
    const employerSnapshot = {
      name: business?.name ?? null,
      enterpriseNumber:
        business?.cbeNumber ?? business?.dimonaEmployerId ?? null,
      address: employerAddress || null,
    };
    const studentSnapshot = {
      name: student?.name ?? null,
      nationalNumber: decryptPiiNullable(student?.nationalNumber ?? null),
      address: studentAddress || null,
    };

    // Generate the contract PDF server-side and persist its sha256 hash. When
    // object storage is configured we upload it and store the URL; otherwise we
    // degrade gracefully — the hash is still recorded so the document is
    // verifiable once storage is set up.
    const pdfInput: ContractPdfInput = {
      title: input.title,
      employer: employerSnapshot,
      student: studentSnapshot,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      scheduleText: input.scheduleText ?? null,
      hourlyWageCents: input.hourlyWageCents ?? null,
      jobDescription: input.jobDescription ?? null,
      contractType: input.contractType ?? null,
    };
    let pdfUrl: string | null = input.fileUrl ?? null;
    let pdfHash: string | null = null;
    try {
      const bytes = await generateContractPdf(pdfInput);
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
        title: input.title,
        body: input.body,
        fileUrl: input.fileUrl,
        contractType: input.contractType,
        status: "SENT",
        sentAt: new Date(),
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        scheduleText: input.scheduleText ?? null,
        hourlyWageCents: input.hourlyWageCents ?? null,
        jobDescription: input.jobDescription ?? null,
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
      body: input.title,
      payload: { contractId: contract.id },
      url: "/me",
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "CONTRACT_SENT",
        entityType: "WorkerContract",
        entityId: contract.id,
        metadata: { workerId: input.userId },
      },
    });

    publishEvent(input.businessId, { type: "contract.changed", userId: input.userId });
    return contract;
  }

  async sign(input: {
    contractId: string;
    userId: string;
    businessId: string;
    signatureName: string;
    signatureIp?: string | null;
  }) {
    // Only a SENT contract can be signed. Because a SIGNED contract never
    // returns from this query, the signature is effectively immutable — there
    // is no path to re-sign or edit it; a correction must be a brand-new
    // contract version sent via `send`.
    const contract = await this.db.workerContract.findFirst({
      where: {
        id: input.contractId,
        userId: input.userId,
        businessId: input.businessId,
        status: "SENT",
      },
    });
    if (!contract) throw new Error("Contract not found or not awaiting signature");

    const trimmed = input.signatureName.trim();
    if (trimmed.length < 2) {
      throw new Error("Signature name is too short");
    }

    const signedAt = new Date();
    const updated = await this.db.workerContract.update({
      where: { id: contract.id },
      data: {
        status: "SIGNED",
        signedAt,
        signatureName: trimmed,
        signatureIp: input.signatureIp ?? null,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "CONTRACT_SIGNED",
        entityType: "WorkerContract",
        entityId: contract.id,
        metadata: { signedAt: signedAt.toISOString() },
      },
    });

    publishEvent(input.businessId, { type: "contract.changed", userId: input.userId });
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

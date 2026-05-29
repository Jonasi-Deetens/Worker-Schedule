import type { ContractStatus, ContractType, PrismaClient } from "@prisma/client";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { NotificationService } from "./notification-service";

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
  }) {
    const membership = await this.db.membership.findFirst({
      where: {
        businessId: input.businessId,
        userId: input.userId,
        status: "ACTIVE",
      },
    });
    if (!membership) throw new Error("Worker not found in this business");

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

    const updated = await this.db.workerContract.update({
      where: { id: contract.id },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
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

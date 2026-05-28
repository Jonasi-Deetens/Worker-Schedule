import type { PrismaClient } from "@prisma/client";
import { EmailService } from "./email-service";
import { logger } from "@/infrastructure/logging/logger";

/**
 * Time-off ("I cannot work") is distinct from Availability ("I can"). When a
 * request is APPROVED it blocks new direct assignments and applications inside
 * the range. We expose helpers used by other services to check that overlap.
 */
export class TimeOffService {
  constructor(
    private readonly db: PrismaClient,
    private readonly emails: EmailService = new EmailService(),
  ) {}

  async request(input: {
    userId: string;
    startsAt: Date;
    endsAt: Date;
    reason?: string;
  }) {
    if (input.endsAt <= input.startsAt) {
      throw new Error("End time must be after start time");
    }

    const request = await this.db.timeOffRequest.create({
      data: {
        userId: input.userId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "TIMEOFF_REQUESTED",
        entityType: "TimeOffRequest",
        entityId: request.id,
      },
    });

    logger.info({ event: "timeoff.requested", id: request.id });
    return request;
  }

  async listForUser(userId: string) {
    return this.db.timeOffRequest.findMany({
      where: { userId },
      orderBy: { startsAt: "desc" },
    });
  }

  async listForBusiness(businessId: string, status?: "PENDING" | "APPROVED" | "REJECTED") {
    return this.db.timeOffRequest.findMany({
      where: { user: { businessId }, status },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { startsAt: "asc" },
    });
  }

  async decide(input: {
    id: string;
    ownerId: string;
    businessId: string;
    approve: boolean;
  }) {
    const request = await this.db.timeOffRequest.findFirst({
      where: { id: input.id, user: { businessId: input.businessId } },
      include: { user: true },
    });
    if (!request) throw new Error("Time-off request not found");

    const newStatus = input.approve ? "APPROVED" : "REJECTED";
    const updated = await this.db.timeOffRequest.update({
      where: { id: request.id },
      data: {
        status: newStatus,
        decidedById: input.ownerId,
        decidedAt: new Date(),
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: input.approve ? "TIMEOFF_APPROVED" : "TIMEOFF_REJECTED",
        entityType: "TimeOffRequest",
        entityId: request.id,
      },
    });

    await this.db.notification.create({
      data: {
        userId: request.userId,
        type: "TIMEOFF_DECIDED",
        title: input.approve ? "Time-off approved" : "Time-off rejected",
        body: `Your request for ${request.startsAt.toISOString().slice(0, 10)} was ${input.approve ? "approved" : "rejected"}.`,
        payload: { requestId: request.id, approved: input.approve },
      },
    });

    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
    });

    if (business) {
      await this.emails.sendTimeOffDecision(request.user, {
        recipientName: request.user.name,
        businessName: business.name,
        range: `${request.startsAt.toISOString().slice(0, 10)} - ${request.endsAt.toISOString().slice(0, 10)}`,
        approved: input.approve,
      });
    }

    return updated;
  }

  async cancel(input: { id: string; userId: string }) {
    const request = await this.db.timeOffRequest.findFirst({
      where: { id: input.id, userId: input.userId },
    });
    if (!request) throw new Error("Time-off request not found");
    if (request.status !== "PENDING") {
      throw new Error("Can only cancel pending requests");
    }
    return this.db.timeOffRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED" },
    });
  }

  /** Returns true if the user has an APPROVED time-off overlapping the range. */
  async hasConflict(userId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const conflict = await this.db.timeOffRequest.findFirst({
      where: {
        userId,
        status: "APPROVED",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    return !!conflict;
  }
}

import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";

export class AvailabilityService {
  constructor(private readonly db: PrismaClient) {}

  async list(input: { userId: string; from: Date; to: Date }) {
    return this.db.availability.findMany({
      where: {
        userId: input.userId,
        startsAt: { lt: input.to },
        endsAt: { gt: input.from },
      },
      orderBy: { startsAt: "asc" },
    });
  }

  /**
   * Lists all availability blocks for workers belonging to a business so the
   * owner-facing overlay can render the supply side of the calendar. We do not
   * filter by approval status - owners want to see every signal of intent.
   */
  async listForBusiness(input: { businessId: string; from: Date; to: Date }) {
    return this.db.availability.findMany({
      where: {
        startsAt: { lt: input.to },
        endsAt: { gt: input.from },
        user: { businessId: input.businessId },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
    });
  }

  async set(input: { userId: string; startsAt: Date; endsAt: Date }) {
    if (input.endsAt <= input.startsAt) {
      throw new Error("End time must be after start time");
    }

    const availability = await this.db.availability.create({
      data: {
        userId: input.userId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "AVAILABILITY_SET",
        entityType: "Availability",
        entityId: availability.id,
      },
    });

    logger.info({
      event: "availability.set",
      userId: input.userId,
      availabilityId: availability.id,
    });

    return availability;
  }

  async delete(input: { id: string; userId: string }) {
    const existing = await this.db.availability.findFirst({
      where: { id: input.id, userId: input.userId },
    });
    if (!existing) {
      throw new Error("Availability not found");
    }

    await this.db.availability.delete({ where: { id: input.id } });

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "AVAILABILITY_DELETED",
        entityType: "Availability",
        entityId: input.id,
      },
    });
  }

  async listTemplates(userId: string) {
    return this.db.availabilityTemplate.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }

  async setTemplate(input: {
    userId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    validUntil?: Date | null;
  }) {
    if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      throw new Error("dayOfWeek must be between 0 and 6");
    }
    if (input.startTime >= input.endTime) {
      throw new Error("End time must be after start time");
    }
    return this.db.availabilityTemplate.create({
      data: {
        userId: input.userId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        validUntil: input.validUntil ?? null,
      },
    });
  }

  async deleteTemplate(input: { id: string; userId: string }) {
    const existing = await this.db.availabilityTemplate.findFirst({
      where: { id: input.id, userId: input.userId },
    });
    if (!existing) throw new Error("Template not found");
    await this.db.availabilityTemplate.delete({ where: { id: input.id } });
  }

  /**
   * Generates concrete `Availability` rows from a user's templates for every
   * day in `[from, to)`. Idempotent: skips a slot if an existing availability
   * already covers it exactly. Returns the number of rows created.
   */
  async materialiseTemplates(userId: string, from: Date, to: Date): Promise<number> {
    const templates = await this.db.availabilityTemplate.findMany({
      where: { userId },
    });
    if (templates.length === 0) return 0;

    const existing = await this.db.availability.findMany({
      where: { userId, startsAt: { gte: from, lt: to } },
      select: { startsAt: true, endsAt: true },
    });
    const existingKeys = new Set(
      existing.map((a) => `${a.startsAt.toISOString()}|${a.endsAt.toISOString()}`),
    );

    const toCreate: { userId: string; startsAt: Date; endsAt: Date }[] = [];
    const oneDay = 24 * 60 * 60 * 1000;
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + oneDay)) {
      const dow = d.getDay();
      for (const tpl of templates) {
        if (tpl.dayOfWeek !== dow) continue;
        if (tpl.validUntil && tpl.validUntil < d) continue;
        if (tpl.validFrom > d) continue;
        const [sh, sm] = tpl.startTime.split(":").map(Number);
        const [eh, em] = tpl.endTime.split(":").map(Number);
        const startsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh ?? 0, sm ?? 0);
        const endsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh ?? 0, em ?? 0);
        const key = `${startsAt.toISOString()}|${endsAt.toISOString()}`;
        if (existingKeys.has(key)) continue;
        toCreate.push({ userId, startsAt, endsAt });
      }
    }

    if (toCreate.length === 0) return 0;
    const result = await this.db.availability.createMany({ data: toCreate });
    return result.count;
  }
}

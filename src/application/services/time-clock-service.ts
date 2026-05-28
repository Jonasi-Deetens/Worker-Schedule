import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";

export class TimeClockService {
  constructor(private readonly db: PrismaClient) {}

  async activeFor(userId: string) {
    return this.db.timeEntry.findFirst({
      where: { userId, clockOutAt: null },
      include: { shift: true },
      orderBy: { clockInAt: "desc" },
    });
  }

  async clockIn(input: { userId: string; shiftId: string | null }) {
    const open = await this.db.timeEntry.findFirst({
      where: { userId: input.userId, clockOutAt: null },
    });
    if (open) throw new Error("Already clocked in");

    return this.db.timeEntry.create({
      data: {
        userId: input.userId,
        shiftId: input.shiftId ?? undefined,
        clockInAt: new Date(),
      },
    });
  }

  async clockOut(input: {
    id: string;
    userId: string;
    breakMinutes: number;
    notes?: string;
  }) {
    const entry = await this.db.timeEntry.findFirst({
      where: { id: input.id, userId: input.userId, clockOutAt: null },
    });
    if (!entry) throw new Error("Open time entry not found");

    const clockOutAt = new Date();
    if (clockOutAt <= entry.clockInAt) {
      throw new Error("Clock-out must be after clock-in");
    }

    const updated = await this.db.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockOutAt,
        breakMinutes: input.breakMinutes,
        notes: input.notes,
      },
    });

    logger.info({ event: "timeClock.clockOut", entryId: entry.id });
    return updated;
  }

  async listPending(businessId: string, from?: Date, to?: Date) {
    return this.db.timeEntry.findMany({
      where: {
        approvedAt: null,
        clockOutAt: { not: null },
        user: { businessId },
        ...(from || to
          ? {
              clockInAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            roleLabel: true,
          },
        },
      },
      orderBy: { clockInAt: "asc" },
    });
  }

  async listApproved(businessId: string, from?: Date, to?: Date) {
    return this.db.timeEntry.findMany({
      where: {
        approvedAt: { not: null },
        clockOutAt: { not: null },
        user: { businessId },
        ...(from || to
          ? {
              clockInAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            roleLabel: true,
          },
        },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { approvedAt: "desc" },
    });
  }

  async listMine(userId: string, from: Date, to: Date) {
    return this.db.timeEntry.findMany({
      where: { userId, clockInAt: { gte: from, lte: to } },
      include: {
        shift: {
          select: { id: true, startsAt: true, endsAt: true, roleLabel: true },
        },
      },
      orderBy: { clockInAt: "desc" },
    });
  }

  async approveMany(input: {
    ids: string[];
    businessId: string;
    approverId: string;
  }) {
    const entries = await this.db.timeEntry.findMany({
      where: { id: { in: input.ids }, user: { businessId: input.businessId } },
      select: { id: true },
    });
    const validIds = entries.map((e) => e.id);
    if (validIds.length === 0) return { count: 0 };

    const result = await this.db.timeEntry.updateMany({
      where: { id: { in: validIds } },
      data: { approvedAt: new Date(), approvedById: input.approverId },
    });

    for (const id of validIds) {
      await this.db.auditEvent.create({
        data: {
          userId: input.approverId,
          action: "TIME_ENTRY_APPROVED",
          entityType: "TimeEntry",
          entityId: id,
        },
      });
    }

    return { count: result.count };
  }

  /**
   * Computes worked minutes for a single entry, deducting breaks. Returns 0
   * for entries that have not been clocked out yet.
   */
  static workedMinutes(entry: {
    clockInAt: Date;
    clockOutAt: Date | null;
    breakMinutes: number;
  }): number {
    if (!entry.clockOutAt) return 0;
    const total = Math.round(
      (entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 60000,
    );
    return Math.max(0, total - entry.breakMinutes);
  }
}

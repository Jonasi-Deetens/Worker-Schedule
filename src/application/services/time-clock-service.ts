import type { PrismaClient } from "@prisma/client";
import { publish as publishEvent } from "@/infrastructure/events/bus";
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

    // A linked shift must belong to one of the worker's own assignments,
    // otherwise the entry would be attributed to a shift they never worked.
    if (input.shiftId) {
      const assignment = await this.db.shiftAssignment.findFirst({
        where: { shiftId: input.shiftId, userId: input.userId },
      });
      if (!assignment) {
        throw new Error("Cannot clock in against a shift you are not assigned to");
      }
    }

    const entry = await this.db.timeEntry.create({
      data: {
        userId: input.userId,
        shiftId: input.shiftId ?? undefined,
        clockInAt: new Date(),
      },
    });

    await this.publishEntryCreated(input.userId);
    return entry;
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

    const grossMinutes = Math.round(
      (clockOutAt.getTime() - entry.clockInAt.getTime()) / 60000,
    );
    if (input.breakMinutes > grossMinutes) {
      throw new Error("Cannot record more break time than time worked");
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

    // Let managers know hours are awaiting review.
    const worker = await this.db.user.findUnique({
      where: { id: input.userId },
      select: { name: true, businessId: true },
    });
    if (worker?.businessId) {
      await this.notifyManagers(worker.businessId, {
        type: "TIME_ENTRY_SUBMITTED",
        title: "Hours submitted",
        body: `${worker.name} submitted hours for review.`,
        payload: { timeEntryId: entry.id, userId: input.userId },
        url: "/payroll/time-entries",
      });
      publishEvent(worker.businessId, {
        type: "time_entry.created",
        userId: input.userId,
      });
    }

    return updated;
  }

  async listPending(businessId: string, from?: Date, to?: Date) {
    return this.db.timeEntry.findMany({
      where: {
        status: "PENDING",
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
    // Only closed entries that are still PENDING are approvable — re-approving
    // or approving an open entry is a no-op.
    const entries = await this.db.timeEntry.findMany({
      where: {
        id: { in: input.ids },
        user: { businessId: input.businessId },
        clockOutAt: { not: null },
        status: "PENDING",
      },
      select: { id: true, userId: true, shiftId: true },
    });
    const validIds = entries.map((e) => e.id);
    if (validIds.length === 0) return { count: 0, warnings: [] };

    // Reconciliation: approving hours for a shift the worker was marked a
    // NO_SHOW on is contradictory. We don't block it (the manager may be
    // correcting the attendance), but we surface a warning per affected entry.
    const warnings = await this.collectNoShowWarnings(entries);

    const result = await this.db.timeEntry.updateMany({
      where: { id: { in: validIds } },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedById: input.approverId,
      },
    });

    for (const entry of entries) {
      await this.db.auditEvent.create({
        data: {
          userId: input.approverId,
          action: "TIME_ENTRY_APPROVED",
          entityType: "TimeEntry",
          entityId: entry.id,
        },
      });
      await this.db.notification.create({
        data: {
          userId: entry.userId,
          type: "TIME_ENTRY_APPROVED",
          title: "Hours approved",
          body: "Your submitted hours were approved.",
          payload: { timeEntryId: entry.id },
        },
      });
    }

    return { count: result.count, warnings };
  }

  /**
   * For a set of (closed) time entries, returns a warning per entry whose
   * linked shift assignment is marked NO_SHOW for that worker — used to flag
   * the attendance/payroll contradiction without blocking approval.
   */
  private async collectNoShowWarnings(
    entries: Array<{ id: string; userId: string; shiftId: string | null }>,
  ): Promise<Array<{ timeEntryId: string; code: string }>> {
    const withShift = entries.filter(
      (e): e is { id: string; userId: string; shiftId: string } =>
        typeof e.shiftId === "string" && e.shiftId.length > 0,
    );
    if (withShift.length === 0) return [];

    const noShows = await this.db.shiftAssignment.findMany({
      where: {
        attendance: "NO_SHOW",
        OR: withShift.map((e) => ({ userId: e.userId, shiftId: e.shiftId })),
      },
      select: { userId: true, shiftId: true },
    });
    if (noShows.length === 0) return [];

    const flagged = new Set(noShows.map((a) => `${a.userId}:${a.shiftId}`));
    return withShift
      .filter((e) => flagged.has(`${e.userId}:${e.shiftId}`))
      .map((e) => ({ timeEntryId: e.id, code: "errors.timeEntryShiftNoShow" }));
  }

  async rejectMany(input: {
    ids: string[];
    businessId: string;
    reviewerId: string;
    reason?: string;
  }) {
    const entries = await this.db.timeEntry.findMany({
      where: {
        id: { in: input.ids },
        user: { businessId: input.businessId },
        clockOutAt: { not: null },
        status: { not: "REJECTED" },
      },
      select: { id: true, userId: true },
    });
    const validIds = entries.map((e) => e.id);
    if (validIds.length === 0) return { count: 0 };

    const result = await this.db.timeEntry.updateMany({
      where: { id: { in: validIds } },
      data: {
        status: "REJECTED",
        approvedAt: null,
        approvedById: input.reviewerId,
        reviewNote: input.reason ?? null,
      },
    });

    for (const entry of entries) {
      await this.db.auditEvent.create({
        data: {
          userId: input.reviewerId,
          action: "TIME_ENTRY_REJECTED",
          entityType: "TimeEntry",
          entityId: entry.id,
          metadata: input.reason ? { reason: input.reason } : undefined,
        },
      });
      await this.db.notification.create({
        data: {
          userId: entry.userId,
          type: "TIME_ENTRY_REJECTED",
          title: "Hours rejected",
          body: input.reason
            ? `Your submitted hours were rejected: ${input.reason}`
            : "Your submitted hours were rejected.",
          payload: { timeEntryId: entry.id },
        },
      });
    }

    return { count: result.count };
  }

  async updateEntry(input: {
    id: string;
    businessId: string;
    reviewerId: string;
    clockInAt?: Date;
    clockOutAt?: Date;
    breakMinutes?: number;
    notes?: string | null;
  }) {
    const entry = await this.db.timeEntry.findFirst({
      where: { id: input.id, user: { businessId: input.businessId } },
    });
    if (!entry) throw new Error("Time entry not found");

    const clockInAt = input.clockInAt ?? entry.clockInAt;
    const clockOutAt =
      input.clockOutAt !== undefined ? input.clockOutAt : entry.clockOutAt;
    const breakMinutes =
      input.breakMinutes !== undefined ? input.breakMinutes : entry.breakMinutes;

    if (clockOutAt && clockOutAt <= clockInAt) {
      throw new Error("Clock-out must be after clock-in");
    }
    if (clockOutAt) {
      const grossMinutes = Math.round(
        (clockOutAt.getTime() - clockInAt.getTime()) / 60000,
      );
      if (breakMinutes > grossMinutes) {
        throw new Error("Cannot record more break time than time worked");
      }
    }

    const updated = await this.db.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockInAt: input.clockInAt,
        clockOutAt: input.clockOutAt,
        breakMinutes: input.breakMinutes,
        notes: input.notes === undefined ? undefined : input.notes,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.reviewerId,
        action: "TIME_ENTRY_EDITED",
        entityType: "TimeEntry",
        entityId: entry.id,
        metadata: {
          clockInAt: clockInAt.toISOString(),
          clockOutAt: clockOutAt ? clockOutAt.toISOString() : null,
          breakMinutes,
        },
      },
    });

    return updated;
  }

  /**
   * Sums approved worked minutes for a user inside a window, converted to
   * decimal hours. Only APPROVED, closed entries count toward worked hours.
   */
  async aggregateWorkedHours(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const entries = await this.db.timeEntry.findMany({
      where: {
        userId,
        status: "APPROVED",
        clockOutAt: { not: null },
        clockInAt: { gte: from, lte: to },
      },
      select: { clockInAt: true, clockOutAt: true, breakMinutes: true },
    });
    const minutes = entries.reduce(
      (sum, e) => sum + TimeClockService.workedMinutes(e),
      0,
    );
    return Math.round((minutes / 60) * 100) / 100;
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

  private async publishEntryCreated(userId: string) {
    const worker = await this.db.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (worker?.businessId) {
      publishEvent(worker.businessId, { type: "time_entry.created", userId });
    }
  }

  /**
   * Fans an in-app notification out to the owner and every active manager of a
   * business. Used for review queues that any manager can action.
   */
  private async notifyManagers(
    businessId: string,
    notification: {
      type: "TIME_ENTRY_SUBMITTED";
      title: string;
      body: string;
      payload?: Record<string, unknown>;
      url?: string;
    },
  ) {
    const recipients = await this.db.user.findMany({
      where: {
        businessId,
        role: { in: ["OWNER", "MANAGER"] },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    for (const recipient of recipients) {
      await this.db.notification.create({
        data: {
          userId: recipient.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          payload: notification.payload as object | undefined,
        },
      });
    }
  }
}

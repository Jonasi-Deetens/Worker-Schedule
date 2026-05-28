import type { PrismaClient } from "@prisma/client";
import {
  assertNoAssignmentOverlap,
  computeShiftDisplayStatus,
} from "@/domain/rules/scheduling";
import type { TimeRange } from "@/domain/types";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { DimonaService } from "./dimona-service";
import { WebhookService } from "./webhook-service";

export interface ShiftConflictWarning {
  userId: string;
  userName: string;
  conflictingShiftId: string;
  conflictingRange: TimeRange;
}

export class ShiftService {
  constructor(private readonly db: PrismaClient) {}

  async listForCalendar(input: {
    businessId: string;
    from: Date;
    to: Date;
    workerId?: string;
    workerSkillIds?: string[];
    /** When true, drafts (publishedAt = null) are returned too. Workers never see drafts. */
    includeDrafts?: boolean;
  }) {
    const skillFilter =
      input.workerSkillIds !== undefined
        ? {
            OR: [
              { requiredSkillId: null },
              { requiredSkillId: { in: input.workerSkillIds } },
            ],
          }
        : {};

    const shifts = await this.db.shift.findMany({
      where: {
        businessId: input.businessId,
        startsAt: { lt: input.to },
        endsAt: { gt: input.from },
        ...(input.includeDrafts ? {} : { publishedAt: { not: null } }),
        ...skillFilter,
      },
      include: {
        subscriptions: input.workerId
          ? { where: { userId: input.workerId } }
          : true,
        assignments: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        requiredSkill: { select: { id: true, name: true, color: true } },
        _count: {
          select: {
            subscriptions: { where: { status: "PENDING" } },
            assignments: true,
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    return shifts.map((shift) => ({
      ...shift,
      displayStatus: computeShiftDisplayStatus({
        shiftStatus: shift.status,
        approvedCount: shift._count.assignments,
        requiredSpots: shift.requiredSpots,
        pendingCount: shift._count.subscriptions,
      }),
      isDraft: shift.publishedAt === null,
    }));
  }

  /**
   * Aggregates owner-facing KPIs for a date range. Returned counts are based on
   * the same `displayStatus` rules used by the calendar so the numbers always
   * line up with the visible event blocks.
   */
  async kpis(input: { businessId: string; from: Date; to: Date }) {
    const shifts = await this.db.shift.findMany({
      where: {
        businessId: input.businessId,
        startsAt: { lt: input.to },
        endsAt: { gt: input.from },
      },
      select: {
        id: true,
        status: true,
        requiredSpots: true,
        startsAt: true,
        endsAt: true,
        assignments: {
          include: {
            user: { select: { hourlyRate: true } },
          },
        },
        _count: {
          select: {
            subscriptions: { where: { status: "PENDING" } },
            assignments: true,
          },
        },
      },
    });

    let open = 0;
    let pending = 0;
    let filled = 0;
    let cancelled = 0;
    let approvedSpots = 0;
    let totalSpots = 0;
    let scheduledHours = 0;
    let labourCostCents = 0;

    for (const shift of shifts) {
      const status = computeShiftDisplayStatus({
        shiftStatus: shift.status,
        approvedCount: shift._count.assignments,
        requiredSpots: shift.requiredSpots,
        pendingCount: shift._count.subscriptions,
      });
      if (status === "Open") open += 1;
      else if (status === "Pending") pending += 1;
      else if (status === "Approved/Filled") filled += 1;
      else if (status === "Cancelled") cancelled += 1;

      if (shift.status !== "CANCELLED") {
        approvedSpots += shift._count.assignments;
        totalSpots += shift.requiredSpots;

        const hours =
          (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
        for (const a of shift.assignments) {
          scheduledHours += hours;
          const rate = a.user.hourlyRate ? Number(a.user.hourlyRate) : 0;
          labourCostCents += Math.round(rate * hours * 100);
        }
      }
    }

    const capacityPct =
      totalSpots > 0 ? Math.round((approvedSpots / totalSpots) * 100) : 0;
    const labourCost = labourCostCents / 100;
    const costPerHour = scheduledHours > 0 ? labourCost / scheduledHours : 0;

    return {
      open,
      pending,
      filled,
      cancelled,
      total: shifts.length,
      approvedSpots,
      totalSpots,
      capacityPct,
      scheduledHours: Math.round(scheduledHours * 100) / 100,
      labourCost: Math.round(labourCost * 100) / 100,
      costPerHour: Math.round(costPerHour * 100) / 100,
    };
  }

  async create(input: {
    businessId: string;
    ownerId: string;
    startsAt: Date;
    endsAt: Date;
    roleLabel: string;
    requiredSpots: number;
    notes?: string;
    requiredSkillId?: string | null;
    /** When omitted, the shift is created as a draft (publishedAt = null). */
    publish?: boolean;
  }) {
    if (input.endsAt <= input.startsAt) {
      throw new Error("End time must be after start time");
    }
    if (input.requiredSpots < 1) {
      throw new Error("Required spots must be at least 1");
    }

    const shift = await this.db.shift.create({
      data: {
        businessId: input.businessId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        notes: input.notes,
        requiredSkillId: input.requiredSkillId ?? null,
        publishedAt: input.publish ? new Date() : null,
        publishedById: input.publish ? input.ownerId : null,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_CREATED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    logger.info({ event: "shift.created", shiftId: shift.id, draft: !input.publish });
    publishEvent(input.businessId, { type: "shift.updated", shiftId: shift.id });
    void new WebhookService(this.db).fan(
      "shift.created",
      { shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt },
      input.businessId,
    );

    return shift;
  }

  /**
   * Publishes a batch of shifts. Only previously-draft shifts in the given
   * business are touched; already-published ones are skipped. Returns the
   * number of shifts published.
   */
  async publish(input: { ids: string[]; businessId: string; ownerId: string }) {
    if (input.ids.length === 0) return { count: 0 };
    const result = await this.db.shift.updateMany({
      where: {
        id: { in: input.ids },
        businessId: input.businessId,
        publishedAt: null,
      },
      data: { publishedAt: new Date(), publishedById: input.ownerId },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_PUBLISHED",
        entityType: "Shift",
        entityId: input.ids[0] ?? "batch",
        metadata: { ids: input.ids, count: result.count },
      },
    });

    logger.info({ event: "shift.published", count: result.count });
    publishEvent(input.businessId, { type: "shift.updated", shiftId: "batch" });
    return result;
  }

  async publishRange(input: {
    businessId: string;
    ownerId: string;
    from: Date;
    to: Date;
  }) {
    const result = await this.db.shift.updateMany({
      where: {
        businessId: input.businessId,
        publishedAt: null,
        startsAt: { gte: input.from, lt: input.to },
      },
      data: { publishedAt: new Date(), publishedById: input.ownerId },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_PUBLISHED",
        entityType: "Shift",
        entityId: "range",
        metadata: { from: input.from, to: input.to, count: result.count },
      },
    });

    return result;
  }

  /**
   * Owner directly assigns a worker to a shift, bypassing the apply/approve
   * flow. Respects capacity, overlap, and approved time-off. If the shift had
   * a pending subscription for this worker, it is upgraded to APPROVED instead
   * of creating duplicates.
   */
  async assignWorker(input: {
    shiftId: string;
    workerId: string;
    businessId: string;
    ownerId: string;
  }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
      include: { assignments: true },
    });
    if (!shift) throw new Error("Shift not found");
    if (shift.status === "CANCELLED") {
      throw new Error("Cannot assign to a cancelled shift");
    }
    if (shift.assignments.length >= shift.requiredSpots) {
      throw new Error("Shift already at capacity");
    }
    if (shift.assignments.some((a) => a.userId === input.workerId)) {
      throw new Error("Worker already assigned");
    }

    const worker = await this.db.user.findFirst({
      where: { id: input.workerId, businessId: input.businessId },
    });
    if (!worker) throw new Error("Worker not found in this business");
    if (worker.status !== "ACTIVE") {
      throw new Error("Worker is not active");
    }

    const overlapping = await this.db.shiftAssignment.findFirst({
      where: {
        userId: input.workerId,
        shiftId: { not: input.shiftId },
        shift: { startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } },
      },
    });
    if (overlapping) {
      throw new Error("Worker has an overlapping approved shift");
    }

    const timeOff = await this.db.timeOffRequest.findFirst({
      where: {
        userId: input.workerId,
        status: "APPROVED",
        startsAt: { lt: shift.endsAt },
        endsAt: { gt: shift.startsAt },
      },
    });
    if (timeOff) throw new Error("Worker has approved time-off in this range");

    const existingSub = await this.db.shiftSubscription.findUnique({
      where: { shiftId_userId: { shiftId: input.shiftId, userId: input.workerId } },
    });

    const [assignment] = await this.db.$transaction([
      this.db.shiftAssignment.create({
        data: { shiftId: input.shiftId, userId: input.workerId },
      }),
      existingSub
        ? this.db.shiftSubscription.update({
            where: { id: existingSub.id },
            data: { status: "APPROVED" },
          })
        : this.db.shiftSubscription.create({
            data: {
              shiftId: input.shiftId,
              userId: input.workerId,
              status: "APPROVED",
            },
          }),
    ]);

    await this.db.notification.create({
      data: {
        userId: input.workerId,
        type: "SHIFT_ASSIGNED",
        title: "You were assigned a shift",
        body: `${shift.roleLabel} on ${shift.startsAt.toISOString().slice(0, 10)}`,
        payload: { shiftId: shift.id },
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_ASSIGNED",
        entityType: "Shift",
        entityId: shift.id,
        metadata: { workerId: input.workerId },
      },
    });

    logger.info({
      event: "shift.assignedDirectly",
      shiftId: shift.id,
      workerId: input.workerId,
    });
    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: shift.id,
    });

    if (DimonaService.shouldAutoDeclare(worker.contractType)) {
      const dimona = new DimonaService(this.db);
      await dimona
        .declareIn({ shiftId: shift.id, workerId: input.workerId })
        .catch((err) =>
          logger.warn({
            event: "dimona.declare.failed",
            shiftId: shift.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    }

    return assignment;
  }

  /**
   * Creates a series of weekly-recurring shifts starting from `startsAt` until
   * `repeatUntil` inclusive. Each occurrence is a regular `Shift` row; we keep
   * recurrence simple (weekly, fixed duration) on purpose for MVP.
   */
  async createRecurring(input: {
    businessId: string;
    ownerId: string;
    startsAt: Date;
    endsAt: Date;
    roleLabel: string;
    requiredSpots: number;
    notes?: string;
    repeatUntil: Date;
  }) {
    if (input.repeatUntil < input.startsAt) {
      throw new Error("Repeat-until must be after the first occurrence");
    }
    const created = [];
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    let cursorStart = input.startsAt.getTime();
    let cursorEnd = input.endsAt.getTime();
    const stop = input.repeatUntil.getTime();
    while (cursorStart <= stop) {
      const shift = await this.create({
        businessId: input.businessId,
        ownerId: input.ownerId,
        startsAt: new Date(cursorStart),
        endsAt: new Date(cursorEnd),
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        notes: input.notes,
      });
      created.push(shift);
      cursorStart += ONE_WEEK;
      cursorEnd += ONE_WEEK;
    }
    return created;
  }

  async update(input: {
    id: string;
    businessId: string;
    ownerId: string;
    startsAt?: Date;
    endsAt?: Date;
    roleLabel?: string;
    requiredSpots?: number;
    notes?: string | null;
  }) {
    const existing = await this.db.shift.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) {
      throw new Error("Shift not found");
    }

    const shift = await this.db.shift.update({
      where: { id: input.id },
      data: {
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        notes: input.notes,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_UPDATED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    return shift;
  }

  /**
   * Returns workers already approved on this shift that would now conflict
   * with the new time range. Surfaces a soft warning the UI can show before
   * committing the move.
   */
  async findRescheduleConflicts(input: {
    id: string;
    businessId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<ShiftConflictWarning[]> {
    const shift = await this.db.shift.findFirst({
      where: { id: input.id, businessId: input.businessId },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!shift) {
      throw new Error("Shift not found");
    }

    const warnings: ShiftConflictWarning[] = [];
    for (const assignment of shift.assignments) {
      const otherAssignments = await this.db.shiftAssignment.findMany({
        where: {
          userId: assignment.userId,
          shiftId: { not: input.id },
        },
        include: { shift: true },
      });

      try {
        assertNoAssignmentOverlap(
          { startsAt: input.startsAt, endsAt: input.endsAt },
          otherAssignments.map((a) => ({
            startsAt: a.shift.startsAt,
            endsAt: a.shift.endsAt,
          })),
        );
      } catch {
        const conflicting = otherAssignments.find(
          (a) =>
            a.shift.startsAt < input.endsAt && a.shift.endsAt > input.startsAt,
        );
        if (conflicting) {
          warnings.push({
            userId: assignment.userId,
            userName: assignment.user.name,
            conflictingShiftId: conflicting.shiftId,
            conflictingRange: {
              startsAt: conflicting.shift.startsAt,
              endsAt: conflicting.shift.endsAt,
            },
          });
        }
      }
    }

    return warnings;
  }

  async delete(input: { id: string; businessId: string; ownerId: string }) {
    const existing = await this.db.shift.findFirst({
      where: { id: input.id, businessId: input.businessId },
      include: { subscriptions: { where: { status: "PENDING" } } },
    });
    if (!existing) {
      throw new Error("Shift not found");
    }

    const shift = await this.db.shift.update({
      where: { id: input.id },
      data: { status: "CANCELLED" },
    });

    for (const sub of existing.subscriptions) {
      await this.db.notification.create({
        data: {
          userId: sub.userId,
          type: "SHIFT_CANCELLED",
          title: "Shift cancelled",
          body: `The shift ${existing.roleLabel} was cancelled.`,
          payload: { shiftId: existing.id },
        },
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_DELETED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    return shift;
  }
}

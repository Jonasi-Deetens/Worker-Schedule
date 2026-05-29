import type { PrismaClient } from "@prisma/client";
import { computeShiftDisplayStatus } from "@/domain/rules/scheduling";

/**
 * Pure read-side projections over the shift table — calendar listings and
 * KPI aggregates. Kept separate from `ShiftService` so the lifecycle (write)
 * surface and the dashboard (read) surface can evolve independently and
 * neither file balloons past ~200 lines.
 */
export class ShiftReadModel {
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
    // The required-skill filter must only gate *open* shifts. A worker who
    // lacks the skill can still have been assigned/subscribed before the skill
    // requirement was added (or by an owner override), and must always be able
    // to see shifts they are already on. So a shift is visible when it has no
    // required skill, OR the worker has the skill, OR the worker already holds
    // an assignment on it.
    const skillFilter =
      input.workerSkillIds !== undefined
        ? {
            OR: [
              { requiredSkillId: null },
              { requiredSkillId: { in: input.workerSkillIds } },
              ...(input.workerId
                ? [{ assignments: { some: { userId: input.workerId } } }]
                : []),
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
        location: { select: { id: true, name: true } },
        _count: {
          select: {
            subscriptions: { where: { status: "PENDING" } },
            // Only CONFIRMED assignments fill a spot. Workers awaiting
            // reschedule reconfirmation are surfaced as Pending instead.
            assignments: { where: { status: "CONFIRMED" } },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    return shifts.map((shift) => {
      // Assignments awaiting the worker's action (a fresh offer or a reschedule
      // reconfirmation) don't occupy a CONFIRMED spot but should still read as
      // "Pending" for the owner. Direct-assign offers no longer carry a PENDING
      // subscription, so they are counted here instead.
      const pendingAssignmentCount = (shift.assignments ?? []).filter(
        (a) =>
          a.status === "PENDING_RECONFIRMATION" ||
          a.status === "PENDING_ACCEPTANCE",
      ).length;
      return {
        ...shift,
        displayStatus: computeShiftDisplayStatus({
          shiftStatus: shift.status,
          approvedCount: shift._count.assignments,
          requiredSpots: shift.requiredSpots,
          pendingCount: shift._count.subscriptions + pendingAssignmentCount,
        }),
        isDraft: shift.publishedAt === null,
      };
    });
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
            // CONFIRMED assignments only — see listForCalendar.
            assignments: { where: { status: "CONFIRMED" } },
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
      const pendingAssignmentCount = shift.assignments.filter(
        (a) =>
          a.status === "PENDING_RECONFIRMATION" ||
          a.status === "PENDING_ACCEPTANCE",
      ).length;
      const status = computeShiftDisplayStatus({
        shiftStatus: shift.status,
        approvedCount: shift._count.assignments,
        requiredSpots: shift.requiredSpots,
        pendingCount: shift._count.subscriptions + pendingAssignmentCount,
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
        // Unconfirmed (PENDING_RECONFIRMATION) workers are not yet committed,
        // so they don't contribute to scheduled hours or labour cost.
        for (const a of shift.assignments) {
          if (a.status !== "CONFIRMED") continue;
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
}

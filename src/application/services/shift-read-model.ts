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
}

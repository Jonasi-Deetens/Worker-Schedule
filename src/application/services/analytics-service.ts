import type { PrismaClient } from "@prisma/client";
import { addWeeks, startOfWeek, weekKey } from "@/lib/week";
import { TimeClockService } from "./time-clock-service";

interface WeeklyPoint {
  weekStart: string;
  scheduledHours: number;
  filledHours: number;
  /** Actual hours worked, from approved time entries. */
  actualHours: number;
  /** actualHours - filledHours: positive = worked more than scheduled. */
  actualVariance: number;
  fillRate: number;
  labourCost: number;
  revenue: number | null;
  costToRevenue: number | null;
  noShows: number;
  attendanceMarked: number;
  noShowRate: number;
}

function hours(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

/**
 * Reads shifts, assignments and revenue (stored as a per-week JSON map on the
 * Business row) to produce a weekly trend used by the /insights dashboard.
 */
export class AnalyticsService {
  constructor(private readonly db: PrismaClient) {}

  async weeklyTrend(input: { businessId: string; weeks: number }) {
    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
      select: { weekStartsOn: true, timezone: true, revenueWeeklyJson: true },
    });
    if (!business) throw new Error("Business not found");
    const weekStartsOn = business.weekStartsOn ?? 1;
    const timeZone = business.timezone ?? "UTC";
    const revenueMap =
      (business.revenueWeeklyJson as Record<string, number> | null) ?? {};

    const now = new Date();
    const firstWeek = startOfWeek(
      new Date(now.getTime() - (input.weeks - 1) * 7 * 86_400_000),
      weekStartsOn,
      timeZone,
    );
    const lastWeek = new Date(now.getTime() + 7 * 86_400_000);

    const [shifts, timeEntries] = await Promise.all([
      this.db.shift.findMany({
        where: {
          businessId: input.businessId,
          startsAt: { gte: firstWeek, lt: lastWeek },
        },
        include: {
          assignments: {
            include: { user: { select: { hourlyRate: true } } },
          },
        },
      }),
      this.db.timeEntry.findMany({
        where: {
          status: "APPROVED",
          clockOutAt: { not: null },
          user: { businessId: input.businessId },
          clockInAt: { gte: firstWeek, lt: lastWeek },
        },
        select: { clockInAt: true, clockOutAt: true, breakMinutes: true },
      }),
    ]);

    const buckets = new Map<string, WeeklyPoint>();
    for (let i = 0; i < input.weeks; i += 1) {
      const key = addWeeks(firstWeek, i).toISOString().slice(0, 10);
      buckets.set(key, {
        weekStart: key,
        scheduledHours: 0,
        filledHours: 0,
        actualHours: 0,
        actualVariance: 0,
        fillRate: 0,
        labourCost: 0,
        revenue: revenueMap[key] ?? null,
        costToRevenue: null,
        noShows: 0,
        attendanceMarked: 0,
        noShowRate: 0,
      });
    }

    for (const shift of shifts) {
      const key = weekKey(shift.startsAt, weekStartsOn, timeZone);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const shiftHours = hours(shift.startsAt, shift.endsAt);
      bucket.scheduledHours += shiftHours * shift.requiredSpots;
      bucket.filledHours += shiftHours * shift.assignments.length;
      for (const a of shift.assignments) {
        const rate = a.user.hourlyRate ? Number(a.user.hourlyRate) : 0;
        bucket.labourCost += shiftHours * rate;
        if (a.attendance) {
          bucket.attendanceMarked += 1;
          if (a.attendance === "NO_SHOW") bucket.noShows += 1;
        }
      }
    }

    for (const entry of timeEntries) {
      const key = weekKey(entry.clockInAt, weekStartsOn, timeZone);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.actualHours += TimeClockService.workedMinutes(entry) / 60;
    }

    for (const bucket of buckets.values()) {
      bucket.fillRate =
        bucket.scheduledHours > 0
          ? bucket.filledHours / bucket.scheduledHours
          : 0;
      bucket.actualHours = Math.round(bucket.actualHours * 100) / 100;
      bucket.actualVariance =
        Math.round((bucket.actualHours - bucket.filledHours) * 100) / 100;
      bucket.costToRevenue =
        bucket.revenue && bucket.revenue > 0
          ? bucket.labourCost / bucket.revenue
          : null;
      bucket.noShowRate =
        bucket.attendanceMarked > 0
          ? bucket.noShows / bucket.attendanceMarked
          : 0;
    }

    return [...buckets.values()].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );
  }

  /**
   * Sets (or clears, when `amount` is null) the revenue for one ISO week. The
   * week key is the `YYYY-MM-DD` of the week start, matching `weeklyTrend`.
   */
  async setWeeklyRevenue(input: {
    businessId: string;
    weekStart: Date;
    amount: number | null;
  }) {
    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
      select: { weekStartsOn: true, timezone: true, revenueWeeklyJson: true },
    });
    if (!business) throw new Error("Business not found");
    const weekStartsOn = business.weekStartsOn ?? 1;
    const timeZone = business.timezone ?? "UTC";
    const key = weekKey(input.weekStart, weekStartsOn, timeZone);
    const map = {
      ...((business.revenueWeeklyJson as Record<string, number> | null) ?? {}),
    };
    if (input.amount === null) {
      delete map[key];
    } else {
      map[key] = input.amount;
    }
    await this.db.business.update({
      where: { id: input.businessId },
      data: { revenueWeeklyJson: map },
    });
    return { weekStart: key, amount: input.amount };
  }
}

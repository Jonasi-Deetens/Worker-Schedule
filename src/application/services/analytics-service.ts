import type { PrismaClient } from "@prisma/client";

interface WeeklyPoint {
  weekStart: string;
  scheduledHours: number;
  filledHours: number;
  fillRate: number;
  labourCost: number;
  revenue: number | null;
  costToRevenue: number | null;
  noShows: number;
  attendanceMarked: number;
  noShowRate: number;
}

function startOfWeek(d: Date, weekStartsOn: number): Date {
  const day = (d.getDay() - weekStartsOn + 7) % 7;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - day);
  return out;
}

function isoWeekKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
      select: { weekStartsOn: true, revenueWeeklyJson: true },
    });
    if (!business) throw new Error("Business not found");
    const weekStartsOn = business.weekStartsOn ?? 1;
    const revenueMap =
      (business.revenueWeeklyJson as Record<string, number> | null) ?? {};

    const now = new Date();
    const firstWeek = startOfWeek(
      new Date(now.getTime() - (input.weeks - 1) * 7 * 86_400_000),
      weekStartsOn,
    );
    const lastWeek = new Date(now.getTime() + 7 * 86_400_000);

    const shifts = await this.db.shift.findMany({
      where: {
        businessId: input.businessId,
        startsAt: { gte: firstWeek, lt: lastWeek },
      },
      include: {
        assignments: {
          include: { user: { select: { hourlyRate: true } } },
        },
      },
    });

    const buckets = new Map<string, WeeklyPoint>();
    for (let i = 0; i < input.weeks; i += 1) {
      const ws = new Date(firstWeek.getTime() + i * 7 * 86_400_000);
      const key = isoWeekKey(ws);
      buckets.set(key, {
        weekStart: key,
        scheduledHours: 0,
        filledHours: 0,
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
      const key = isoWeekKey(startOfWeek(shift.startsAt, weekStartsOn));
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

    for (const bucket of buckets.values()) {
      bucket.fillRate =
        bucket.scheduledHours > 0
          ? bucket.filledHours / bucket.scheduledHours
          : 0;
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
}

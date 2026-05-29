import { beforeEach, describe, expect, it } from "vitest";
import { AnalyticsService } from "@/application/services/analytics-service";
import { weekKey } from "@/lib/week";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const BUSINESS_ID = "biz-1";

let prisma: PrismaMock;
let service: AnalyticsService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new AnalyticsService(asPrisma(prisma));
});

function isoMonday(weeksAgo: number): Date {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - day - weeksAgo * 7);
  return monday;
}

describe("AnalyticsService.weeklyTrend", () => {
  it("buckets scheduled vs actual hours and computes variance", async () => {
    const shiftStart = isoMonday(1);
    const shiftEnd = new Date(shiftStart.getTime() + 4 * 3_600_000); // 4h shift

    prisma.business.findUnique.mockResolvedValue({
      weekStartsOn: 1,
      revenueWeeklyJson: null,
    });
    prisma.shift.findMany.mockResolvedValue([
      {
        startsAt: shiftStart,
        endsAt: shiftEnd,
        requiredSpots: 2,
        assignments: [{ user: { hourlyRate: 20 }, attendance: null }],
      },
    ]);
    // Worker actually clocked 5h (1h more than the 4h scheduled/filled).
    prisma.timeEntry.findMany.mockResolvedValue([
      {
        clockInAt: shiftStart,
        clockOutAt: new Date(shiftStart.getTime() + 5 * 3_600_000),
        breakMinutes: 0,
      },
    ]);

    const trend = await service.weeklyTrend({ businessId: BUSINESS_ID, weeks: 4 });
    const week = trend.find((w) => w.filledHours > 0);
    expect(week).toBeDefined();
    expect(week!.scheduledHours).toBe(8); // 4h * 2 spots
    expect(week!.filledHours).toBe(4); // 4h * 1 assignment
    expect(week!.actualHours).toBe(5);
    expect(week!.actualVariance).toBe(1); // 5 actual - 4 filled
    expect(week!.fillRate).toBeCloseTo(0.5);
  });

  it("only counts approved, closed time entries (query filter)", async () => {
    prisma.business.findUnique.mockResolvedValue({
      weekStartsOn: 1,
      revenueWeeklyJson: {},
    });
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.timeEntry.findMany.mockResolvedValue([]);

    await service.weeklyTrend({ businessId: BUSINESS_ID, weeks: 4 });

    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "APPROVED",
          clockOutAt: { not: null },
        }),
      }),
    );
  });

  it("derives cost-to-revenue when revenue is present", async () => {
    const monday = isoMonday(0);
    // Compute the bucket key through the shared helper (UTC default, matching
    // the service) so the revenue lands in the same bucket as the shift.
    const key = weekKey(monday, 1, "UTC");

    prisma.business.findUnique.mockResolvedValue({
      weekStartsOn: 1,
      timezone: "UTC",
      revenueWeeklyJson: { [key]: 1000 },
    });
    prisma.shift.findMany.mockResolvedValue([
      {
        startsAt: monday,
        endsAt: new Date(monday.getTime() + 10 * 3_600_000),
        requiredSpots: 1,
        assignments: [{ user: { hourlyRate: 25 }, attendance: null }],
      },
    ]);
    prisma.timeEntry.findMany.mockResolvedValue([]);

    const trend = await service.weeklyTrend({ businessId: BUSINESS_ID, weeks: 1 });
    const week = trend.find((w) => w.revenue === 1000);
    expect(week).toBeDefined();
    expect(week!.labourCost).toBe(250); // 10h * 25
    expect(week!.costToRevenue).toBeCloseTo(0.25);
  });
});

describe("AnalyticsService.setWeeklyRevenue", () => {
  it("merges a revenue value into the JSON map", async () => {
    prisma.business.findUnique.mockResolvedValue({
      weekStartsOn: 1,
      revenueWeeklyJson: { "2026-01-05": 100 },
    });
    prisma.business.update.mockResolvedValue({});

    await service.setWeeklyRevenue({
      businessId: BUSINESS_ID,
      weekStart: new Date("2026-01-12T09:00:00Z"),
      amount: 500,
    });

    const data = prisma.business.update.mock.calls[0][0].data
      .revenueWeeklyJson as Record<string, number>;
    expect(data["2026-01-05"]).toBe(100);
    expect(Object.values(data)).toContain(500);
  });

  it("clears a week when amount is null", async () => {
    const weekStart = new Date("2026-01-12T09:00:00Z");
    // First set a value so we learn the exact (timezone-normalized) week key.
    prisma.business.findUnique.mockResolvedValue({
      weekStartsOn: 1,
      revenueWeeklyJson: {},
    });
    prisma.business.update.mockResolvedValue({});
    const { weekStart: key } = await service.setWeeklyRevenue({
      businessId: BUSINESS_ID,
      weekStart,
      amount: 500,
    });

    prisma.business.findUnique.mockResolvedValue({
      weekStartsOn: 1,
      revenueWeeklyJson: { [key]: 500 },
    });
    await service.setWeeklyRevenue({ businessId: BUSINESS_ID, weekStart, amount: null });

    const data = prisma.business.update.mock.calls.at(-1)![0].data
      .revenueWeeklyJson as Record<string, number>;
    expect(data[key]).toBeUndefined();
  });
});

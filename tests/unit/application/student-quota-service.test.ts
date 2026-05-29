import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { StudentQuotaService } from "@/application/services/student-quota-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("StudentQuotaService.recompute", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("sums reserved STU planned hours and approved worked hours", async () => {
    db.dimonaStuDeclaration.findMany.mockResolvedValue([
      { plannedHours: 100 },
      { plannedHours: 50 },
    ]);
    // 09:00–17:00 = 8h minus 60 min break = 7h.
    db.timeEntry.findMany.mockResolvedValue([
      {
        clockInAt: new Date("2026-03-01T09:00:00Z"),
        clockOutAt: new Date("2026-03-01T17:00:00Z"),
        breakMinutes: 60,
      },
    ]);
    db.studentQuota.upsert.mockImplementation(async ({ create }) => ({
      id: "q1",
      ...create,
    }));

    const service = new StudentQuotaService(db as unknown as PrismaClient);
    const row = await service.recompute({
      userId: "u1",
      businessId: "b1",
      year: 2026,
    });
    expect(row.reservedHours).toBe(150);
    expect(row.workedHours).toBe(7);
  });
});

describe("StudentQuotaService.deriveUsage thresholds", () => {
  it("flags 80% warning at reserved+worked = 520/650", () => {
    const usage = StudentQuotaService.deriveUsage(2026, {
      reservedHours: 500,
      workedHours: 20,
      studentAtWorkBalanceHours: null,
      attestationUploadedAt: null,
    });
    expect(usage.usedHours).toBe(520);
    expect(usage.remainingHours).toBe(130);
    expect(usage.level).toBe("warn80");
  });

  it("flags 95% warning at 620/650", () => {
    const usage = StudentQuotaService.deriveUsage(2026, {
      reservedHours: 600,
      workedHours: 20,
      studentAtWorkBalanceHours: null,
      attestationUploadedAt: null,
    });
    expect(usage.level).toBe("warn95");
  });

  it("marks exceeded past 650h", () => {
    const usage = StudentQuotaService.deriveUsage(2026, {
      reservedHours: 700,
      workedHours: 0,
      studentAtWorkBalanceHours: null,
      attestationUploadedAt: null,
    });
    expect(usage.remainingHours).toBeLessThan(0);
    expect(usage.level).toBe("exceeded");
  });

  it("prefers the attestation balance for remaining when present", () => {
    const usage = StudentQuotaService.deriveUsage(2026, {
      reservedHours: 10,
      workedHours: 10,
      studentAtWorkBalanceHours: 100, // national: only 100h left nationwide
      attestationUploadedAt: new Date(),
    });
    expect(usage.remainingHours).toBe(100);
    expect(usage.usedHours).toBe(550);
    expect(usage.level).toBe("warn80");
  });

  it("defaults to a full 650h quota when there is no ledger row", () => {
    const usage = StudentQuotaService.deriveUsage(2026, null);
    expect(usage.remainingHours).toBe(650);
    expect(usage.level).toBe("ok");
  });
});

describe("StudentQuotaService.getRegionalAdvisory", () => {
  it("buckets the year's assignment hours per quarter for Brussels", async () => {
    const db = createPrismaMock();
    db.shiftAssignment.findMany.mockResolvedValue([
      { shift: { startsAt: new Date("2026-07-01T09:00:00Z"), endsAt: new Date("2026-07-01T17:00:00Z") } }, // Q3, 8h
      { shift: { startsAt: new Date("2026-08-01T09:00:00Z"), endsAt: new Date("2026-08-01T12:30:00Z") } }, // Q3, 4h
    ]);
    const service = new StudentQuotaService(db as unknown as PrismaClient);
    const advisory = await service.getRegionalAdvisory({
      userId: "u1",
      businessId: "b1",
      year: 2026,
      region: "BRUSSELS",
    });
    expect(advisory.limitType).toBe("quarter");
    expect(advisory.periods[2]).toMatchObject({ label: "Q3", hours: 12 });
  });
});

import { describe, expect, it } from "vitest";
import { TimeClockService } from "@/application/services/time-clock-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("TimeClockService", () => {
  it("blocks a second clock-in while one is already open", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue({ id: "open1" });
    const svc = new TimeClockService(asPrisma(db));
    await expect(
      svc.clockIn({ userId: "u1", shiftId: null }),
    ).rejects.toThrow(/already clocked in/i);
  });

  it("clocks in when no open entry exists", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue(null);
    db.timeEntry.create.mockResolvedValue({ id: "te1", clockInAt: new Date() });
    const svc = new TimeClockService(asPrisma(db));
    const result = await svc.clockIn({ userId: "u1", shiftId: null });
    expect(result.id).toBe("te1");
  });

  it("computes worked minutes deducting breaks", () => {
    const start = new Date("2026-06-01T10:00:00Z");
    const end = new Date("2026-06-01T18:30:00Z");
    const minutes = TimeClockService.workedMinutes({
      clockInAt: start,
      clockOutAt: end,
      breakMinutes: 30,
    });
    expect(minutes).toBe(480);
  });

  it("returns 0 minutes for open entries", () => {
    expect(
      TimeClockService.workedMinutes({
        clockInAt: new Date(),
        clockOutAt: null,
        breakMinutes: 0,
      }),
    ).toBe(0);
  });

  it("lists only approved entries for a business", async () => {
    const db = createPrismaMock();
    db.timeEntry.findMany.mockResolvedValue([
      { id: "te1", approvedAt: new Date() },
    ]);
    const svc = new TimeClockService(asPrisma(db));

    const result = await svc.listApproved("biz1");

    expect(result).toHaveLength(1);
    const where = db.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.approvedAt).toEqual({ not: null });
    expect(where.user).toEqual({ businessId: "biz1" });
  });
});

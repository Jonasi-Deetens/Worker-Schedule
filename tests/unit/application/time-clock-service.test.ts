import { describe, expect, it, vi } from "vitest";
import { TimeClockService } from "@/application/services/time-clock-service";
import { declareOutIfAuto } from "@/application/services/dimona-hooks";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

vi.mock("@/application/services/dimona-hooks", () => ({
  declareOutIfAuto: vi.fn().mockResolvedValue(undefined),
}));

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

  it("rejects clock-in against a shift the worker is not assigned to", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    const svc = new TimeClockService(asPrisma(db));
    await expect(
      svc.clockIn({ userId: "u1", shiftId: "shift1" }),
    ).rejects.toThrow(/not assigned/i);
  });

  it("allows clock-in when the linked shift is assigned to the worker", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findFirst.mockResolvedValue({ id: "a1" });
    db.timeEntry.create.mockResolvedValue({ id: "te1" });
    db.user.findUnique.mockResolvedValue({ businessId: null });
    const svc = new TimeClockService(asPrisma(db));
    const result = await svc.clockIn({ userId: "u1", shiftId: "shift1" });
    expect(result.id).toBe("te1");
  });

  it("blocks clock-in when business requires a signed contract", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ businessId: "b1" });
    db.business.findUnique.mockResolvedValue({ requireSignedContract: true });
    db.workerContract.findFirst.mockResolvedValue(null);
    const svc = new TimeClockService(asPrisma(db));
    await expect(
      svc.clockIn({ userId: "u1", shiftId: null }),
    ).rejects.toThrow(/errors\.contractRequired/);
  });

  it("allows clock-in when a signed contract exists", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ businessId: "b1" });
    db.business.findUnique.mockResolvedValue({ requireSignedContract: true });
    db.workerContract.findFirst.mockResolvedValue({ id: "c1", status: "SIGNED" });
    db.timeEntry.create.mockResolvedValue({ id: "te1" });
    const svc = new TimeClockService(asPrisma(db));
    const result = await svc.clockIn({ userId: "u1", shiftId: null });
    expect(result.id).toBe("te1");
  });

  it("declares Dimona OUT on clock-out for a shift-linked entry", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue({
      id: "te1",
      userId: "u1",
      shiftId: "s1",
      clockInAt: new Date(Date.now() - 60 * 60_000),
      clockOutAt: null,
    });
    db.timeEntry.update.mockResolvedValue({ id: "te1" });
    db.user.findUnique.mockResolvedValue({
      name: "Worker",
      businessId: "b1",
    });
    db.user.findMany.mockResolvedValue([{ id: "m1" }]);
    db.notification.create.mockResolvedValue({ id: "n1" });
    const svc = new TimeClockService(asPrisma(db));
    await svc.clockOut({ id: "te1", userId: "u1", breakMinutes: 0 });
    expect(declareOutIfAuto).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      "u1",
    );
  });

  it("rejects a break longer than the worked time on clock-out", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue({
      id: "te1",
      userId: "u1",
      clockInAt: new Date(Date.now() - 60 * 60_000),
      clockOutAt: null,
    });
    const svc = new TimeClockService(asPrisma(db));
    await expect(
      svc.clockOut({ id: "te1", userId: "u1", breakMinutes: 120 }),
    ).rejects.toThrow(/break/i);
  });

  it("only approves closed, pending entries", async () => {
    const db = createPrismaMock();
    db.timeEntry.findMany.mockResolvedValue([{ id: "te1", userId: "u1" }]);
    db.timeEntry.updateMany.mockResolvedValue({ count: 1 });
    const svc = new TimeClockService(asPrisma(db));

    const result = await svc.approveMany({
      ids: ["te1"],
      businessId: "biz1",
      approverId: "m1",
    });

    expect(result.count).toBe(1);
    const where = db.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("PENDING");
    expect(where.clockOutAt).toEqual({ not: null });
    expect(db.timeEntry.updateMany.mock.calls[0][0].data.status).toBe("APPROVED");
  });

  it("warns (without blocking) when approving hours for a NO_SHOW shift", async () => {
    const db = createPrismaMock();
    db.timeEntry.findMany.mockResolvedValue([
      { id: "te1", userId: "u1", shiftId: "s1" },
    ]);
    db.timeEntry.updateMany.mockResolvedValue({ count: 1 });
    db.shiftAssignment.findMany.mockResolvedValue([
      { userId: "u1", shiftId: "s1" },
    ]);
    const svc = new TimeClockService(asPrisma(db));

    const result = await svc.approveMany({
      ids: ["te1"],
      businessId: "biz1",
      approverId: "m1",
    });

    expect(result.count).toBe(1);
    expect(result.warnings).toEqual([
      { timeEntryId: "te1", code: "errors.timeEntryShiftNoShow" },
    ]);
    // Still approved — reconciliation is a warning, not a hard block.
    expect(db.timeEntry.updateMany.mock.calls[0][0].data.status).toBe("APPROVED");
  });

  it("rejects entries with a reason and notifies the worker", async () => {
    const db = createPrismaMock();
    db.timeEntry.findMany.mockResolvedValue([{ id: "te1", userId: "u1" }]);
    db.timeEntry.updateMany.mockResolvedValue({ count: 1 });
    const svc = new TimeClockService(asPrisma(db));

    const result = await svc.rejectMany({
      ids: ["te1"],
      businessId: "biz1",
      reviewerId: "m1",
      reason: "Forgot to clock out",
    });

    expect(result.count).toBe(1);
    expect(db.timeEntry.updateMany.mock.calls[0][0].data.status).toBe("REJECTED");
    const notif = db.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe("TIME_ENTRY_REJECTED");
    expect(notif.userId).toBe("u1");
  });

  it("edits an entry and writes an audit event", async () => {
    const db = createPrismaMock();
    const clockInAt = new Date("2026-06-01T09:00:00Z");
    db.timeEntry.findFirst.mockResolvedValue({
      id: "te1",
      userId: "u1",
      clockInAt,
      clockOutAt: new Date("2026-06-01T17:00:00Z"),
      breakMinutes: 30,
    });
    db.timeEntry.update.mockResolvedValue({ id: "te1" });
    const svc = new TimeClockService(asPrisma(db));

    await svc.updateEntry({
      id: "te1",
      businessId: "biz1",
      reviewerId: "m1",
      breakMinutes: 45,
    });

    expect(db.auditEvent.create.mock.calls[0][0].data.action).toBe(
      "TIME_ENTRY_EDITED",
    );
  });

  it("rejects an edit that would put clock-out before clock-in", async () => {
    const db = createPrismaMock();
    db.timeEntry.findFirst.mockResolvedValue({
      id: "te1",
      userId: "u1",
      clockInAt: new Date("2026-06-01T09:00:00Z"),
      clockOutAt: new Date("2026-06-01T17:00:00Z"),
      breakMinutes: 0,
    });
    const svc = new TimeClockService(asPrisma(db));
    await expect(
      svc.updateEntry({
        id: "te1",
        businessId: "biz1",
        reviewerId: "m1",
        clockOutAt: new Date("2026-06-01T08:00:00Z"),
      }),
    ).rejects.toThrow(/after clock-in/i);
  });

  it("aggregates approved worked hours over a window", async () => {
    const db = createPrismaMock();
    db.timeEntry.findMany.mockResolvedValue([
      {
        clockInAt: new Date("2026-06-01T09:00:00Z"),
        clockOutAt: new Date("2026-06-01T17:00:00Z"),
        breakMinutes: 60,
      },
      {
        clockInAt: new Date("2026-06-02T09:00:00Z"),
        clockOutAt: new Date("2026-06-02T13:00:00Z"),
        breakMinutes: 0,
      },
    ]);
    const svc = new TimeClockService(asPrisma(db));
    const hours = await svc.aggregateWorkedHours(
      "u1",
      new Date("2026-06-01"),
      new Date("2026-06-30"),
    );
    expect(hours).toBe(11);
    const where = db.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("APPROVED");
  });
});

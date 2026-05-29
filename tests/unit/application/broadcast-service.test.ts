import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { BroadcastService } from "@/application/services/broadcast-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const FUTURE_START = new Date(Date.now() + 86_400_000);
const FUTURE_END = new Date(Date.now() + 90_000_000);

describe("BroadcastService.send", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("rejects when the shift is already at capacity", async () => {
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 1,
      assignments: [{ userId: "u1" }],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
    });
    const svc = new BroadcastService(db as unknown as PrismaClient);
    await expect(
      svc.send({ shiftId: "s1", businessId: "b1", ownerId: "owner" }),
    ).rejects.toThrow(/at capacity/);
  });

  it("rejects past shifts", async () => {
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 2,
      assignments: [],
      startsAt: new Date(Date.now() - 86_400_000 * 2),
      endsAt: new Date(Date.now() - 86_400_000),
    });
    const svc = new BroadcastService(db as unknown as PrismaClient);
    await expect(
      svc.send({ shiftId: "s1", businessId: "b1", ownerId: "owner" }),
    ).rejects.toThrow(/past shift/);
  });

  it("notifies eligible workers, excluding overlap and time-off", async () => {
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 2,
      requiredSkillId: null,
      assignments: [],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
      roleLabel: "Bartender",
    });
    db.user.findMany.mockResolvedValue([
      { id: "u1", name: "A" },
      { id: "u2", name: "B" },
      { id: "u3", name: "C" },
    ]);
    db.shiftAssignment.findMany.mockResolvedValue([{ userId: "u2" }]);
    db.timeOffRequest.findMany.mockResolvedValue([{ userId: "u3" }]);
    db.notification.create.mockResolvedValue({ id: "n1" });
    db.shift.update.mockResolvedValue({});
    db.auditEvent.create.mockResolvedValue({});

    const svc = new BroadcastService(db as unknown as PrismaClient);
    const result = await svc.send({
      shiftId: "s1",
      businessId: "b1",
      ownerId: "owner",
    });
    expect(result.notified).toBe(1);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });
});

describe("BroadcastService.listForUser", () => {
  it("returns an empty list when the worker has no broadcast notifications", async () => {
    const db = createPrismaMock();
    db.notification.findMany.mockResolvedValue([]);
    const svc = new BroadcastService(db as unknown as PrismaClient);
    const result = await svc.listForUser({ userId: "u1", businessId: "b1" });
    expect(result).toEqual([]);
    expect(db.shift.findMany).not.toHaveBeenCalled();
  });

  it("drops shifts at capacity or already assigned to the worker", async () => {
    const db = createPrismaMock();
    db.notification.findMany.mockResolvedValue([
      { payload: { shiftId: "s1" } },
      { payload: { shiftId: "s2" } },
      { payload: { shiftId: "s3" } },
    ]);
    db.shift.findMany.mockResolvedValue([
      // open + has room: keep
      {
        id: "s1",
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
        roleLabel: "Bartender",
        requiredSpots: 2,
        assignments: [{ userId: "other" }],
      },
      // at capacity: drop
      {
        id: "s2",
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
        roleLabel: "Host",
        requiredSpots: 1,
        assignments: [{ userId: "other" }],
      },
      // already assigned to caller: drop
      {
        id: "s3",
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
        roleLabel: "Server",
        requiredSpots: 2,
        assignments: [{ userId: "u1" }],
      },
    ]);
    const svc = new BroadcastService(db as unknown as PrismaClient);
    const result = await svc.listForUser({ userId: "u1", businessId: "b1" });
    expect(result.map((s) => s.id)).toEqual(["s1"]);
    expect(result[0]!.approvedCount).toBe(1);
  });
});

describe("BroadcastService.accept", () => {
  it("rejects when the shift is already filled", async () => {
    const db = createPrismaMock();
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 1,
      assignments: [{ userId: "other" }],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
    });
    const svc = new BroadcastService(db as unknown as PrismaClient);
    await expect(
      svc.accept({ shiftId: "s1", userId: "u1", businessId: "b1" }),
    ).rejects.toThrow(/already filled/);
  });

  it("returns alreadyAssigned when worker is on the shift", async () => {
    const db = createPrismaMock();
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 2,
      assignments: [{ userId: "u1" }],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
    });
    const svc = new BroadcastService(db as unknown as PrismaClient);
    const result = await svc.accept({
      shiftId: "s1",
      userId: "u1",
      businessId: "b1",
    });
    expect(result).toEqual({ alreadyAssigned: true });
  });

  it("rejects when worker has an overlap", async () => {
    const db = createPrismaMock();
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 2,
      assignments: [],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
    });
    db.shiftAssignment.findFirst.mockResolvedValue({ id: "other" });
    const svc = new BroadcastService(db as unknown as PrismaClient);
    await expect(
      svc.accept({ shiftId: "s1", userId: "u1", businessId: "b1" }),
    ).rejects.toThrow(/overlap/);
  });

  it("rejects when the in-transaction CONFIRMED count is already full", async () => {
    const db = createPrismaMock();
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 1,
      assignments: [],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null); // no overlap
    db.shiftAssignment.findMany.mockResolvedValue([]); // min-rest / weekly checks
    db.timeOffRequest.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    // The atomic re-check inside the transaction sees the shift is now full.
    db.shiftAssignment.count.mockResolvedValue(1);

    const svc = new BroadcastService(db as unknown as PrismaClient);
    await expect(
      svc.accept({ shiftId: "s1", userId: "u1", businessId: "b1" }),
    ).rejects.toThrow(/capacity/i);
    expect(db.shiftAssignment.create).not.toHaveBeenCalled();
  });

  it("serialises a two-worker race onto the last spot (second loses)", async () => {
    const db = createPrismaMock();
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 1,
      assignments: [],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);
    db.timeOffRequest.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    db.shiftAssignment.create.mockResolvedValue({ id: "a1" });
    db.shiftSubscription.upsert.mockResolvedValue({ id: "sub1" });
    // First accept sees 0 confirmed (claims the spot); the racing second accept
    // sees the spot already taken inside its transaction and is rejected.
    db.shiftAssignment.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const svc = new BroadcastService(db as unknown as PrismaClient);
    const first = await svc.accept({
      shiftId: "s1",
      userId: "u1",
      businessId: "b1",
    });
    expect(first.alreadyAssigned).toBe(false);

    await expect(
      svc.accept({ shiftId: "s1", userId: "u2", businessId: "b1" }),
    ).rejects.toThrow(/capacity/i);
    // Only the winner created an assignment.
    expect(db.shiftAssignment.create).toHaveBeenCalledTimes(1);
  });

  it("enforces scheduling rules before claiming the spot", async () => {
    const db = createPrismaMock();
    db.shift.findFirst.mockResolvedValue({
      id: "s1",
      status: "OPEN",
      requiredSpots: 2,
      assignments: [],
      startsAt: FUTURE_START,
      endsAt: FUTURE_END,
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);
    db.user.findUnique.mockResolvedValue(null);
    // Approved time-off in the slot is surfaced by the centralized guard.
    db.timeOffRequest.findFirst.mockResolvedValue({ id: "to1" });

    const svc = new BroadcastService(db as unknown as PrismaClient);
    await expect(
      svc.accept({ shiftId: "s1", userId: "u1", businessId: "b1" }),
    ).rejects.toThrow(/time-off/i);
    expect(db.shiftAssignment.count).not.toHaveBeenCalled();
  });
});

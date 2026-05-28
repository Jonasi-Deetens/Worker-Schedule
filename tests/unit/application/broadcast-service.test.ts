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
});

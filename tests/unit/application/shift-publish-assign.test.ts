import { describe, expect, it } from "vitest";
import { ShiftService } from "@/application/services/shift-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("ShiftService – publish & direct-assign", () => {
  describe("publish", () => {
    it("returns count=0 for an empty input", async () => {
      const db = createPrismaMock();
      const svc = new ShiftService(asPrisma(db));
      const result = await svc.publish({ ids: [], businessId: "b1", ownerId: "o1" });
      expect(result.count).toBe(0);
      expect(db.shift.updateMany).not.toHaveBeenCalled();
    });

    it("marks drafts as published and writes an audit event", async () => {
      const db = createPrismaMock();
      db.shift.updateMany.mockResolvedValue({ count: 3 });
      db.auditEvent.create.mockResolvedValue({});
      const svc = new ShiftService(asPrisma(db));
      const result = await svc.publish({
        ids: ["s1", "s2", "s3"],
        businessId: "b1",
        ownerId: "o1",
      });
      expect(result.count).toBe(3);
      expect(db.shift.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: { in: ["s1", "s2", "s3"] },
          businessId: "b1",
          publishedAt: null,
        }),
        data: expect.objectContaining({
          publishedById: "o1",
        }),
      });
    });
  });

  describe("assignWorker", () => {
    const baseShift = {
      id: "s1",
      businessId: "b1",
      requiredSpots: 2,
      status: "OPEN",
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: new Date("2026-06-01T14:00:00Z"),
      roleLabel: "Bartender",
      assignments: [],
    };

    it("rejects when the shift is already at capacity", async () => {
      const db = createPrismaMock();
      db.shift.findFirst.mockResolvedValue({
        ...baseShift,
        assignments: [{ userId: "w1" }, { userId: "w2" }],
      });
      const svc = new ShiftService(asPrisma(db));
      await expect(
        svc.assignWorker({
          shiftId: "s1",
          workerId: "w3",
          businessId: "b1",
          ownerId: "o1",
        }),
      ).rejects.toThrow(/capacity/i);
    });

    it("rejects when the worker is not active", async () => {
      const db = createPrismaMock();
      db.shift.findFirst.mockResolvedValue(baseShift);
      db.user.findFirst.mockResolvedValue({
        id: "w1",
        businessId: "b1",
        status: "SUSPENDED",
      });
      const svc = new ShiftService(asPrisma(db));
      await expect(
        svc.assignWorker({
          shiftId: "s1",
          workerId: "w1",
          businessId: "b1",
          ownerId: "o1",
        }),
      ).rejects.toThrow(/not active/i);
    });

    it("blocks an assignment when approved time-off overlaps", async () => {
      const db = createPrismaMock();
      db.shift.findFirst.mockResolvedValue(baseShift);
      db.user.findFirst.mockResolvedValue({ id: "w1", businessId: "b1", status: "ACTIVE" });
      db.shiftAssignment.findFirst.mockResolvedValue(null);
      db.timeOffRequest.findFirst.mockResolvedValue({ id: "to1" });
      const svc = new ShiftService(asPrisma(db));
      await expect(
        svc.assignWorker({
          shiftId: "s1",
          workerId: "w1",
          businessId: "b1",
          ownerId: "o1",
        }),
      ).rejects.toThrow(/time-off/i);
    });
  });
});

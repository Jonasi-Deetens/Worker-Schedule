import { describe, it, expect, beforeEach } from "vitest";
import { BulkShiftService } from "@/application/services/bulk-shift-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("BulkShiftService", () => {
  let db: PrismaMock;
  let service: BulkShiftService;

  beforeEach(() => {
    db = createPrismaMock();
    service = new BulkShiftService(asPrisma(db));
  });

  describe("duplicateWeek", () => {
    it("creates a clone for every source shift offset by the week delta", async () => {
      const monday = new Date("2026-06-01T00:00:00Z"); // Monday
      const nextMonday = new Date("2026-06-08T00:00:00Z");
      db.shift.findMany.mockResolvedValue([
        {
          id: "s1",
          businessId: "b",
          locationId: null,
          startsAt: new Date("2026-06-02T17:00:00Z"),
          endsAt: new Date("2026-06-02T23:00:00Z"),
          roleLabel: "Server",
          requiredSpots: 2,
          notes: null,
          requiredSkillId: null,
          status: "OPEN",
        },
      ]);
      db.shift.create.mockResolvedValue({ id: "new" });

      const result = await service.duplicateWeek({
        businessId: "b",
        ownerId: "u",
        fromWeekStart: monday,
        toWeekStart: nextMonday,
      });

      expect(result.created).toBe(1);
      expect(db.shift.create).toHaveBeenCalledTimes(1);
      const call = db.shift.create.mock.calls[0]![0].data;
      expect(call.startsAt.toISOString()).toBe("2026-06-09T17:00:00.000Z");
      expect(call.endsAt.toISOString()).toBe("2026-06-09T23:00:00.000Z");
      expect(call.roleLabel).toBe("Server");
      expect(db.auditEvent.create).toHaveBeenCalled();
    });

    it("noops when there are no source shifts", async () => {
      db.shift.findMany.mockResolvedValue([]);
      const result = await service.duplicateWeek({
        businessId: "b",
        ownerId: "u",
        fromWeekStart: new Date("2026-06-01"),
        toWeekStart: new Date("2026-06-08"),
      });
      expect(result.created).toBe(0);
      expect(db.shift.create).not.toHaveBeenCalled();
    });
  });

  describe("cancelDay", () => {
    it("marks every same-day shift as cancelled", async () => {
      db.shift.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
      db.shift.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.cancelDay({
        businessId: "biz",
        ownerId: "owner",
        date: new Date("2026-06-02T15:00:00Z"),
      });

      expect(result.cancelled).toBe(2);
      expect(db.shift.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["a", "b"] } },
        data: { status: "CANCELLED" },
      });
    });
  });

  describe("reschedule", () => {
    it("shifts every target shift forward by deltaMinutes", async () => {
      const startsAt = new Date(Date.now() + 86_400_000);
      const endsAt = new Date(startsAt.getTime() + 3 * 3600_000);
      db.shift.findMany.mockResolvedValue([
        { id: "s1", businessId: "b", startsAt, endsAt, status: "OPEN" },
      ]);
      db.shift.update.mockResolvedValue({ id: "s1" });

      const result = await service.reschedule({
        businessId: "b",
        ownerId: "u",
        ids: ["s1"],
        deltaMinutes: 30,
      });
      expect(result.moved).toBe(1);
      const call = db.shift.update.mock.calls[0]![0];
      expect(call.where).toEqual({ id: "s1" });
      expect(call.data.startsAt.getTime()).toBe(startsAt.getTime() + 30 * 60_000);
    });

    it("refuses to move a shift into the past", async () => {
      const startsAt = new Date(Date.now() + 10_000); // 10s in the future
      db.shift.findMany.mockResolvedValue([
        {
          id: "s1",
          businessId: "b",
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3600_000),
          status: "OPEN",
        },
      ]);
      await expect(
        service.reschedule({
          businessId: "b",
          ownerId: "u",
          ids: ["s1"],
          deltaMinutes: -60,
        }),
      ).rejects.toThrow(/past/);
    });
  });
});

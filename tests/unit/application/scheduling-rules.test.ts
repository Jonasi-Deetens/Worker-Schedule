import { describe, expect, it } from "vitest";
import { SchedulingRules } from "@/application/services/scheduling-rules";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

const start = (h: number) => new Date(`2026-06-01T${String(h).padStart(2, "0")}:00:00Z`);

describe("SchedulingRules", () => {
  describe("checkMinRest", () => {
    it("returns null when no neighbours exist", async () => {
      const db = createPrismaMock();
      db.shiftAssignment.findMany.mockResolvedValue([]);
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkMinRest("u1", {
        startsAt: start(10),
        endsAt: start(14),
      });
      expect(result).toBeNull();
    });

    it("flags shifts with less than 11h rest", async () => {
      const db = createPrismaMock();
      db.shiftAssignment.findMany.mockResolvedValue([
        { shift: { startsAt: start(20), endsAt: start(23) } },
      ]);
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkMinRest("u1", {
        startsAt: new Date("2026-06-02T08:00:00Z"),
        endsAt: new Date("2026-06-02T12:00:00Z"),
      });
      expect(result?.code).toBe("MIN_REST_BROKEN");
    });
  });

  describe("checkWeeklyCap", () => {
    it("returns null without a cap", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({ weeklyHourCap: null, contractType: null });
      const rules = new SchedulingRules(asPrisma(db));
      expect(
        await rules.checkWeeklyCap("u1", {
          startsAt: start(10),
          endsAt: start(18),
        }),
      ).toBeNull();
    });

    it("flags JOBSTUDENT exceeding 24h", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        weeklyHourCap: null,
        contractType: "JOBSTUDENT",
      });
      db.shiftAssignment.findMany.mockResolvedValue([
        { shift: { startsAt: start(8), endsAt: start(20) } },
        { shift: { startsAt: start(8), endsAt: start(20) } },
      ]);
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkWeeklyCap("u1", {
        startsAt: start(10),
        endsAt: start(18),
      });
      expect(result?.code).toBe("WEEKLY_CAP_EXCEEDED");
    });
  });

  describe("checkAge", () => {
    it("blocks workers below 16", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        birthDate: new Date("2015-01-01"),
      });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkAge("u1", { startsAt: start(10) });
      expect(result?.code).toBe("AGE_RESTRICTED");
    });

    it("allows workers at or above 16", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        birthDate: new Date("2008-01-01"),
      });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkAge("u1", { startsAt: start(10) });
      expect(result).toBeNull();
    });
  });

  describe("checkTimeOff", () => {
    it("blocks approved time-off overlapping the candidate range", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({ id: "to1" });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkTimeOff("u1", {
        startsAt: start(10),
        endsAt: start(18),
      });
      expect(result?.code).toBe("TIME_OFF_CONFLICT");
    });

    it("returns null when no overlap", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue(null);
      const rules = new SchedulingRules(asPrisma(db));
      expect(
        await rules.checkTimeOff("u1", { startsAt: start(10), endsAt: start(18) }),
      ).toBeNull();
    });
  });
});

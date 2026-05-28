import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { StaffingSuggestionsService } from "@/application/services/staffing-suggestions-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("StaffingSuggestionsService", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("ranks workers by skill, availability and cap", async () => {
    db.shift.findUnique.mockResolvedValue({
      id: "s1",
      businessId: "b1",
      startsAt: new Date("2026-06-01T16:00:00Z"),
      endsAt: new Date("2026-06-01T22:00:00Z"),
      requiredSkillId: "k1",
      requiredSkill: { id: "k1", name: "Bar" },
    });
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        name: "Alice",
        contractType: "FLEXI",
        weeklyHourCap: null,
        skills: [{ skillId: "k1" }],
      },
      {
        id: "u2",
        name: "Bob",
        contractType: "FLEXI",
        weeklyHourCap: null,
        skills: [],
      },
    ]);
    db.availability.findFirst.mockResolvedValue({ id: "a1" });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.timeOffRequest.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);

    const svc = new StaffingSuggestionsService(db as unknown as PrismaClient);
    const result = await svc.rankForShift("s1");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u1");
    expect(result[0].reasons.map((r) => r.label)).toContain("skill match");
  });

  it("returns an empty list when the shift is missing", async () => {
    db.shift.findUnique.mockResolvedValue(null);
    const svc = new StaffingSuggestionsService(db as unknown as PrismaClient);
    await expect(svc.rankForShift("missing")).rejects.toThrow(/not found/);
  });
});

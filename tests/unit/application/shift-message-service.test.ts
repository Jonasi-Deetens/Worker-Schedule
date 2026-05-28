import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ShiftMessageService } from "@/application/services/shift-message-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("ShiftMessageService", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("blocks workers without assignment or open subscription", async () => {
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftSubscription.findFirst.mockResolvedValue(null);
    const service = new ShiftMessageService(db as unknown as PrismaClient);
    await expect(
      service.list({ shiftId: "s1", userId: "u1", isOwnerOrManager: false }),
    ).rejects.toThrow(/do not have access/);
  });

  it("lets owners read regardless of assignment", async () => {
    db.shiftMessage.findMany.mockResolvedValue([]);
    const service = new ShiftMessageService(db as unknown as PrismaClient);
    await expect(
      service.list({ shiftId: "s1", userId: "u1", isOwnerOrManager: true }),
    ).resolves.toEqual([]);
  });

  it("rejects empty or excessively long messages", async () => {
    db.shiftAssignment.findFirst.mockResolvedValue({ id: "a1" });
    const service = new ShiftMessageService(db as unknown as PrismaClient);
    await expect(
      service.post({
        shiftId: "s1",
        authorId: "u1",
        body: "   ",
        isOwnerOrManager: false,
        businessId: "b1",
      }),
    ).rejects.toThrow(/empty/);
    await expect(
      service.post({
        shiftId: "s1",
        authorId: "u1",
        body: "x".repeat(2001),
        isOwnerOrManager: false,
        businessId: "b1",
      }),
    ).rejects.toThrow(/too long/);
  });
});

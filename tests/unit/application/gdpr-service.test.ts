import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { GdprService } from "@/application/services/gdpr-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("GdprService", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("redacts password hash and 2FA secret in exports", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "x@y.com",
      passwordHash: "hash",
      twoFactorSecret: "secret",
      role: "WORKER",
      availabilities: [],
      availabilityTemplates: [],
      subscriptions: [],
      assignments: [],
      notifications: [],
      timeOffRequests: [],
      timeEntries: [],
      skills: [],
      documents: [],
    });
    const service = new GdprService(db as unknown as PrismaClient);
    const result = await service.exportUser("u1");
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("twoFactorSecret");
    expect(result).toHaveProperty("email", "x@y.com");
  });

  it("blocks owner soft-delete", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "OWNER" });
    const service = new GdprService(db as unknown as PrismaClient);
    await expect(service.softDelete("u1")).rejects.toThrow(
      /transfer ownership/,
    );
  });

  it("removes future assignments on soft-delete", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "WORKER" });
    db.shiftAssignment.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    db.user.update.mockResolvedValue({});
    db.shiftAssignment.deleteMany.mockResolvedValue({ count: 2 });
    const service = new GdprService(db as unknown as PrismaClient);
    const result = await service.softDelete("u1");
    expect(result).toEqual({ deletedAssignments: 2 });
  });
});

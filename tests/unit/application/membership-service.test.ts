import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { MembershipService } from "@/application/services/membership-service";
import { createPrismaMock } from "../../helpers/mock-prisma";

describe("MembershipService", () => {
  it("lists active memberships with business names", async () => {
    const db = createPrismaMock();
    db.membership.findMany.mockResolvedValue([
      {
        id: "m1",
        userId: "u1",
        businessId: "b1",
        role: "OWNER",
        status: "ACTIVE",
        business: { id: "b1", name: "Cafe A" },
      },
      {
        id: "m2",
        userId: "u1",
        businessId: "b2",
        role: "MANAGER",
        status: "ACTIVE",
        business: { id: "b2", name: "Cafe B" },
      },
    ]);
    const service = new MembershipService(db as unknown as PrismaClient);
    const result = await service.listForUser("u1");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ businessName: "Cafe A", role: "OWNER" });
  });

  it("rejects when user has no membership in the business", async () => {
    const db = createPrismaMock();
    db.membership.findFirst.mockResolvedValue(null);
    const service = new MembershipService(db as unknown as PrismaClient);
    await expect(service.assertActive("u1", "b1")).rejects.toThrow(
      /no active membership/,
    );
  });
});

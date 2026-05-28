import { describe, expect, it } from "vitest";
import { AuditService } from "@/application/services/audit-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("AuditService.search", () => {
  it("scopes the query to members of the calling business", async () => {
    const db = createPrismaMock();
    db.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    db.auditEvent.findMany.mockResolvedValue([
      { id: "e1", action: "SHIFT_CREATED", user: { id: "u1", name: "Alex" } },
    ]);

    const svc = new AuditService(asPrisma(db));
    const result = await svc.search({
      businessId: "b1",
      take: 50,
    });

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { businessId: "b1" },
            { ownedBusiness: { id: "b1" } },
          ],
        }),
      }),
    );
    expect(db.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ["u1", "u2"] },
        }),
        take: 51,
      }),
    );
    expect(result.events).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor when the result set fills the page", async () => {
    const db = createPrismaMock();
    db.user.findMany.mockResolvedValue([{ id: "u1" }]);
    db.auditEvent.findMany.mockResolvedValue([
      { id: "e1" },
      { id: "e2" },
      { id: "e3" }, // overflow row past take=2
    ]);

    const svc = new AuditService(asPrisma(db));
    const result = await svc.search({ businessId: "b1", take: 2 });
    expect(result.events).toHaveLength(2);
    expect(result.nextCursor).toBe("e3");
  });
});

describe("AuditService.members", () => {
  it("returns business members ordered by name", async () => {
    const db = createPrismaMock();
    db.user.findMany.mockResolvedValue([{ id: "u1", name: "Alex" }]);
    const svc = new AuditService(asPrisma(db));
    const result = await svc.members("b1");
    expect(result).toEqual([{ id: "u1", name: "Alex" }]);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } }),
    );
  });
});

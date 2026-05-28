import { describe, expect, it } from "vitest";
import { AuthService } from "@/application/services/auth-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("AuthService.register", () => {
  it("rejects when the email is already registered", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue({ id: "u1" });
    const service = new AuthService(asPrisma(db));
    await expect(
      service.register({
        email: "x@y.io",
        password: "secret123",
        name: "X",
        role: "OWNER",
        businessName: "Cafe",
      }),
    ).rejects.toThrow(/already registered/i);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("creates user + business + backlink for owners", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u-new" });
    db.business.create.mockResolvedValue({ id: "b-new" });
    db.user.update.mockResolvedValue({ id: "u-new", businessId: "b-new" });

    const service = new AuthService(asPrisma(db));
    const result = await service.register({
      email: "owner@cafe.io",
      password: "secret123",
      name: "Owner",
      role: "OWNER",
      businessName: "Cafe Mocha",
    });

    expect(result).toEqual({ userId: "u-new", businessId: "b-new" });
    expect(db.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Cafe Mocha", ownerId: "u-new" }),
      }),
    );
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-new" },
        data: { businessId: "b-new" },
      }),
    );
  });

  it("rejects worker registration without a businessId", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(asPrisma(db));
    await expect(
      service.register({
        email: "w@cafe.io",
        password: "secret123",
        name: "Worker",
        role: "WORKER",
      }),
    ).rejects.toThrow(/business id is required/i);
  });

  it("rejects worker registration against a missing business", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.business.findUnique.mockResolvedValue(null);
    const service = new AuthService(asPrisma(db));
    await expect(
      service.register({
        email: "w@cafe.io",
        password: "secret123",
        name: "Worker",
        role: "WORKER",
        businessId: "missing",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("creates a worker against an existing business", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue(null);
    db.business.findUnique.mockResolvedValue({ id: "b-1", name: "Cafe" });
    db.user.create.mockResolvedValue({ id: "u-2" });
    const service = new AuthService(asPrisma(db));
    const result = await service.register({
      email: "w@cafe.io",
      password: "secret123",
      name: "Worker",
      role: "WORKER",
      businessId: "b-1",
    });
    expect(result).toEqual({ userId: "u-2", businessId: "b-1" });
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "WORKER", businessId: "b-1" }),
      }),
    );
  });
});

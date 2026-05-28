import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ApiKeyService } from "@/application/services/api-key-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("ApiKeyService", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("returns the raw key only on create and stores a hash", async () => {
    db.apiKey.create.mockImplementation(async ({ data }) => ({
      id: "k1",
      hashedKey: data.hashedKey,
      prefix: data.prefix,
      ...data,
    }));
    const svc = new ApiKeyService(db as unknown as PrismaClient);
    const created = await svc.create({
      businessId: "b1",
      name: "ci",
      scopes: ["shifts:read"],
    });
    expect(created.raw).toMatch(/^tg_/);
    expect(created.prefix).toMatch(/^tg_/);
    const writtenHash = db.apiKey.create.mock.calls[0][0].data.hashedKey;
    expect(writtenHash).not.toEqual(created.raw);
    expect(writtenHash).toHaveLength(64);
  });

  it("rejects unknown scopes", async () => {
    const svc = new ApiKeyService(db as unknown as PrismaClient);
    await expect(
      svc.create({
        businessId: "b1",
        name: "ci",
        // @ts-expect-error testing runtime validation
        scopes: ["nope"],
      }),
    ).rejects.toThrow(/Unknown scope/);
  });

  it("authenticate returns null for unknown / revoked / expired keys", async () => {
    const svc = new ApiKeyService(db as unknown as PrismaClient);
    db.apiKey.findUnique.mockResolvedValueOnce(null);
    expect(await svc.authenticate("tg_invalid")).toBeNull();
    db.apiKey.findUnique.mockResolvedValueOnce({
      id: "k",
      businessId: "b1",
      scopes: ["shifts:read"],
      revokedAt: new Date(),
      expiresAt: null,
    });
    expect(await svc.authenticate("tg_revoked")).toBeNull();
    db.apiKey.findUnique.mockResolvedValueOnce({
      id: "k",
      businessId: "b1",
      scopes: ["shifts:read"],
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await svc.authenticate("tg_expired")).toBeNull();
  });

  it("authenticate returns key on success and bumps lastUsedAt", async () => {
    const svc = new ApiKeyService(db as unknown as PrismaClient);
    db.apiKey.findUnique.mockResolvedValue({
      id: "k",
      businessId: "b1",
      scopes: ["shifts:read"],
      revokedAt: null,
      expiresAt: null,
    });
    db.apiKey.update.mockResolvedValue({});
    const result = await svc.authenticate("tg_good");
    expect(result).toEqual({
      id: "k",
      businessId: "b1",
      scopes: ["shifts:read"],
    });
    expect(db.apiKey.update).toHaveBeenCalled();
  });

  it("rejects raw keys that lack the expected prefix", async () => {
    const svc = new ApiKeyService(db as unknown as PrismaClient);
    expect(await svc.authenticate("not-a-real-key")).toBeNull();
  });
});

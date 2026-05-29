import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runGdprPurge } from "@/infrastructure/jobs/handlers";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const STORAGE_KEYS = [
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY",
  "STORAGE_SECRET_KEY",
] as const;

function primePurgeUser(db: PrismaMock) {
  db.user.findUnique.mockResolvedValue({ id: "u1", role: "WORKER" });
  db.document.deleteMany.mockResolvedValue({ count: 0 });
  db.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
  db.availability.deleteMany.mockResolvedValue({ count: 0 });
  db.user.update.mockResolvedValue({});
  db.auditEvent.create.mockResolvedValue({});
}

describe("runGdprPurge", () => {
  let db: PrismaMock;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    db = createPrismaMock();
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of STORAGE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("anonymises the user even when storage is not configured", async () => {
    for (const key of STORAGE_KEYS) delete process.env[key];
    primePurgeUser(db);

    const res = await runGdprPurge(db as unknown as PrismaClient, {
      userId: "u1",
    });
    expect(res.documentsPurged).toBe(0);
    expect(res.anonymized).toBe(true);
    expect(db.auditEvent.create.mock.calls[0][0].data.action).toBe("GDPR_PURGED");
  });

  it("deletes the user's S3 documents then anonymises", async () => {
    process.env.STORAGE_ENDPOINT = "https://s3.eu-west-1.amazonaws.com";
    process.env.STORAGE_REGION = "eu-west-1";
    process.env.STORAGE_BUCKET = "tg-uploads";
    process.env.STORAGE_ACCESS_KEY = "AK";
    process.env.STORAGE_SECRET_KEY = "SK";

    db.document.findMany.mockResolvedValue([
      {
        id: "d1",
        url: "https://tg-uploads.s3.eu-west-1.amazonaws.com/documents/u1/abc.pdf",
      },
    ]);
    primePurgeUser(db);

    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const res = await runGdprPurge(
      db as unknown as PrismaClient,
      { userId: "u1" },
      fetcher as unknown as typeof fetch,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("X-Amz-Signature=");
    expect(res.documentsPurged).toBe(1);
    expect(res.anonymized).toBe(true);
  });
});

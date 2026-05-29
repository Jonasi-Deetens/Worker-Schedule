import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { GdprService } from "@/application/services/gdpr-service";
import { encryptPii } from "@/infrastructure/crypto/pii";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

function fullUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "x@y.com",
    passwordHash: "hash",
    twoFactorSecret: "secret",
    role: "WORKER",
    nationalNumber: null,
    availabilities: [],
    availabilityTemplates: [],
    subscriptions: [],
    assignments: [],
    notifications: [],
    timeOffRequests: [],
    timeEntries: [],
    skills: [],
    documents: [],
    workerContracts: [{ id: "wc1" }],
    stuDeclarations: [{ id: "stu1" }],
    studentQuotas: [{ id: "q1" }],
    auditEvents: [{ id: "a1" }],
    ...overrides,
  };
}

describe("GdprService.exportUser", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
    db.dimonaDeclaration.findMany.mockResolvedValue([{ id: "dim1" }]);
    db.timeEntryCorrection.findMany.mockResolvedValue([{ id: "corr1" }]);
  });

  it("strips secrets and includes the new GDPR sections", async () => {
    db.user.findUnique.mockResolvedValue(fullUser());
    const service = new GdprService(db as unknown as PrismaClient);
    const result = await service.exportUser("u1");

    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("twoFactorSecret");
    expect(result).toHaveProperty("email", "x@y.com");
    expect(result.workerContracts).toEqual([{ id: "wc1" }]);
    expect(result.dimonaStuDeclarations).toEqual([{ id: "stu1" }]);
    expect(result.studentQuota).toEqual([{ id: "q1" }]);
    expect(result.auditEvents).toEqual([{ id: "a1" }]);
    expect(result.dimonaDeclarations).toEqual([{ id: "dim1" }]);
    expect(result.timeEntryCorrections).toEqual([{ id: "corr1" }]);
  });

  it("decrypts the data subject's own NISS", async () => {
    db.user.findUnique.mockResolvedValue(
      fullUser({ nationalNumber: encryptPii("90010112345") }),
    );
    const service = new GdprService(db as unknown as PrismaClient);
    const result = await service.exportUser("u1");
    expect(result.nationalNumber).toBe("90010112345");
  });
});

describe("GdprService.softDelete", () => {
  it("blocks owner soft-delete", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "OWNER" });
    const service = new GdprService(db as unknown as PrismaClient);
    await expect(service.softDelete("u1")).rejects.toThrow(/transfer ownership/);
  });

  it("removes future assignments on soft-delete", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "WORKER" });
    db.shiftAssignment.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    db.user.update.mockResolvedValue({});
    db.shiftAssignment.deleteMany.mockResolvedValue({ count: 2 });
    const service = new GdprService(db as unknown as PrismaClient);
    const result = await service.softDelete("u1");
    expect(result).toEqual({ deletedAssignments: 2 });
  });
});

describe("GdprService.requestDeletion", () => {
  it("soft-deletes, audits the request and enqueues the purge", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "WORKER" });
    db.shiftAssignment.findMany.mockResolvedValue([]);
    db.user.update.mockResolvedValue({});
    db.shiftAssignment.deleteMany.mockResolvedValue({ count: 0 });
    db.auditEvent.create.mockResolvedValue({});
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const service = new GdprService(db as unknown as PrismaClient, enqueue);
    const result = await service.requestDeletion("u1");

    expect(enqueue).toHaveBeenCalledWith({ userId: "u1" });
    expect(db.auditEvent.create.mock.calls[0][0].data.action).toBe(
      "GDPR_DELETE_REQUESTED",
    );
    expect(result.retentionDays).toBe(90);
  });
});

describe("GdprService.purgeUser", () => {
  it("anonymises personal data and writes a GDPR_PURGED audit event", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "WORKER" });
    db.document.deleteMany.mockResolvedValue({ count: 0 });
    db.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    db.availability.deleteMany.mockResolvedValue({ count: 0 });
    db.user.update.mockResolvedValue({});
    db.auditEvent.create.mockResolvedValue({});

    const service = new GdprService(db as unknown as PrismaClient);
    const result = await service.purgeUser("u1");

    expect(result.anonymized).toBe(true);
    const update = db.user.update.mock.calls[0][0].data;
    expect(update.name).toBe("Deleted user");
    expect(update.nationalNumber).toBeNull();
    expect(update.passwordHash).toBe("");
    expect(update.email).toContain("deleted+u1@");
    expect(db.auditEvent.create.mock.calls[0][0].data.action).toBe("GDPR_PURGED");
  });

  it("refuses to purge an owner", async () => {
    const db = createPrismaMock();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "OWNER" });
    const service = new GdprService(db as unknown as PrismaClient);
    await expect(service.purgeUser("u1")).rejects.toThrow(/transfer ownership/);
  });
});

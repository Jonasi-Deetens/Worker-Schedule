import { describe, expect, it } from "vitest";
import { WorkerService } from "@/application/services/worker-service";
import { decryptPii } from "@/infrastructure/crypto/pii";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

function setup() {
  const db = createPrismaMock();
  db.user.findFirst.mockResolvedValue({ id: "w1", businessId: "b1" });
  db.user.update.mockResolvedValue({ id: "w1", status: "ACTIVE" });
  db.auditEvent.create.mockResolvedValue({});
  return { db, service: new WorkerService(asPrisma(db)) };
}

describe("WorkerService.setStatus audit action", () => {
  it("logs WORKER_REACTIVATED when setting status back to ACTIVE", async () => {
    const { db, service } = setup();
    await service.setStatus({
      id: "w1",
      businessId: "b1",
      actorId: "owner",
      status: "ACTIVE",
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "WORKER_REACTIVATED" }),
      }),
    );
  });

  it("logs WORKER_SUSPENDED when suspending", async () => {
    const { db, service } = setup();
    await service.setStatus({
      id: "w1",
      businessId: "b1",
      actorId: "owner",
      status: "SUSPENDED",
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "WORKER_SUSPENDED" }),
      }),
    );
  });

  it("logs WORKER_ARCHIVED when archiving", async () => {
    const { db, service } = setup();
    await service.setStatus({
      id: "w1",
      businessId: "b1",
      actorId: "owner",
      status: "ARCHIVED",
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "WORKER_ARCHIVED" }),
      }),
    );
  });
});

describe("WorkerService.updateProfile NISS", () => {
  it("normalizes the national number to digits and audits the change", async () => {
    const db = createPrismaMock();
    db.user.findFirst.mockResolvedValue({
      id: "w1",
      businessId: "b1",
      nationalNumber: null,
    });
    db.user.update.mockResolvedValue({ id: "w1" });
    db.auditEvent.create.mockResolvedValue({});
    const service = new WorkerService(asPrisma(db));

    await service.updateProfile({
      id: "w1",
      businessId: "b1",
      actorId: "owner",
      nationalNumber: "90.01.01-123.45",
    });

    // NISS is encrypted at rest — the stored value must round-trip back to the
    // canonical digits-only form, and must not be stored as plaintext.
    const stored = db.user.update.mock.calls[0][0].data.nationalNumber as string;
    expect(stored).not.toBe("90010112345");
    expect(decryptPii(stored)).toBe("90010112345");
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "WORKER_PROFILE_UPDATED" }),
      }),
    );
  });

  it("does not audit when the national number is unchanged", async () => {
    const db = createPrismaMock();
    db.user.findFirst.mockResolvedValue({
      id: "w1",
      businessId: "b1",
      nationalNumber: "90010112345",
    });
    db.user.update.mockResolvedValue({ id: "w1" });
    const service = new WorkerService(asPrisma(db));

    await service.updateProfile({
      id: "w1",
      businessId: "b1",
      actorId: "owner",
      name: "New Name",
    });

    expect(db.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe("WorkerService business scoping", () => {
  it("list only returns workers and managers in the business", async () => {
    const db = createPrismaMock();
    db.user.findMany.mockResolvedValue([]);
    const service = new WorkerService(asPrisma(db));
    await service.list("b1");
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.businessId).toBe("b1");
    expect(where.role).toEqual({ in: ["WORKER", "MANAGER"] });
  });

  it("get throws when the worker is not in the acting business", async () => {
    const db = createPrismaMock();
    db.user.findFirst.mockResolvedValue(null);
    const service = new WorkerService(asPrisma(db));
    await expect(service.get({ id: "w1", businessId: "b1" })).rejects.toThrow(
      /not found/i,
    );
    expect(db.user.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "w1",
      businessId: "b1",
    });
  });

  it("updateProfile rejects a worker from another business", async () => {
    const db = createPrismaMock();
    db.user.findFirst.mockResolvedValue(null);
    const service = new WorkerService(asPrisma(db));
    await expect(
      service.updateProfile({
        id: "w1",
        businessId: "b1",
        actorId: "owner",
        name: "X",
      }),
    ).rejects.toThrow(/not found/i);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("WorkerService.setSkills", () => {
  it("filters out skill ids that don't belong to the business", async () => {
    const db = createPrismaMock();
    db.user.findFirst.mockResolvedValue({ id: "w1", businessId: "b1" });
    // Only s1 + s2 are valid for this business; s3 belongs to someone else.
    db.skill.findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    db.user.findUnique.mockResolvedValue({ id: "w1", skills: [] });
    const service = new WorkerService(asPrisma(db));

    await service.setSkills({
      userId: "w1",
      businessId: "b1",
      skillIds: ["s1", "s2", "s3"],
    });

    // The createMany inside the $transaction only gets the valid pairs.
    const createManyArg = db.userSkill.createMany.mock.calls[0][0];
    expect(createManyArg.data).toEqual([
      { userId: "w1", skillId: "s1" },
      { userId: "w1", skillId: "s2" },
    ]);
  });

  it("throws when the worker is not in the business", async () => {
    const db = createPrismaMock();
    db.user.findFirst.mockResolvedValue(null);
    const service = new WorkerService(asPrisma(db));
    await expect(
      service.setSkills({ userId: "w1", businessId: "b1", skillIds: [] }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("WorkerService.stats", () => {
  it("computes the 90-day no-show rate from grouped attendance", async () => {
    const db = createPrismaMock();
    // aggregateHours -> shiftAssignment.findMany (called twice: month + year)
    db.shiftAssignment.findMany.mockResolvedValue([]);
    // upcoming count, then noShowsAllTime count
    db.shiftAssignment.count
      .mockResolvedValueOnce(3) // upcoming
      .mockResolvedValueOnce(5); // noShowsAllTime
    db.shiftAssignment.groupBy.mockResolvedValue([
      { attendance: "ON_TIME", _count: { _all: 8 } },
      { attendance: "NO_SHOW", _count: { _all: 2 } },
    ]);
    const service = new WorkerService(asPrisma(db));

    const stats = await service.stats({ id: "w1", businessId: "b1" });
    expect(stats.upcoming).toBe(3);
    expect(stats.noShowsAllTime).toBe(5);
    expect(stats.attendanceMarkedLast90d).toBe(10);
    expect(stats.noShowsLast90d).toBe(2);
    expect(stats.noShowRate90d).toBe(20); // 2/10 -> 20.0%
  });
});

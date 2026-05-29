import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DimonaService } from "@/application/services/dimona-service";
import { MockDimonaAdapter } from "@/infrastructure/dimona/adapter";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("DimonaService.shouldAutoDeclare", () => {
  it("returns true for FLEXI, JOBSTUDENT, EXTRA", () => {
    expect(DimonaService.shouldAutoDeclare("FLEXI")).toBe(true);
    expect(DimonaService.shouldAutoDeclare("JOBSTUDENT")).toBe(true);
    expect(DimonaService.shouldAutoDeclare("EXTRA")).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(DimonaService.shouldAutoDeclare("EMPLOYEE")).toBe(false);
    expect(DimonaService.shouldAutoDeclare(null)).toBe(false);
  });
});

describe("DimonaService.declareIn", () => {
  let db: PrismaMock;
  let adapter: MockDimonaAdapter;
  beforeEach(() => {
    db = createPrismaMock();
    adapter = new MockDimonaAdapter();
  });

  it("skips when business has no employer id", async () => {
    db.shift.findUnique.mockResolvedValue({
      id: "s1",
      startsAt: new Date(),
      endsAt: new Date(),
      business: { dimonaEmployerId: null },
    });
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      contractType: "FLEXI",
      nationalNumber: "x",
    });
    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.declareIn({ shiftId: "s1", workerId: "u1" });
    expect(result).toBeNull();
    expect(db.dimonaDeclaration.create).not.toHaveBeenCalled();
  });

  it("creates a CONFIRMED declaration on success", async () => {
    db.shift.findUnique.mockResolvedValue({
      id: "s1",
      startsAt: new Date(),
      endsAt: new Date(),
      business: { dimonaEmployerId: "RSZ-1" },
    });
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      contractType: "FLEXI",
      nationalNumber: "12.34.56-789.01",
    });
    db.dimonaDeclaration.findFirst.mockResolvedValue(null);
    // A covering signed contract is required before Dimona may be filed.
    db.workerContract.findFirst.mockResolvedValue({
      id: "c1",
      startDate: null,
      endDate: null,
    });
    db.dimonaDeclaration.create.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));
    db.auditEvent.create.mockResolvedValue({ id: "a1" });

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.declareIn({ shiftId: "s1", workerId: "u1" });
    expect(result?.status).toBe("CONFIRMED");
    expect(db.dimonaDeclaration.create).toHaveBeenCalledOnce();
    expect(db.auditEvent.create).toHaveBeenCalledOnce();
  });

  it("creates a REJECTED declaration when NISS is missing", async () => {
    db.shift.findUnique.mockResolvedValue({
      id: "s1",
      startsAt: new Date(),
      endsAt: new Date(),
      business: { dimonaEmployerId: "RSZ-1" },
    });
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      contractType: "FLEXI",
      nationalNumber: null,
    });
    db.dimonaDeclaration.findFirst.mockResolvedValue(null);
    db.workerContract.findFirst.mockResolvedValue({
      id: "c1",
      startDate: null,
      endDate: null,
    });
    db.dimonaDeclaration.create.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.declareIn({ shiftId: "s1", workerId: "u1" });
    expect(result?.status).toBe("REJECTED");
  });
});

describe("DimonaService.declareIn contract gating", () => {
  let db: PrismaMock;
  let adapter: MockDimonaAdapter;
  beforeEach(() => {
    db = createPrismaMock();
    adapter = new MockDimonaAdapter();
    db.shift.findUnique.mockResolvedValue({
      id: "s1",
      businessId: "b1",
      startsAt: new Date("2026-07-01"),
      endsAt: new Date("2026-07-01"),
      business: {
        id: "b1",
        ownerId: "owner1",
        dimonaEmployerId: "RSZ-1",
      },
    });
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "Jane",
      contractType: "JOBSTUDENT",
      nationalNumber: "90010112345",
    });
    db.dimonaDeclaration.findFirst.mockResolvedValue(null);
    db.dimonaDeclaration.create.mockImplementation(async ({ data }) => ({
      id: "d1",
      ...data,
    }));
    db.auditEvent.create.mockResolvedValue({});
    db.notification.create.mockResolvedValue({});
  });

  it("blocks the declaration and flags it when no signed contract exists", async () => {
    db.workerContract.findFirst.mockResolvedValue(null);

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    await expect(
      service.declareIn({ shiftId: "s1", workerId: "u1" }),
    ).rejects.toThrow("errors.dimonaContractRequired");

    // A REJECTED declaration + an owner notification are the manager-visible flag.
    expect(db.dimonaDeclaration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REJECTED",
          errorMessage: "errors.dimonaContractRequired",
        }),
      }),
    );
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "owner1" }),
      }),
    );
  });

  it("blocks when the signed contract does not cover the shift date", async () => {
    db.workerContract.findFirst.mockResolvedValue({
      id: "c1",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-03-31"),
    });

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    await expect(
      service.declareIn({ shiftId: "s1", workerId: "u1" }),
    ).rejects.toThrow("errors.dimonaContractRequired");
  });

  it("allows the declaration when a covering signed contract exists", async () => {
    db.workerContract.findFirst.mockResolvedValue({
      id: "c1",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-08-31"),
    });

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.declareIn({ shiftId: "s1", workerId: "u1" });
    expect(result?.status).toBe("CONFIRMED");
  });
});

describe("DimonaService.cancel", () => {
  let db: PrismaMock;
  let adapter: MockDimonaAdapter;
  beforeEach(() => {
    db = createPrismaMock();
    adapter = new MockDimonaAdapter();
  });

  it("no-ops when there is no confirmed declaration", async () => {
    db.dimonaDeclaration.findFirst.mockResolvedValue(null);
    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.cancel({ shiftId: "s1", workerId: "u1" });
    expect(result).toBeNull();
    expect(db.dimonaDeclaration.update).not.toHaveBeenCalled();
  });

  it("cancels via the adapter and audits when a period exists", async () => {
    // Seed an active IN declaration in the mock adapter so CANCEL succeeds.
    const inResult = await adapter.declare({
      workerNiss: "90010112345",
      workerType: "FLX",
      startsAt: new Date(),
      endsAt: new Date(),
      employerId: "RSZ-1",
      action: "IN",
    });
    db.dimonaDeclaration.findFirst.mockResolvedValue({
      id: "d1",
      status: "CONFIRMED",
      dimonaPeriodId: inResult.dimonaPeriodId,
    });
    db.shift.findUnique.mockResolvedValue({
      id: "s1",
      startsAt: new Date(),
      endsAt: new Date(),
      business: { dimonaEmployerId: "RSZ-1" },
    });
    db.dimonaDeclaration.update.mockResolvedValue({ id: "d1", status: "CANCELLED" });
    db.auditEvent.create.mockResolvedValue({});

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.cancel({ shiftId: "s1", workerId: "u1" });

    expect(result?.status).toBe("CANCELLED");
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DIMONA_CANCELLED" }),
      }),
    );
  });
});

describe("DimonaService.declareOut", () => {
  let db: PrismaMock;
  let adapter: MockDimonaAdapter;

  beforeEach(() => {
    db = createPrismaMock();
    adapter = new MockDimonaAdapter();
  });

  it("records outDeclaredAt on success", async () => {
    const inResult = await adapter.declare({
      workerNiss: "90010112345",
      workerType: "FLX",
      startsAt: new Date(),
      endsAt: new Date(),
      employerId: "RSZ-1",
      action: "IN",
    });
    db.dimonaDeclaration.findFirst.mockResolvedValue({
      id: "d1",
      status: "CONFIRMED",
      dimonaPeriodId: inResult.dimonaPeriodId,
      outDeclaredAt: null,
      errorMessage: null,
    });
    db.shift.findUnique.mockResolvedValue({
      id: "s1",
      startsAt: new Date(),
      endsAt: new Date(),
      business: { dimonaEmployerId: "RSZ-1" },
    });
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      contractType: "FLEXI",
      nationalNumber: "12.34.56-789.01",
    });
    db.dimonaDeclaration.update.mockImplementation(async ({ data }) => ({
      id: "d1",
      ...data,
    }));
    db.auditEvent.create.mockResolvedValue({});

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.declareOut({ shiftId: "s1", workerId: "u1" });

    expect(result?.outDeclaredAt).toBeInstanceOf(Date);
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DIMONA_OUT_DECLARED" }),
      }),
    );
  });
});

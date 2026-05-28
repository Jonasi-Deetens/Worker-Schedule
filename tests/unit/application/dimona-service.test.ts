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
    db.dimonaDeclaration.create.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));

    const service = new DimonaService(db as unknown as PrismaClient, adapter);
    const result = await service.declareIn({ shiftId: "s1", workerId: "u1" });
    expect(result?.status).toBe("REJECTED");
  });
});

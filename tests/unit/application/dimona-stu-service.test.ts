import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DimonaService } from "@/application/services/dimona-service";
import { MockDimonaAdapter } from "@/infrastructure/dimona/adapter";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const shift = (startIso: string, endIso: string) => ({
  shift: { startsAt: new Date(startIso), endsAt: new Date(endIso) },
});

describe("DimonaService STU per-quarter engine", () => {
  let db: PrismaMock;
  let adapter: MockDimonaAdapter;

  beforeEach(() => {
    db = createPrismaMock();
    adapter = new MockDimonaAdapter();
  });

  describe("computeStuPlannedHours", () => {
    it("sums assignments, rounding each shift's started hour up", async () => {
      // 3h30 -> 4, 2h00 -> 2, 0h45 -> 1  => 7 planned hours
      db.shiftAssignment.findMany.mockResolvedValue([
        shift("2026-07-01T09:00:00Z", "2026-07-01T12:30:00Z"),
        shift("2026-07-02T10:00:00Z", "2026-07-02T12:00:00Z"),
        shift("2026-07-03T10:00:00Z", "2026-07-03T10:45:00Z"),
      ]);
      const service = new DimonaService(db as unknown as PrismaClient, adapter);
      const hours = await service.computeStuPlannedHours({
        userId: "u1",
        businessId: "b1",
        year: 2026,
        quarter: 3,
      });
      expect(hours).toBe(7);
    });
  });

  describe("recomputeStuQuarter", () => {
    function seedStudent() {
      db.business.findUnique.mockResolvedValue({
        id: "b1",
        dimonaEmployerId: "RSZ-1",
        dimonaCredentials: null,
      });
      db.user.findUnique.mockResolvedValue({
        id: "u1",
        contractType: "JOBSTUDENT",
        nationalNumber: "90010112345",
      });
      db.auditEvent.create.mockResolvedValue({});
      db.dimonaStuDeclaration.upsert.mockImplementation(async ({ create }) => ({
        id: "stu1",
        ...create,
      }));
      db.dimonaStuDeclaration.update.mockImplementation(async ({ data }) => ({
        id: "stu1",
        ...data,
      }));
    }

    it("files one CONFIRMED quarter declaration with planned hours", async () => {
      seedStudent();
      db.shiftAssignment.findMany.mockResolvedValue([
        shift("2026-07-01T09:00:00Z", "2026-07-01T17:00:00Z"), // 8h
        shift("2026-07-02T09:00:00Z", "2026-07-02T12:30:00Z"), // 4h
      ]);
      db.dimonaStuDeclaration.findUnique.mockResolvedValue(null);
      db.workerContract.findFirst.mockResolvedValue({
        id: "c1",
        startDate: null,
        endDate: null,
      });

      const service = new DimonaService(db as unknown as PrismaClient, adapter);
      const result = await service.recomputeStuQuarter({
        userId: "u1",
        businessId: "b1",
        year: 2026,
        quarter: 3,
      });

      expect(result?.status).toBe("CONFIRMED");
      expect(result?.plannedHours).toBe(12);
      expect(db.dimonaStuDeclaration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ plannedHours: 12, reservedHours: 12 }),
        }),
      );
    });

    it("never files a 0-hour quarter and cancels an existing declaration", async () => {
      seedStudent();
      db.shiftAssignment.findMany.mockResolvedValue([]); // empty quarter
      db.dimonaStuDeclaration.findUnique.mockResolvedValue({
        id: "stu1",
        status: "CONFIRMED",
        dimonaPeriodId: "DIM-1",
      });

      const service = new DimonaService(db as unknown as PrismaClient, adapter);
      const result = await service.recomputeStuQuarter({
        userId: "u1",
        businessId: "b1",
        year: 2026,
        quarter: 3,
      });

      expect(result?.status).toBe("CANCELLED");
      expect(db.dimonaStuDeclaration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "CANCELLED", plannedHours: 0 }),
        }),
      );
      // Never upserts a fresh declaration for an empty quarter.
      expect(db.dimonaStuDeclaration.upsert).not.toHaveBeenCalled();
    });

    it("flags REJECTED when no signed contract covers the quarter (gating holds)", async () => {
      seedStudent();
      db.shiftAssignment.findMany.mockResolvedValue([
        shift("2026-07-01T09:00:00Z", "2026-07-01T17:00:00Z"),
      ]);
      db.dimonaStuDeclaration.findUnique.mockResolvedValue(null);
      db.workerContract.findFirst.mockResolvedValue(null); // no signed contract

      const service = new DimonaService(db as unknown as PrismaClient, adapter);
      const result = await service.recomputeStuQuarter({
        userId: "u1",
        businessId: "b1",
        year: 2026,
        quarter: 3,
      });

      expect(result?.status).toBe("REJECTED");
      expect(db.dimonaStuDeclaration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: "REJECTED",
            errorMessage: "errors.dimonaContractRequired",
          }),
        }),
      );
    });

    it("skips when the business has no Dimona employer id", async () => {
      db.business.findUnique.mockResolvedValue({
        id: "b1",
        dimonaEmployerId: null,
        dimonaCredentials: null,
      });
      db.user.findUnique.mockResolvedValue({
        id: "u1",
        contractType: "JOBSTUDENT",
        nationalNumber: "90010112345",
      });

      const service = new DimonaService(db as unknown as PrismaClient, adapter);
      const result = await service.recomputeStuQuarter({
        userId: "u1",
        businessId: "b1",
        year: 2026,
        quarter: 3,
      });
      expect(result).toBeNull();
      expect(db.dimonaStuDeclaration.upsert).not.toHaveBeenCalled();
    });
  });
});

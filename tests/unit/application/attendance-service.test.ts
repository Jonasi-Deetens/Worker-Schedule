import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AttendanceService } from "@/application/services/attendance-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("AttendanceService.mark", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("rejects marking before the shift starts", async () => {
    db.shiftAssignment.findFirst.mockResolvedValue({
      id: "a1",
      shift: { startsAt: new Date(Date.now() + 86_400_000) },
    });
    const service = new AttendanceService(db as unknown as PrismaClient);
    await expect(
      service.mark({
        assignmentId: "a1",
        businessId: "b1",
        reviewerId: "u1",
        status: "NO_SHOW",
      }),
    ).rejects.toThrow(/before the shift starts/);
  });

  it("rejects unknown assignment", async () => {
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    const service = new AttendanceService(db as unknown as PrismaClient);
    await expect(
      service.mark({
        assignmentId: "missing",
        businessId: "b1",
        reviewerId: "u1",
        status: "ON_TIME",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("writes the verdict and creates an audit event", async () => {
    db.shiftAssignment.findFirst.mockResolvedValue({
      id: "a1",
      shift: { startsAt: new Date(Date.now() - 86_400_000) },
    });
    db.shiftAssignment.update.mockResolvedValue({ id: "a1", attendance: "NO_SHOW" });
    db.auditEvent.create.mockResolvedValue({ id: "ae1" });
    const service = new AttendanceService(db as unknown as PrismaClient);
    const result = await service.mark({
      assignmentId: "a1",
      businessId: "b1",
      reviewerId: "u1",
      status: "NO_SHOW",
      note: "didn't call",
    });
    expect(result.attendance).toBe("NO_SHOW");
    expect(db.shiftAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendance: "NO_SHOW",
          attendanceNote: "didn't call",
        }),
      }),
    );
    expect(db.auditEvent.create).toHaveBeenCalled();
  });
});

describe("AttendanceService.businessSummary", () => {
  it("computes no-show rate from grouped counts", async () => {
    const db = createPrismaMock();
    db.shiftAssignment.groupBy.mockResolvedValue([
      { attendance: "ON_TIME", _count: { _all: 10 } },
      { attendance: "NO_SHOW", _count: { _all: 2 } },
    ]);
    const service = new AttendanceService(db as unknown as PrismaClient);
    const result = await service.businessSummary({
      businessId: "b1",
      from: new Date(),
      to: new Date(),
    });
    expect(result.total).toBe(12);
    expect(result.NO_SHOW).toBe(2);
    expect(result.ON_TIME).toBe(10);
    expect(result.noShowRate).toBeCloseTo(2 / 12);
  });
});

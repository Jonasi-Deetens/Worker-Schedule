import { beforeEach, describe, expect, it } from "vitest";
import { ShiftAssignmentService } from "@/application/services/shift-assignment-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const BUSINESS_ID = "biz-1";
const OWNER_ID = "owner-1";

let prisma: PrismaMock;
let service: ShiftAssignmentService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new ShiftAssignmentService(asPrisma(prisma));
});

describe("ShiftAssignmentService.assignWorker", () => {
  const baseShift = {
    id: "s1",
    businessId: BUSINESS_ID,
    requiredSpots: 2,
    status: "OPEN",
    startsAt: new Date("2026-06-01T10:00:00Z"),
    endsAt: new Date("2026-06-01T14:00:00Z"),
    roleLabel: "Bartender",
    assignments: [],
  };

  it("rejects when the shift is already at capacity", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      ...baseShift,
      assignments: [{ userId: "w1" }, { userId: "w2" }],
    });
    await expect(
      service.assignWorker({
        shiftId: "s1",
        workerId: "w3",
        businessId: BUSINESS_ID,
        ownerId: OWNER_ID,
      }),
    ).rejects.toThrow(/capacity/i);
  });

  it("rejects when the worker is not active", async () => {
    prisma.shift.findFirst.mockResolvedValue(baseShift);
    prisma.user.findFirst.mockResolvedValue({
      id: "w1",
      businessId: BUSINESS_ID,
      status: "SUSPENDED",
    });
    await expect(
      service.assignWorker({
        shiftId: "s1",
        workerId: "w1",
        businessId: BUSINESS_ID,
        ownerId: OWNER_ID,
      }),
    ).rejects.toThrow(/not active/i);
  });

  it("blocks an assignment when approved time-off overlaps", async () => {
    prisma.shift.findFirst.mockResolvedValue(baseShift);
    prisma.user.findFirst.mockResolvedValue({
      id: "w1",
      businessId: BUSINESS_ID,
      status: "ACTIVE",
    });
    prisma.shiftAssignment.findFirst.mockResolvedValue(null);
    prisma.timeOffRequest.findFirst.mockResolvedValue({ id: "to1" });
    await expect(
      service.assignWorker({
        shiftId: "s1",
        workerId: "w1",
        businessId: BUSINESS_ID,
        ownerId: OWNER_ID,
      }),
    ).rejects.toThrow(/time-off/i);
  });
});

describe("ShiftAssignmentService.findRescheduleConflicts", () => {
  it("returns warnings for already-assigned workers with overlapping shifts", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "shift-1",
      assignments: [{ userId: "worker-1", user: { id: "worker-1", name: "Alex" } }],
    });
    prisma.shiftAssignment.findMany.mockResolvedValue([
      {
        userId: "worker-1",
        shiftId: "shift-2",
        shift: {
          startsAt: new Date("2026-06-01T12:00:00Z"),
          endsAt: new Date("2026-06-01T20:00:00Z"),
        },
      },
    ]);

    const warnings = await service.findRescheduleConflicts({
      id: "shift-1",
      businessId: BUSINESS_ID,
      startsAt: new Date("2026-06-01T15:00:00Z"),
      endsAt: new Date("2026-06-01T22:00:00Z"),
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.userId).toBe("worker-1");
    expect(warnings[0]?.userName).toBe("Alex");
  });

  it("returns an empty list when nothing overlaps", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "shift-1",
      assignments: [{ userId: "worker-1", user: { id: "worker-1", name: "Alex" } }],
    });
    prisma.shiftAssignment.findMany.mockResolvedValue([]);

    const warnings = await service.findRescheduleConflicts({
      id: "shift-1",
      businessId: BUSINESS_ID,
      startsAt: new Date("2026-06-01T15:00:00Z"),
      endsAt: new Date("2026-06-01T22:00:00Z"),
    });
    expect(warnings).toHaveLength(0);
  });
});

describe("ShiftAssignmentService.confirmReschedule", () => {
  const liveShift = {
    id: "s1",
    businessId: BUSINESS_ID,
    status: "OPEN",
    startsAt: new Date(Date.now() + 86_400_000),
    endsAt: new Date(Date.now() + 90_000_000),
    roleLabel: "Bartender",
  };

  it("re-locks the spot when nothing now conflicts", async () => {
    prisma.shift.findFirst.mockResolvedValue(liveShift);
    prisma.shiftAssignment.findUnique.mockResolvedValue({
      id: "a1",
      status: "PENDING_RECONFIRMATION",
    });
    prisma.shiftAssignment.findFirst.mockResolvedValue(null);
    prisma.timeOffRequest.findFirst.mockResolvedValue(null);
    prisma.shiftAssignment.update.mockResolvedValue({ id: "a1", status: "CONFIRMED" });

    await service.confirmReschedule({
      shiftId: "s1",
      userId: "w1",
      businessId: BUSINESS_ID,
    });

    expect(prisma.shiftAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CONFIRMED" } }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SHIFT_RECONFIRMED" }),
      }),
    );
  });

  it("rejects when the new time overlaps another assignment", async () => {
    prisma.shift.findFirst.mockResolvedValue(liveShift);
    prisma.shiftAssignment.findUnique.mockResolvedValue({
      id: "a1",
      status: "PENDING_RECONFIRMATION",
    });
    prisma.shiftAssignment.findFirst.mockResolvedValue({ id: "other" });

    await expect(
      service.confirmReschedule({
        shiftId: "s1",
        userId: "w1",
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/overlap/i);
    expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
  });

  it("errors when the assignment is not awaiting reconfirmation", async () => {
    prisma.shift.findFirst.mockResolvedValue(liveShift);
    prisma.shiftAssignment.findUnique.mockResolvedValue({
      id: "a1",
      status: "CONFIRMED",
    });

    await expect(
      service.confirmReschedule({
        shiftId: "s1",
        userId: "w1",
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/reconfirm/i);
  });
});

describe("ShiftAssignmentService.declineReschedule", () => {
  it("removes the assignment, withdraws the subscription and notifies the owner", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "s1",
      businessId: BUSINESS_ID,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      roleLabel: "Bartender",
    });
    prisma.shiftAssignment.findUnique.mockResolvedValue({
      id: "a1",
      status: "PENDING_RECONFIRMATION",
    });
    prisma.user.findUnique.mockResolvedValue({ name: "Alex" });
    prisma.shiftAssignment.delete.mockResolvedValue({ id: "a1" });
    prisma.shiftSubscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.business.findUnique.mockResolvedValue({ ownerId: OWNER_ID });
    prisma.notification.create.mockResolvedValue({ id: "n1" });

    await service.declineReschedule({
      shiftId: "s1",
      userId: "w1",
      businessId: BUSINESS_ID,
    });

    expect(prisma.shiftAssignment.delete).toHaveBeenCalledWith({
      where: { id: "a1" },
    });
    expect(prisma.shiftSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "WITHDRAWN" } }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: OWNER_ID }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SHIFT_RECONFIRM_DECLINED" }),
      }),
    );
  });
});

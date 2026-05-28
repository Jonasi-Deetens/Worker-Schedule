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

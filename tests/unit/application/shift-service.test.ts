import { beforeEach, describe, expect, it } from "vitest";
import { ShiftService } from "@/application/services/shift-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const BUSINESS_ID = "biz-1";
const OWNER_ID = "owner-1";

let prisma: PrismaMock;
let service: ShiftService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new ShiftService(asPrisma(prisma));
});

describe("ShiftService.create", () => {
  it("rejects when end time is before or equal to start time", async () => {
    await expect(
      service.create({
        businessId: BUSINESS_ID,
        ownerId: OWNER_ID,
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T10:00:00Z"),
        roleLabel: "Barista",
        requiredSpots: 1,
      }),
    ).rejects.toThrow(/after start time/i);
    expect(prisma.shift.create).not.toHaveBeenCalled();
  });

  it("rejects when requiredSpots is less than 1", async () => {
    await expect(
      service.create({
        businessId: BUSINESS_ID,
        ownerId: OWNER_ID,
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T18:00:00Z"),
        roleLabel: "Barista",
        requiredSpots: 0,
      }),
    ).rejects.toThrow(/Required spots/i);
  });

  it("creates a shift and writes an audit event", async () => {
    prisma.shift.create.mockResolvedValue({ id: "shift-1" });
    prisma.auditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await service.create({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: new Date("2026-06-01T18:00:00Z"),
      roleLabel: "Bartender",
      requiredSpots: 2,
      notes: "Friday rush",
    });

    expect(result).toEqual({ id: "shift-1" });
    expect(prisma.shift.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: BUSINESS_ID,
          roleLabel: "Bartender",
          requiredSpots: 2,
          notes: "Friday rush",
        }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SHIFT_CREATED",
          entityId: "shift-1",
          userId: OWNER_ID,
        }),
      }),
    );
  });
});

describe("ShiftService.update", () => {
  it("rejects when shift does not belong to the business", async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    await expect(
      service.update({
        id: "shift-x",
        businessId: BUSINESS_ID,
        ownerId: OWNER_ID,
        roleLabel: "Updated",
      }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.shift.update).not.toHaveBeenCalled();
  });

  it("updates partial fields and writes audit event", async () => {
    prisma.shift.findFirst.mockResolvedValue({ id: "shift-1" });
    prisma.shift.update.mockResolvedValue({ id: "shift-1", roleLabel: "Host" });

    await service.update({
      id: "shift-1",
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      roleLabel: "Host",
    });

    expect(prisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "shift-1" },
        data: expect.objectContaining({ roleLabel: "Host" }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalled();
  });
});

describe("ShiftService.delete (cancel-with-notify)", () => {
  it("marks shift as cancelled and notifies pending subscribers", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "shift-1",
      roleLabel: "Bartender",
      subscriptions: [
        { userId: "worker-1" },
        { userId: "worker-2" },
      ],
    });
    prisma.shift.update.mockResolvedValue({ id: "shift-1", status: "CANCELLED" });

    await service.delete({
      id: "shift-1",
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
    });

    expect(prisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "shift-1" },
        data: { status: "CANCELLED" },
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "worker-1",
          type: "SHIFT_CANCELLED",
        }),
      }),
    );
  });
});

describe("ShiftService.kpis", () => {
  it("counts shifts by display status and computes capacity %", async () => {
    const startsAt = new Date("2026-06-01T09:00:00Z");
    const endsAt = new Date("2026-06-01T13:00:00Z");
    prisma.shift.findMany.mockResolvedValue([
      {
        id: "a",
        status: "OPEN",
        requiredSpots: 2,
        startsAt,
        endsAt,
        assignments: [],
        _count: { subscriptions: 0, assignments: 0 }, // Open
      },
      {
        id: "b",
        status: "OPEN",
        requiredSpots: 1,
        startsAt,
        endsAt,
        assignments: [],
        _count: { subscriptions: 1, assignments: 0 }, // Pending
      },
      {
        id: "c",
        status: "OPEN",
        requiredSpots: 1,
        startsAt,
        endsAt,
        assignments: [{ user: { hourlyRate: null } }],
        _count: { subscriptions: 0, assignments: 1 }, // Filled
      },
      {
        id: "d",
        status: "CANCELLED",
        requiredSpots: 1,
        startsAt,
        endsAt,
        assignments: [],
        _count: { subscriptions: 0, assignments: 0 }, // Cancelled
      },
    ]);

    const result = await service.kpis({
      businessId: BUSINESS_ID,
      from: new Date("2026-06-01T00:00:00Z"),
      to: new Date("2026-06-30T00:00:00Z"),
    });

    expect(result.open).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.filled).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.approvedSpots).toBe(1);
    expect(result.totalSpots).toBe(4);
    expect(result.capacityPct).toBe(25);
  });

  it("returns 0% capacity when there are no spots in the range", async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    const result = await service.kpis({
      businessId: BUSINESS_ID,
      from: new Date(),
      to: new Date(),
    });
    expect(result.capacityPct).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("ShiftService.findRescheduleConflicts", () => {
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

describe("ShiftService.createRecurring", () => {
  it("creates one shift per week until the cutoff", async () => {
    prisma.shift.create.mockImplementation(() =>
      Promise.resolve({ id: `shift-${Math.random()}` }),
    );
    prisma.auditEvent.create.mockResolvedValue({ id: "audit-x" });

    const result = await service.createRecurring({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: new Date("2026-06-01T18:00:00Z"),
      roleLabel: "Bartender",
      requiredSpots: 1,
      repeatUntil: new Date("2026-06-22T23:59:00Z"),
    });

    expect(result).toHaveLength(4);
    expect(prisma.shift.create).toHaveBeenCalledTimes(4);
  });

  it("rejects when the cutoff is before the first occurrence", async () => {
    await expect(
      service.createRecurring({
        businessId: BUSINESS_ID,
        ownerId: OWNER_ID,
        startsAt: new Date("2026-06-10T10:00:00Z"),
        endsAt: new Date("2026-06-10T18:00:00Z"),
        roleLabel: "Bartender",
        requiredSpots: 1,
        repeatUntil: new Date("2026-06-01T10:00:00Z"),
      }),
    ).rejects.toThrow(/Repeat-until/);
  });
});

describe("ShiftService.listForCalendar", () => {
  it("queries shifts within the range and decorates them with displayStatus", async () => {
    prisma.shift.findMany.mockResolvedValue([
      {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T18:00:00Z"),
        status: "OPEN",
        requiredSpots: 2,
        _count: { subscriptions: 1, assignments: 0 },
      },
      {
        id: "shift-2",
        startsAt: new Date("2026-06-02T10:00:00Z"),
        endsAt: new Date("2026-06-02T18:00:00Z"),
        status: "OPEN",
        requiredSpots: 1,
        _count: { subscriptions: 0, assignments: 1 },
      },
    ]);

    const result = await service.listForCalendar({
      businessId: BUSINESS_ID,
      from: new Date("2026-06-01T00:00:00Z"),
      to: new Date("2026-06-30T00:00:00Z"),
    });

    expect(prisma.shift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: BUSINESS_ID }),
        orderBy: { startsAt: "asc" },
      }),
    );
    expect(result.map((s) => s.displayStatus)).toEqual([
      "Pending",
      "Approved/Filled",
    ]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { ShiftReadModel } from "@/application/services/shift-read-model";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const BUSINESS_ID = "biz-1";

let prisma: PrismaMock;
let readModel: ShiftReadModel;

beforeEach(() => {
  prisma = createPrismaMock();
  readModel = new ShiftReadModel(asPrisma(prisma));
});

describe("ShiftReadModel.kpis", () => {
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

    const result = await readModel.kpis({
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
    const result = await readModel.kpis({
      businessId: BUSINESS_ID,
      from: new Date(),
      to: new Date(),
    });
    expect(result.capacityPct).toBe(0);
    expect(result.total).toBe(0);
  });

  it("counts a reconfirmation-pending shift as Pending, not Filled", async () => {
    const startsAt = new Date("2026-06-01T09:00:00Z");
    const endsAt = new Date("2026-06-01T13:00:00Z");
    prisma.shift.findMany.mockResolvedValue([
      {
        id: "a",
        status: "OPEN",
        requiredSpots: 1,
        startsAt,
        endsAt,
        // The only assignment is awaiting reconfirmation: CONFIRMED count is 0.
        assignments: [
          { status: "PENDING_RECONFIRMATION", user: { hourlyRate: 20 } },
        ],
        _count: { subscriptions: 0, assignments: 0 },
      },
    ]);

    const result = await readModel.kpis({
      businessId: BUSINESS_ID,
      from: startsAt,
      to: endsAt,
    });

    expect(result.pending).toBe(1);
    expect(result.filled).toBe(0);
    expect(result.approvedSpots).toBe(0);
    expect(result.scheduledHours).toBe(0);
    expect(result.labourCost).toBe(0);
  });
});

describe("ShiftReadModel.listForCalendar", () => {
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

    const result = await readModel.listForCalendar({
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

  it("surfaces a shift with only a PENDING_RECONFIRMATION assignment as Pending", async () => {
    prisma.shift.findMany.mockResolvedValue([
      {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T18:00:00Z"),
        status: "OPEN",
        requiredSpots: 1,
        assignments: [{ status: "PENDING_RECONFIRMATION" }],
        _count: { subscriptions: 0, assignments: 0 },
      },
    ]);

    const result = await readModel.listForCalendar({
      businessId: BUSINESS_ID,
      from: new Date("2026-06-01T00:00:00Z"),
      to: new Date("2026-06-30T00:00:00Z"),
    });

    expect(result[0]?.displayStatus).toBe("Pending");
  });
});

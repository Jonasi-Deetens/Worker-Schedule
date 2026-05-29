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

describe("ShiftService.update (reschedule reconfirmation)", () => {
  const existing = {
    id: "shift-1",
    startsAt: new Date("2026-06-01T10:00:00Z"),
    endsAt: new Date("2026-06-01T14:00:00Z"),
    roleLabel: "Bartender",
  };

  function primeUpdate(updated: Record<string, unknown>) {
    prisma.shift.findFirst.mockResolvedValue(existing);
    prisma.shift.update.mockResolvedValue({ ...existing, ...updated });
    prisma.auditEvent.create.mockResolvedValue({ id: "audit-x" });
    prisma.notification.create.mockResolvedValue({ id: "n1" });
    prisma.shiftAssignment.update.mockResolvedValue({ id: "a1" });
  }

  it("drops CONFIRMED assignments to PENDING_RECONFIRMATION when startsAt changes", async () => {
    primeUpdate({ startsAt: new Date("2026-06-01T12:00:00Z") });
    prisma.shiftAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "w1", status: "CONFIRMED" },
      { id: "a2", userId: "w2", status: "CONFIRMED" },
    ]);

    await service.update({
      id: "shift-1",
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      startsAt: new Date("2026-06-01T12:00:00Z"),
    });

    expect(prisma.shiftAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shiftId: "shift-1", status: "CONFIRMED" },
      }),
    );
    expect(prisma.shiftAssignment.update).toHaveBeenCalledTimes(2);
    expect(prisma.shiftAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "PENDING_RECONFIRMATION" },
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "SHIFT_RESCHEDULED" }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SHIFT_RESCHEDULE_PENDING" }),
      }),
    );
  });

  it("triggers reconfirmation when the roleLabel changes", async () => {
    primeUpdate({ roleLabel: "Host" });
    prisma.shiftAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "w1", status: "CONFIRMED" },
    ]);

    await service.update({
      id: "shift-1",
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      roleLabel: "Host",
    });

    expect(prisma.shiftAssignment.update).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it("does NOT disturb assignments when only notes/requiredSpots change", async () => {
    primeUpdate({ notes: "new note", requiredSpots: 3 });

    await service.update({
      id: "shift-1",
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      notes: "new note",
      requiredSpots: 3,
    });

    expect(prisma.shiftAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("does NOT trigger when the passed times are identical to the stored ones", async () => {
    primeUpdate({});

    await service.update({
      id: "shift-1",
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: new Date("2026-06-01T14:00:00Z"),
      roleLabel: "Bartender",
    });

    expect(prisma.shiftAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe("ShiftService.delete Dimona cancel", () => {
  it("attempts a Dimona cancel for confirmed auto-declare workers", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "shift-1",
      roleLabel: "Bar",
      subscriptions: [],
    });
    prisma.shift.update.mockResolvedValue({ id: "shift-1", status: "CANCELLED" });
    prisma.shiftAssignment.findMany.mockResolvedValue([
      { userId: "w1", status: "CONFIRMED", user: { contractType: "FLEXI" } },
    ]);
    // DimonaService.cancel looks up a confirmed declaration; none exists here.
    prisma.dimonaDeclaration.findFirst.mockResolvedValue(null);

    await service.delete({ id: "shift-1", businessId: BUSINESS_ID, ownerId: OWNER_ID });

    expect(prisma.dimonaDeclaration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shiftId: "shift-1",
          workerId: "w1",
          status: "CONFIRMED",
        }),
      }),
    );
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

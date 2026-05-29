import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionService } from "@/application/services/subscription-service";
import type { EmailService } from "@/application/services/email-service";
import { subscribe, type BusinessEvent } from "@/infrastructure/events/bus";
import {
  asPrisma,
  createPrismaMock,
  type PrismaMock,
} from "../../helpers/mock-prisma";

const BUSINESS_ID = "biz-1";
const OWNER_USER_ID = "owner-1";
const WORKER_ID = "worker-1";

let prisma: PrismaMock;
let service: SubscriptionService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new SubscriptionService(asPrisma(prisma));
});

describe("SubscriptionService.apply", () => {
  it("rejects when the shift does not belong to the business", async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    await expect(
      service.apply({
        shiftId: "shift-x",
        userId: WORKER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects when the shift is cancelled", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "shift-1",
      status: "CANCELLED",
    });
    await expect(
      service.apply({
        shiftId: "shift-1",
        userId: WORKER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/cancelled/i);
  });

  it("rejects when the worker already has a non-rejected subscription", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "shift-1",
      status: "OPEN",
    });
    prisma.shiftSubscription.findUnique.mockResolvedValue({
      id: "sub-1",
      status: "PENDING",
    });
    await expect(
      service.apply({
        shiftId: "shift-1",
        userId: WORKER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/already applied/i);
  });

  it("creates a PENDING subscription and notifies the owner", async () => {
    prisma.shift.findFirst.mockResolvedValue({
      id: "shift-1",
      status: "OPEN",
    });
    prisma.shiftSubscription.findUnique.mockResolvedValue(null);
    prisma.shiftSubscription.create.mockResolvedValue({
      id: "sub-1",
      status: "PENDING",
    });
    prisma.business.findUnique.mockResolvedValue({ ownerId: OWNER_USER_ID });

    const result = await service.apply({
      shiftId: "shift-1",
      userId: WORKER_ID,
      businessId: BUSINESS_ID,
    });

    expect(result).toEqual({ id: "sub-1", status: "PENDING" });
    expect(prisma.shiftSubscription.create).toHaveBeenCalledWith({
      data: {
        shiftId: "shift-1",
        userId: WORKER_ID,
        status: "PENDING",
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: OWNER_USER_ID,
          type: "NEW_SUBSCRIPTION",
        }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SUBSCRIPTION_APPLIED" }),
      }),
    );
  });

  it("reactivates a previously REJECTED subscription instead of erroring", async () => {
    prisma.shift.findFirst.mockResolvedValue({ id: "shift-1", status: "OPEN" });
    prisma.shiftSubscription.findUnique.mockResolvedValue({
      id: "sub-old",
      status: "REJECTED",
    });
    prisma.shiftSubscription.update.mockResolvedValue({
      id: "sub-old",
      status: "PENDING",
    });
    prisma.business.findUnique.mockResolvedValue({ ownerId: OWNER_USER_ID });

    const result = await service.apply({
      shiftId: "shift-1",
      userId: WORKER_ID,
      businessId: BUSINESS_ID,
    });

    expect(result.status).toBe("PENDING");
    expect(prisma.shiftSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-old" },
      data: { status: "PENDING" },
    });
  });
});

describe("SubscriptionService.withdraw", () => {
  it("rejects when the subscription is not found for the worker", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue(null);
    await expect(
      service.withdraw({ subscriptionId: "sub-1", userId: WORKER_ID }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects when the subscription is not PENDING", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      status: "APPROVED",
      shift: { business: { ownerId: OWNER_USER_ID } },
    });
    await expect(
      service.withdraw({ subscriptionId: "sub-1", userId: WORKER_ID }),
    ).rejects.toThrow(/pending/i);
  });

  it("transitions PENDING → WITHDRAWN and notifies the owner", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      status: "PENDING",
      shift: { business: { ownerId: OWNER_USER_ID } },
    });
    prisma.shiftSubscription.update.mockResolvedValue({
      id: "sub-1",
      status: "WITHDRAWN",
    });

    const result = await service.withdraw({
      subscriptionId: "sub-1",
      userId: WORKER_ID,
    });

    expect(result.status).toBe("WITHDRAWN");
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: OWNER_USER_ID,
          type: "APPLICATION_WITHDRAWN",
        }),
      }),
    );
  });
});

describe("SubscriptionService.approve", () => {
  it("rejects when capacity is exhausted", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
        requiredSpots: 1,
        roleLabel: "Barista",
      },
    });
    prisma.shiftAssignment.count.mockResolvedValue(1);

    await expect(
      service.approve({
        subscriptionId: "sub-1",
        ownerId: OWNER_USER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/capacity/i);
    expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects when worker has an overlapping approved assignment", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
        requiredSpots: 2,
        roleLabel: "Barista",
      },
    });
    prisma.shiftAssignment.count.mockResolvedValue(0);
    prisma.shiftAssignment.findMany.mockResolvedValue([
      {
        shift: {
          startsAt: new Date("2026-06-01T12:00:00Z"),
          endsAt: new Date("2026-06-01T18:00:00Z"),
        },
      },
    ]);

    await expect(
      service.approve({
        subscriptionId: "sub-1",
        ownerId: OWNER_USER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/overlap/i);
  });

  it("creates the assignment, updates status, notifies the worker, and writes audit", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
        requiredSpots: 2,
        roleLabel: "Barista",
      },
    });
    prisma.shiftAssignment.count.mockResolvedValue(0);
    prisma.shiftAssignment.findMany.mockResolvedValue([]);
    prisma.shiftAssignment.create.mockResolvedValue({ id: "assign-1" });

    const result = await service.approve({
      subscriptionId: "sub-1",
      ownerId: OWNER_USER_ID,
      businessId: BUSINESS_ID,
    });

    expect(result).toEqual({ id: "assign-1" });
    expect(prisma.shiftSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "APPROVED" },
    });
    expect(prisma.shiftAssignment.create).toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: WORKER_ID,
          type: "APPLICATION_APPROVED",
        }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SUBSCRIPTION_APPROVED" }),
      }),
    );
  });

  it("counts only CONFIRMED assignments against capacity", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
        requiredSpots: 2,
        roleLabel: "Barista",
      },
    });
    prisma.shiftAssignment.count.mockResolvedValue(0);
    prisma.shiftAssignment.findMany.mockResolvedValue([]);
    prisma.shiftAssignment.create.mockResolvedValue({ id: "assign-1" });

    await service.approve({
      subscriptionId: "sub-1",
      ownerId: OWNER_USER_ID,
      businessId: BUSINESS_ID,
    });

    expect(prisma.shiftAssignment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shiftId: "shift-1", status: "CONFIRMED" },
      }),
    );
  });

  it("marks shift FILLED when last spot is approved", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
        requiredSpots: 1,
        roleLabel: "Barista",
      },
    });
    prisma.shiftAssignment.count.mockResolvedValue(0);
    prisma.shiftAssignment.findMany.mockResolvedValue([]);
    prisma.shiftAssignment.create.mockResolvedValue({ id: "assign-1" });

    await service.approve({
      subscriptionId: "sub-1",
      ownerId: OWNER_USER_ID,
      businessId: BUSINESS_ID,
    });

    expect(prisma.shift.update).toHaveBeenCalledWith({
      where: { id: "shift-1" },
      data: { status: "FILLED" },
    });
  });
});

describe("SubscriptionService.reject", () => {
  it("rejects when subscription is not pending", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      status: "APPROVED",
      shift: { id: "shift-1", roleLabel: "Barista" },
    });
    await expect(
      service.reject({
        subscriptionId: "sub-1",
        ownerId: OWNER_USER_ID,
        businessId: BUSINESS_ID,
      }),
    ).rejects.toThrow(/pending/i);
  });

  it("marks subscription REJECTED and notifies the worker", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: { id: "shift-1", roleLabel: "Barista" },
    });
    prisma.shiftSubscription.update.mockResolvedValue({
      id: "sub-1",
      status: "REJECTED",
    });

    const result = await service.reject({
      subscriptionId: "sub-1",
      ownerId: OWNER_USER_ID,
      businessId: BUSINESS_ID,
    });

    expect(result.status).toBe("REJECTED");
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: WORKER_ID,
          type: "APPLICATION_REJECTED",
        }),
      }),
    );
  });
});

describe("SubscriptionService events + email", () => {
  it("publishes subscription.changed and emails the worker on approve", async () => {
    const events: BusinessEvent[] = [];
    const unsub = subscribe(BUSINESS_ID, (e) => events.push(e));
    const emails = { sendApplicationDecision: vi.fn() };
    const svc = new SubscriptionService(
      asPrisma(prisma),
      emails as unknown as EmailService,
    );

    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: {
        id: "shift-1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
        requiredSpots: 2,
        roleLabel: "Barista",
      },
      user: { email: "w@example.com", name: "Wendy", notificationPrefs: null },
    });
    prisma.shiftAssignment.count.mockResolvedValue(0);
    prisma.shiftAssignment.findMany.mockResolvedValue([]);
    prisma.shiftAssignment.create.mockResolvedValue({ id: "assign-1" });
    prisma.business.findUnique.mockResolvedValue({ name: "Café Central" });

    await svc.approve({
      subscriptionId: "sub-1",
      ownerId: OWNER_USER_ID,
      businessId: BUSINESS_ID,
    });
    unsub();

    expect(events.some((e) => e.type === "subscription.changed")).toBe(true);
    expect(events.some((e) => e.type === "assignment.changed")).toBe(true);
    expect(emails.sendApplicationDecision).toHaveBeenCalledWith(
      expect.objectContaining({ email: "w@example.com" }),
      expect.objectContaining({ approved: true, shiftLabel: "Barista" }),
    );
  });
});

describe("SubscriptionService.listMine", () => {
  it("returns this worker's subscriptions with the joined shift", async () => {
    prisma.shiftSubscription.findMany.mockResolvedValue([
      { id: "sub-1", status: "PENDING", shift: { id: "shift-1" } },
    ]);
    const result = await service.listMine(WORKER_ID);
    expect(result).toHaveLength(1);
    expect(prisma.shiftSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: WORKER_ID },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("SubscriptionService.rejectMany", () => {
  it("processes each id and reports per-id results", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub-1",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: { id: "shift-1", roleLabel: "Barista" },
    });
    prisma.shiftSubscription.update.mockResolvedValue({
      id: "sub-1",
      status: "REJECTED",
    });

    const result = await service.rejectMany({
      subscriptionIds: ["sub-1", "sub-2"],
      ownerId: OWNER_USER_ID,
      businessId: BUSINESS_ID,
    });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.success)).toBe(true);
  });

  it("captures individual failures without aborting the batch", async () => {
    prisma.shiftSubscription.findFirst.mockResolvedValueOnce(null);
    prisma.shiftSubscription.findFirst.mockResolvedValueOnce({
      id: "sub-2",
      shiftId: "shift-1",
      userId: WORKER_ID,
      status: "PENDING",
      shift: { id: "shift-1", roleLabel: "Barista" },
    });
    prisma.shiftSubscription.update.mockResolvedValue({
      id: "sub-2",
      status: "REJECTED",
    });

    const result = await service.rejectMany({
      subscriptionIds: ["sub-1", "sub-2"],
      ownerId: OWNER_USER_ID,
      businessId: BUSINESS_ID,
    });

    expect(result).toEqual([
      { id: "sub-1", success: false, error: expect.stringMatching(/not found/i) },
      { id: "sub-2", success: true },
    ]);
  });
});

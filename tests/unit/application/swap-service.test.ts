import { describe, expect, it, vi } from "vitest";
import { SwapService } from "@/application/services/swap-service";
import {
  cancelIfAuto,
  declareInIfAuto,
} from "@/application/services/dimona-hooks";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

vi.mock("@/application/services/dimona-hooks", () => ({
  cancelIfAuto: vi.fn().mockResolvedValue(undefined),
  declareInIfAuto: vi.fn().mockResolvedValue(undefined),
}));

describe("SwapService", () => {
  it("rejects an offer to yourself", async () => {
    const db = createPrismaMock();
    const svc = new SwapService(asPrisma(db));
    await expect(
      svc.offer({
        subscriptionId: "sub1",
        fromUserId: "u1",
        toUserId: "u1",
      }),
    ).rejects.toThrow(/yourself/i);
  });

  it("rejects an offer when the target has a conflict", async () => {
    const db = createPrismaMock();
    db.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub1",
      userId: "u1",
      status: "APPROVED",
      shift: {
        id: "s1",
        businessId: "b1",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
        roleLabel: "Bartender",
      },
    });
    db.user.findFirst.mockResolvedValue({ id: "u2", businessId: "b1", status: "ACTIVE" });
    db.shiftAssignment.findFirst.mockResolvedValue({ id: "conflict" });
    const svc = new SwapService(asPrisma(db));
    await expect(
      svc.offer({ subscriptionId: "sub1", fromUserId: "u1", toUserId: "u2" }),
    ).rejects.toThrow(/overlapping/i);
  });
});

describe("SwapService.findCandidates", () => {
  it("throws when the subscription is not owned by the caller", async () => {
    const db = createPrismaMock();
    db.shiftSubscription.findFirst.mockResolvedValue(null);
    const svc = new SwapService(asPrisma(db));
    await expect(
      svc.findCandidates({
        subscriptionId: "sub1",
        requestingUserId: "u1",
        businessId: "b1",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("excludes overlapping assignments and approved time-off", async () => {
    const db = createPrismaMock();
    db.shiftSubscription.findFirst.mockResolvedValue({
      id: "sub1",
      userId: "u1",
      status: "APPROVED",
      shift: {
        id: "s1",
        businessId: "b1",
        requiredSkillId: null,
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T14:00:00Z"),
      },
    });
    db.user.findMany.mockResolvedValue([
      { id: "u2", name: "Bea" },
      { id: "u3", name: "Cy" },
      { id: "u4", name: "Dee" },
    ]);
    db.shiftAssignment.findMany.mockResolvedValue([{ userId: "u3" }]);
    db.timeOffRequest.findMany.mockResolvedValue([{ userId: "u4" }]);

    const svc = new SwapService(asPrisma(db));
    const result = await svc.findCandidates({
      subscriptionId: "sub1",
      requestingUserId: "u1",
      businessId: "b1",
    });
    expect(result).toEqual([{ id: "u2", name: "Bea" }]);
  });
});

describe("SwapService.decide (accept)", () => {
  it("enforces scheduling rules on the worker taking over the shift", async () => {
    const db = createPrismaMock();
    db.shiftSwap.findFirst.mockResolvedValue({
      id: "swap1",
      toUserId: "u2",
      status: "PENDING",
      fromSubscriptionId: "sub1",
      fromSubscription: {
        userId: "u1",
        shift: {
          id: "s1",
          businessId: "b1",
          startsAt: new Date("2026-06-01T10:00:00Z"),
          endsAt: new Date("2026-06-01T14:00:00Z"),
          roleLabel: "Bartender",
        },
      },
    });
    // No direct overlapping assignment...
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);
    db.user.findUnique.mockResolvedValue(null);
    // ...but the worker has approved time-off in the slot (centralized guard).
    db.timeOffRequest.findFirst.mockResolvedValue({ id: "to1" });

    const svc = new SwapService(asPrisma(db));
    await expect(
      svc.decide({ id: "swap1", decidingUserId: "u2", accept: true }),
    ).rejects.toThrow(/time-off/i);
    expect(db.shiftAssignment.create).not.toHaveBeenCalled();
  });

  it("cancels Dimona for outgoing worker and declares IN for incoming on accept", async () => {
    const db = createPrismaMock();
    db.shiftSwap.findFirst.mockResolvedValue({
      id: "swap1",
      toUserId: "u2",
      status: "PENDING",
      fromSubscriptionId: "sub1",
      fromSubscription: {
        userId: "u1",
        shift: {
          id: "s1",
          businessId: "b1",
          startsAt: new Date("2026-06-01T10:00:00Z"),
          endsAt: new Date("2026-06-01T14:00:00Z"),
          roleLabel: "Bartender",
        },
      },
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);
    db.user.findUnique.mockResolvedValue(null);
    db.timeOffRequest.findFirst.mockResolvedValue(null);
    db.$transaction.mockResolvedValue(undefined);
    db.notification.create.mockResolvedValue({ id: "n1" });
    db.auditEvent.create.mockResolvedValue({ id: "a1" });
    db.shiftSwap.findUnique.mockResolvedValue({ id: "swap1", status: "ACCEPTED" });

    const svc = new SwapService(asPrisma(db));
    await svc.decide({ id: "swap1", decidingUserId: "u2", accept: true });

    expect(cancelIfAuto).toHaveBeenCalledWith(expect.anything(), "s1", "u1");
    expect(declareInIfAuto).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      "u2",
    );
  });
});

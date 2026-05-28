import { describe, expect, it } from "vitest";
import { SwapService } from "@/application/services/swap-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

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

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

import { describe, expect, it, vi } from "vitest";
import { membershipRouter } from "@/interface/trpc/routers/membership";
import {
  membershipService,
  requireActiveMembership,
} from "@/interface/trpc/services";

const session = {
  user: {
    id: "user-1",
    email: "u@e.com",
    name: "User",
    role: "MANAGER" as const,
    businessId: "biz-1",
  },
  expires: "2099-01-01T00:00:00.000Z",
};

describe("requireActiveMembership", () => {
  it("returns the businessId when an active membership exists", async () => {
    const spy = vi
      .spyOn(membershipService, "assertActive")
      .mockResolvedValueOnce({
        id: "m1",
        userId: "user-1",
        businessId: "biz-1",
        role: "MANAGER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    await expect(requireActiveMembership("user-1", "biz-1")).resolves.toBe(
      "biz-1",
    );
    spy.mockRestore();
  });

  it("throws FORBIDDEN when no active membership exists", async () => {
    const spy = vi
      .spyOn(membershipService, "assertActive")
      .mockRejectedValueOnce(new Error("no membership"));
    await expect(
      requireActiveMembership("user-1", "biz-1"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    spy.mockRestore();
  });

  it("throws FORBIDDEN when the session has no business", async () => {
    await expect(
      requireActiveMembership("user-1", null),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("membershipRouter.switch", () => {
  // membership.switch validates the input as a cuid, so use cuid-shaped ids.
  const targetBusinessId = "ckltargetbusiness00000000";

  it("rejects switching into a business without an active membership", async () => {
    const spy = vi
      .spyOn(membershipService, "assertActive")
      .mockRejectedValueOnce(new Error("no membership"));
    const caller = membershipRouter.createCaller({ session, ip: null });
    await expect(
      caller.switch({ businessId: targetBusinessId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    spy.mockRestore();
  });

  it("returns the membership-derived role on a valid switch", async () => {
    const spy = vi
      .spyOn(membershipService, "assertActive")
      .mockResolvedValueOnce({
        id: "m2",
        userId: "user-1",
        businessId: targetBusinessId,
        role: "OWNER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    const caller = membershipRouter.createCaller({ session, ip: null });
    await expect(
      caller.switch({ businessId: targetBusinessId }),
    ).resolves.toEqual({
      businessId: targetBusinessId,
      role: "OWNER",
    });
    spy.mockRestore();
  });
});

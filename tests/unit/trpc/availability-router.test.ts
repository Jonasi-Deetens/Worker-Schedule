import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { availabilityRouter } from "@/interface/trpc/routers/availability";
import { timeOffService } from "@/interface/trpc/services";

/**
 * The `set` procedure must short-circuit to a CONFLICT TRPCError when the
 * worker already has approved time-off covering the requested range. We mock
 * the service-level helper so prisma never gets touched.
 */
describe("availabilityRouter.set", () => {
  it("rejects with CONFLICT when approved time-off overlaps", async () => {
    const spy = vi
      .spyOn(timeOffService, "hasConflict")
      .mockResolvedValueOnce(true);

    const caller = availabilityRouter.createCaller({
      session: {
        user: {
          id: "worker-1",
          email: "w@e.com",
          name: "Worker",
          role: "WORKER",
          businessId: "biz-1",
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
    });

    await expect(
      caller.set({
        startsAt: new Date("2026-06-10T09:00:00Z"),
        endsAt: new Date("2026-06-10T17:00:00Z"),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.availabilityInTimeOff",
    });
    expect(spy).toHaveBeenCalledOnce();

    spy.mockRestore();
  });

  it("ensures the thrown error is a TRPCError instance", async () => {
    const spy = vi
      .spyOn(timeOffService, "hasConflict")
      .mockResolvedValueOnce(true);

    const caller = availabilityRouter.createCaller({
      session: {
        user: {
          id: "worker-1",
          email: "w@e.com",
          name: "Worker",
          role: "WORKER",
          businessId: "biz-1",
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
    });

    await expect(
      caller.set({
        startsAt: new Date("2026-06-10T09:00:00Z"),
        endsAt: new Date("2026-06-10T17:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    spy.mockRestore();
  });
});

import { describe, expect, it } from "vitest";
import {
  managerProcedure,
  router,
  workerOrManagerProcedure,
  workerProcedure,
} from "@/interface/trpc/init";
import type { UserRole } from "@/domain/types";

/**
 * Drives the real init.ts procedures so we test the actual guards used by the
 * time-off and availability routers, not a rebuilt copy.
 */
const testRouter = router({
  selfService: workerOrManagerProcedure.query(({ ctx }) => ctx.session.user.role),
  approver: managerProcedure.query(({ ctx }) => ctx.session.user.role),
  workerOnly: workerProcedure.query(({ ctx }) => ctx.session.user.role),
});

function callerFor(role: UserRole) {
  return testRouter.createCaller({
    session: {
      user: { id: "u1", email: "e@e.com", name: "N", role, businessId: "b1" },
      expires: "2099-01-01T00:00:00.000Z",
    },
    ip: null,
  });
}

describe("workerOrManagerProcedure (self-service)", () => {
  it("permits MANAGER", async () => {
    await expect(callerFor("MANAGER").selfService()).resolves.toBe("MANAGER");
  });

  it("permits WORKER", async () => {
    await expect(callerFor("WORKER").selfService()).resolves.toBe("WORKER");
  });

  it("forbids OWNER (matches the existing worker-only self-service flows)", async () => {
    await expect(callerFor("OWNER").selfService()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("managerProcedure (approver actions)", () => {
  it("still permits MANAGER", async () => {
    await expect(callerFor("MANAGER").approver()).resolves.toBe("MANAGER");
  });

  it("permits OWNER", async () => {
    await expect(callerFor("OWNER").approver()).resolves.toBe("OWNER");
  });

  it("forbids WORKER", async () => {
    await expect(callerFor("WORKER").approver()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("workerProcedure (availability templates)", () => {
  it("permits WORKER", async () => {
    await expect(callerFor("WORKER").workerOnly()).resolves.toBe("WORKER");
  });

  it("forbids MANAGER", async () => {
    await expect(callerFor("MANAGER").workerOnly()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("forbids OWNER", async () => {
    await expect(callerFor("OWNER").workerOnly()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

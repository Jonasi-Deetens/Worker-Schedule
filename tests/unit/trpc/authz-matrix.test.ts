import { describe, expect, it } from "vitest";
import type { UserRole } from "@/domain/types";
import {
  managerProcedure,
  ownerProcedure,
  protectedProcedure,
  router,
  workerOrManagerProcedure,
  workerProcedure,
} from "@/interface/trpc/init";

/**
 * Authorization matrix over the *real* procedure guards exported from
 * `init.ts`. This is the single source of truth every app router composes from:
 *
 *   tier               | OWNER | MANAGER | WORKER
 *   -------------------|-------|---------|-------
 *   protectedProcedure |  ✓    |   ✓     |  ✓
 *   ownerProcedure     |  ✓    |   ✗     |  ✗
 *   managerProcedure   |  ✓    |   ✓     |  ✗
 *   workerProcedure    |  ✗    |   ✗     |  ✓
 *   workerOrManager    |  ✗    |   ✓     |  ✓
 *
 * Router → tier mapping this asserts (the high-traffic mutating procedures):
 *   - shift.create/assign/publish/broadcast/update/rescheduleConflicts → manager
 *   - shift.createRecurring/kpis/delete → owner
 *   - invite.create/revoke, document.listExpiring, location.*, audit.* → manager
 *   - time-off self requests → workerOrManager; decisions → manager
 */

const testRouter = router({
  authed: protectedProcedure.query(({ ctx }) => ctx.session.user.role),
  owner: ownerProcedure.query(({ ctx }) => ctx.session.user.role),
  manager: managerProcedure.query(({ ctx }) => ctx.session.user.role),
  worker: workerProcedure.query(({ ctx }) => ctx.session.user.role),
  workerOrManager: workerOrManagerProcedure.query(
    ({ ctx }) => ctx.session.user.role,
  ),
});

function callerFor(role: UserRole | null) {
  const ctx =
    role === null
      ? { session: null }
      : {
          session: {
            user: {
              id: "u1",
              email: "a@b.io",
              name: "N",
              role,
              businessId: "b1",
            },
          },
        };
  return testRouter.createCaller(ctx as never);
}

const FORBIDDEN = { code: "FORBIDDEN" };
const UNAUTHORIZED = { code: "UNAUTHORIZED" };

describe("authz matrix — managerProcedure", () => {
  it("allows OWNER and MANAGER, forbids WORKER", async () => {
    await expect(callerFor("OWNER").manager()).resolves.toBe("OWNER");
    await expect(callerFor("MANAGER").manager()).resolves.toBe("MANAGER");
    await expect(callerFor("WORKER").manager()).rejects.toMatchObject(FORBIDDEN);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(callerFor(null).manager()).rejects.toMatchObject(UNAUTHORIZED);
  });
});

describe("authz matrix — ownerProcedure", () => {
  it("allows only OWNER", async () => {
    await expect(callerFor("OWNER").owner()).resolves.toBe("OWNER");
    await expect(callerFor("MANAGER").owner()).rejects.toMatchObject(FORBIDDEN);
    await expect(callerFor("WORKER").owner()).rejects.toMatchObject(FORBIDDEN);
  });
});

describe("authz matrix — workerProcedure", () => {
  it("allows only WORKER", async () => {
    await expect(callerFor("WORKER").worker()).resolves.toBe("WORKER");
    await expect(callerFor("OWNER").worker()).rejects.toMatchObject(FORBIDDEN);
    await expect(callerFor("MANAGER").worker()).rejects.toMatchObject(FORBIDDEN);
  });
});

describe("authz matrix — workerOrManagerProcedure", () => {
  it("allows WORKER and MANAGER, forbids OWNER", async () => {
    await expect(callerFor("WORKER").workerOrManager()).resolves.toBe("WORKER");
    await expect(callerFor("MANAGER").workerOrManager()).resolves.toBe(
      "MANAGER",
    );
    await expect(callerFor("OWNER").workerOrManager()).rejects.toMatchObject(
      FORBIDDEN,
    );
  });
});

describe("authz matrix — protectedProcedure", () => {
  it("allows any authenticated role and rejects guests", async () => {
    for (const role of ["OWNER", "MANAGER", "WORKER"] as const) {
      await expect(callerFor(role).authed()).resolves.toBe(role);
    }
    await expect(callerFor(null).authed()).rejects.toMatchObject(UNAUTHORIZED);
  });
});

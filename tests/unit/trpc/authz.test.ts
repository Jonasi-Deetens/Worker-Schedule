import { describe, expect, it } from "vitest";
import { TRPCError, initTRPC } from "@trpc/server";
import type { UserRole } from "@/domain/types";

/**
 * We rebuild the same isAuthed + role-guard middlewares here so we can drive
 * them through a real (test-only) router via `createCallerFactory`. This
 * exercises tRPC's public middleware contract without standing up the full
 * application router.
 */

interface TestSession {
  user: { id: string; role: UserRole; businessId: string | null };
}

const t = initTRPC.context<{ session: TestSession | null }>().create();

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session } });
});

const roleGuard = (roles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (!roles.includes(ctx.session.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx: { session: ctx.session } });
  });

const protectedProcedure = t.procedure.use(isAuthed);
const ownerProcedure = protectedProcedure.use(roleGuard(["OWNER"]));
const workerProcedure = protectedProcedure.use(roleGuard(["WORKER"]));

const testRouter = t.router({
  any: protectedProcedure.query(({ ctx }) => ctx.session.user),
  owner: ownerProcedure.query(({ ctx }) => ctx.session.user),
  worker: workerProcedure.query(({ ctx }) => ctx.session.user),
});

const createCaller = t.createCallerFactory(testRouter);

function makeSession(role: UserRole): TestSession {
  return { user: { id: "user-1", role, businessId: "biz-1" } };
}

describe("protectedProcedure", () => {
  it("throws UNAUTHORIZED when session is null", async () => {
    const caller = createCaller({ session: null });
    await expect(caller.any()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("permits authenticated session of any role", async () => {
    const caller = createCaller({ session: makeSession("WORKER") });
    await expect(caller.any()).resolves.toMatchObject({ id: "user-1" });
  });
});

describe("ownerProcedure", () => {
  it("throws UNAUTHORIZED for guest", async () => {
    const caller = createCaller({ session: null });
    await expect(caller.owner()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws FORBIDDEN for worker session", async () => {
    const caller = createCaller({ session: makeSession("WORKER") });
    await expect(caller.owner()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permits owner session", async () => {
    const caller = createCaller({ session: makeSession("OWNER") });
    await expect(caller.owner()).resolves.toMatchObject({ role: "OWNER" });
  });
});

describe("workerProcedure", () => {
  it("throws FORBIDDEN for owner session", async () => {
    const caller = createCaller({ session: makeSession("OWNER") });
    await expect(caller.worker()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permits worker session", async () => {
    const caller = createCaller({ session: makeSession("WORKER") });
    await expect(caller.worker()).resolves.toMatchObject({ role: "WORKER" });
  });
});

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Session } from "next-auth";
import type { UserRole } from "@/domain/types";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  businessId: string | null;
}

export interface AppSession extends Session {
  user: SessionUser;
}

export interface TRPCContext {
  session: AppSession | null;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { session: ctx.session },
  });
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

export const protectedProcedure = t.procedure.use(isAuthed);
export const ownerProcedure = protectedProcedure.use(roleGuard(["OWNER"]));
export const workerProcedure = protectedProcedure.use(roleGuard(["WORKER"]));
/**
 * Managers can perform scheduling actions (publish, assign, approve) but
 * cannot change business-level settings such as integrations or billing.
 */
export const managerProcedure = protectedProcedure.use(
  roleGuard(["OWNER", "MANAGER"]),
);

export function mapServiceError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : "Unexpected error occurred";

  if (message.includes("not found")) {
    throw new TRPCError({ code: "NOT_FOUND", message });
  }
  if (
    message.includes("capacity") ||
    message.includes("overlap") ||
    message.includes("Already applied")
  ) {
    throw new TRPCError({ code: "CONFLICT", message });
  }
  if (
    message.includes("Can only") ||
    message.includes("Cannot apply") ||
    message.includes("must be")
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

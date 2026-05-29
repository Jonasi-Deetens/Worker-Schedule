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
  /** Best-effort client IP, used for rate limiting public procedures. */
  ip?: string | null;
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
 * Self-service procedures (own time-off, own availability) that both WORKER
 * and MANAGER may use — a manager still has a personal schedule to manage.
 * Owners are intentionally excluded, matching the existing worker-only flows.
 */
export const workerOrManagerProcedure = protectedProcedure.use(
  roleGuard(["WORKER", "MANAGER"]),
);
/**
 * Managers can perform scheduling actions (publish, assign, approve) but
 * cannot change business-level settings such as integrations or billing.
 */
export const managerProcedure = protectedProcedure.use(
  roleGuard(["OWNER", "MANAGER"]),
);

/**
 * Conflict-shaped keyed errors that should surface as HTTP 409 rather than the
 * default 400. Everything else keyed maps to BAD_REQUEST.
 */
const CONFLICT_ERROR_KEYS = new Set<string>([
  "errors.capacityFull",
  "errors.overlap",
  "errors.duplicateApplication",
  "errors.attendanceNoShowHasEntry",
]);

export function mapServiceError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : "Unexpected error occurred";

  // Stable, machine-readable keys (`errors.*`) are passed through untouched so
  // the client can localize them directly — no English-string regex needed.
  if (/^errors\.[A-Za-z0-9_]+$/.test(message)) {
    throw new TRPCError({
      code: CONFLICT_ERROR_KEYS.has(message) ? "CONFLICT" : "BAD_REQUEST",
      message,
    });
  }

  if (message.includes("not found")) {
    throw new TRPCError({ code: "NOT_FOUND", message });
  }
  if (
    message.includes("capacity") ||
    message.includes("overlap") ||
    message.includes("Already applied") ||
    message.includes("Already clocked in")
  ) {
    throw new TRPCError({ code: "CONFLICT", message });
  }
  if (
    message.includes("Can only") ||
    message.startsWith("Cannot ") ||
    message.includes("must be")
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

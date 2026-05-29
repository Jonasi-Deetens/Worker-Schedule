import { TRPCError } from "@trpc/server";
import { AUTH_RATE_LIMIT, rateLimit } from "@/infrastructure/rate-limit";
import { mapServiceError, publicProcedure, router } from "../init";
import {
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "../schemas";
import { authService, passwordResetService } from "../services";

function enforceAuthRateLimit(key: string) {
  const limit = rateLimit({
    key,
    limit: AUTH_RATE_LIMIT.limit,
    windowMs: AUTH_RATE_LIMIT.windowMs,
  });
  if (!limit.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "errors.rateLimit",
    });
  }
}

export const authRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      // Throttle self-serve registration by IP + email to blunt automated
      // account-creation abuse.
      enforceAuthRateLimit(
        `register:${ctx.ip ?? "unknown"}:${input.email.toLowerCase()}`,
      );
      return authService.register(input);
    }),

  requestPasswordReset: publicProcedure
    .input(requestPasswordResetSchema)
    .mutation(async ({ ctx, input }) => {
      // Rate-limit by IP + email so the endpoint can't be used to enumerate
      // accounts or spam reset emails. The service is enumeration-safe too.
      enforceAuthRateLimit(
        `pwreset:${ctx.ip ?? "unknown"}:${input.email.toLowerCase()}`,
      );
      return passwordResetService.requestReset(input.email);
    }),

  resetPassword: publicProcedure
    .input(resetPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      enforceAuthRateLimit(`pwresetconfirm:${ctx.ip ?? "unknown"}`);
      try {
        return await passwordResetService.resetPassword({
          token: input.token,
          newPassword: input.newPassword,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

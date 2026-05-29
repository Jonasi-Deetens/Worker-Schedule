import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../init";
import { membershipService } from "../services";

export const membershipRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return membershipService.listForUser(ctx.session.user.id);
  }),

  /**
   * Validates that the caller may switch into `businessId` (i.e. has an ACTIVE
   * membership there) and returns the membership-derived role. The actual JWT
   * mutation happens client-side via NextAuth's `session.update({ businessId })`
   * trigger, which the `jwt` callback in auth-options resolves the same way.
   * Returning the role here lets the client update optimistically.
   */
  switch: protectedProcedure
    .input(z.object({ businessId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await membershipService.assertActive(
          ctx.session.user.id,
          input.businessId,
        );
        return { businessId: membership.businessId, role: membership.role };
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No active membership in this business",
        });
      }
    }),
});

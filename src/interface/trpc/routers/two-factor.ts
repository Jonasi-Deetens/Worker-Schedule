import { z } from "zod";
import { protectedProcedure, router } from "../init";
import { totpAccountService } from "../services";

export const twoFactorRouter = router({
  setup: protectedProcedure.mutation(async ({ ctx }) => {
    return totpAccountService.setup(ctx.session.user.email);
  }),
  enable: protectedProcedure
    .input(z.object({ secret: z.string(), token: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      return totpAccountService.enable({
        userId: ctx.session.user.id,
        secret: input.secret,
        token: input.token,
      });
    }),
  disable: protectedProcedure.mutation(async ({ ctx }) => {
    return totpAccountService.disable(ctx.session.user.id);
  }),
});

import { z } from "zod";
import {
  mapServiceError,
  protectedProcedure,
  router,
} from "../init";
import { requireBusinessId, shiftMessageService } from "../services";

export const shiftMessageRouter = router({
  list: protectedProcedure
    .input(z.object({ shiftId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await shiftMessageService.list({
          shiftId: input.shiftId,
          userId: ctx.session.user.id,
          isOwnerOrManager:
            ctx.session.user.role === "OWNER" ||
            ctx.session.user.role === "MANAGER",
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  post: protectedProcedure
    .input(z.object({ shiftId: z.string(), body: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await shiftMessageService.post({
          shiftId: input.shiftId,
          authorId: ctx.session.user.id,
          body: input.body,
          isOwnerOrManager:
            ctx.session.user.role === "OWNER" ||
            ctx.session.user.role === "MANAGER",
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

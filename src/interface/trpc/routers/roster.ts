import {
  managerProcedure,
  mapServiceError,
  router,
} from "../init";
import {
  idSchema,
  rosterApplySchema,
  rosterTemplateInputSchema,
} from "../schemas";
import { requireBusinessId, rosterService } from "../services";

export const rosterRouter = router({
  list: managerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return rosterService.list(businessId);
  }),
  create: managerProcedure
    .input(rosterTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await rosterService.create({ businessId, ...input });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  delete: managerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        await rosterService.delete({ id: input.id, businessId });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),
  applyToWeek: managerProcedure
    .input(rosterApplySchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await rosterService.applyToWeek({
          businessId,
          ownerId: ctx.session.user.id,
          rosterId: input.rosterId,
          weekStart: input.weekStart,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

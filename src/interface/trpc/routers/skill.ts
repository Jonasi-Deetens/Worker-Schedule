import {
  managerProcedure,
  mapServiceError,
  protectedProcedure,
  router,
} from "../init";
import {
  idSchema,
  skillInputSchema,
  skillUpdateSchema,
} from "../schemas";
import { requireBusinessId, skillService } from "../services";

export const skillRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return skillService.list(businessId);
  }),
  create: managerProcedure
    .input(skillInputSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await skillService.create({ businessId, ...input });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  update: managerProcedure
    .input(skillUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await skillService.update({ businessId, ...input });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  delete: managerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        await skillService.delete({ id: input.id, businessId });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

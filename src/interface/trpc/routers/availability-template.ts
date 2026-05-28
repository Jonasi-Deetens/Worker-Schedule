import {
  mapServiceError,
  router,
  workerProcedure,
} from "../init";
import {
  availabilityTemplateSchema,
  dateRangeSchema,
  idSchema,
} from "../schemas";
import { availabilityService } from "../services";

export const availabilityTemplateRouter = router({
  list: workerProcedure.query(async ({ ctx }) => {
    return availabilityService.listTemplates(ctx.session.user.id);
  }),
  create: workerProcedure
    .input(availabilityTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await availabilityService.setTemplate({
          userId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  delete: workerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await availabilityService.deleteTemplate({
          id: input.id,
          userId: ctx.session.user.id,
        });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),
  materialise: workerProcedure
    .input(dateRangeSchema)
    .mutation(async ({ ctx, input }) => {
      const count = await availabilityService.materialiseTemplates(
        ctx.session.user.id,
        input.from,
        input.to,
      );
      return { count };
    }),
});

import {
  mapServiceError,
  ownerProcedure,
  router,
  workerProcedure,
} from "../init";
import {
  availabilitySchema,
  dateRangeSchema,
  idSchema,
} from "../schemas";
import { availabilityService, requireBusinessId } from "../services";

export const availabilityRouter = router({
  list: workerProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return availabilityService.list({
        userId: ctx.session.user.id,
        from: input.from,
        to: input.to,
      });
    }),

  listForBusiness: ownerProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return availabilityService.listForBusiness({
        businessId,
        from: input.from,
        to: input.to,
      });
    }),

  set: workerProcedure
    .input(availabilitySchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await availabilityService.set({
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
        await availabilityService.delete({
          id: input.id,
          userId: ctx.session.user.id,
        });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

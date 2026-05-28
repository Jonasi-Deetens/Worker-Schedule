import {
  mapServiceError,
  ownerProcedure,
  router,
  workerProcedure,
} from "../init";
import {
  shiftIdSchema,
  subscriptionIdSchema,
  subscriptionIdsSchema,
} from "../schemas";
import { requireBusinessId, subscriptionService } from "../services";

export const subscriptionRouter = router({
  submit: workerProcedure
    .input(shiftIdSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await subscriptionService.apply({
          shiftId: input.shiftId,
          userId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  withdraw: workerProcedure
    .input(subscriptionIdSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await subscriptionService.withdraw({
          subscriptionId: input.subscriptionId,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  listForShift: ownerProcedure
    .input(shiftIdSchema)
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await subscriptionService.listForShift(
          input.shiftId,
          businessId,
        );
      } catch (error) {
        mapServiceError(error);
      }
    }),

  listMine: workerProcedure.query(async ({ ctx }) => {
    return subscriptionService.listMine(ctx.session.user.id);
  }),

  approveMany: ownerProcedure
    .input(subscriptionIdsSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await subscriptionService.approveMany({
          subscriptionIds: input.subscriptionIds,
          ownerId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  rejectMany: ownerProcedure
    .input(subscriptionIdsSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await subscriptionService.rejectMany({
          subscriptionIds: input.subscriptionIds,
          ownerId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  approve: ownerProcedure
    .input(subscriptionIdSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await subscriptionService.approve({
          subscriptionId: input.subscriptionId,
          ownerId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  reject: ownerProcedure
    .input(subscriptionIdSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await subscriptionService.reject({
          subscriptionId: input.subscriptionId,
          ownerId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

import { z } from "zod";
import {
  managerProcedure,
  mapServiceError,
  protectedProcedure,
  router,
  workerProcedure,
} from "../init";
import {
  idSchema,
  timeOffDecisionSchema,
  timeOffRequestSchema,
} from "../schemas";
import { requireBusinessId, timeOffService } from "../services";

export const timeOffRouter = router({
  request: workerProcedure
    .input(timeOffRequestSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await timeOffService.request({
          userId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return timeOffService.listForUser(ctx.session.user.id);
  }),
  listForBusiness: managerProcedure
    .input(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return timeOffService.listForBusiness(businessId, input.status);
    }),
  decide: managerProcedure
    .input(timeOffDecisionSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await timeOffService.decide({
          id: input.id,
          ownerId: ctx.session.user.id,
          businessId,
          approve: input.approve,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  cancel: workerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await timeOffService.cancel({
          id: input.id,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

import { z } from "zod";
import {
  managerProcedure,
  mapServiceError,
  protectedProcedure,
  router,
  workerOrManagerProcedure,
} from "../init";
import {
  idSchema,
  timeOffDecisionSchema,
  timeOffRequestSchema,
  timeOffUpdateSchema,
} from "../schemas";
import { requireActiveMembership, timeOffService } from "../services";

export const timeOffRouter = router({
  request: workerOrManagerProcedure
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
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      return timeOffService.listForBusiness(businessId, input.status);
    }),
  decide: managerProcedure
    .input(timeOffDecisionSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
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
  cancel: workerOrManagerProcedure
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
  update: workerOrManagerProcedure
    .input(timeOffUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await timeOffService.update({
          id: input.id,
          userId: ctx.session.user.id,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          reason: input.reason,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  revoke: managerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await timeOffService.revoke({
          id: input.id,
          ownerId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

import { TRPCError } from "@trpc/server";
import {
  mapServiceError,
  ownerProcedure,
  router,
  workerOrManagerProcedure,
} from "../init";
import {
  availabilitySchema,
  dateRangeSchema,
  idSchema,
} from "../schemas";
import {
  availabilityService,
  requireActiveMembership,
  timeOffService,
} from "../services";

export const availabilityRouter = router({
  list: workerOrManagerProcedure
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
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      return availabilityService.listForBusiness({
        businessId,
        from: input.from,
        to: input.to,
      });
    }),

  set: workerOrManagerProcedure
    .input(availabilitySchema)
    .mutation(async ({ ctx, input }) => {
      const blocked = await timeOffService.hasConflict(
        ctx.session.user.id,
        input.startsAt,
        input.endsAt,
      );
      if (blocked) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "errors.availabilityInTimeOff",
        });
      }
      try {
        return await availabilityService.set({
          userId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  delete: workerOrManagerProcedure
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

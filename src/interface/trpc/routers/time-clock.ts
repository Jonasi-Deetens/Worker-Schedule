import {
  managerProcedure,
  mapServiceError,
  protectedProcedure,
  router,
} from "../init";
import {
  dateRangeSchema,
  idSchema,
  timeEntryApproveSchema,
  timeEntryClockInSchema,
  timeEntryClockInViaQrSchema,
  timeEntryClockOutSchema,
  timeEntryRejectSchema,
  timeEntryUpdateSchema,
} from "../schemas";
import { requireBusinessId, timeClockService } from "../services";

export const timeClockRouter = router({
  active: protectedProcedure.query(async ({ ctx }) => {
    return timeClockService.activeFor(ctx.session.user.id);
  }),
  clockIn: protectedProcedure
    .input(timeEntryClockInSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await timeClockService.clockIn({
          userId: ctx.session.user.id,
          shiftId: input.shiftId ?? null,
          lat: input.lat,
          lng: input.lng,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  clockInViaQr: protectedProcedure
    .input(timeEntryClockInViaQrSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await timeClockService.clockInViaQr({
          userId: ctx.session.user.id,
          token: input.token,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  clockOut: protectedProcedure
    .input(timeEntryClockOutSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await timeClockService.clockOut({
          id: input.id,
          userId: ctx.session.user.id,
          breakMinutes: input.breakMinutes ?? 0,
          notes: input.notes,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  listPending: managerProcedure
    .input(dateRangeSchema.partial().optional())
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return timeClockService.listPending(businessId, input?.from, input?.to);
    }),
  listApproved: managerProcedure
    .input(dateRangeSchema.partial().optional())
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return timeClockService.listApproved(businessId, input?.from, input?.to);
    }),
  approve: managerProcedure
    .input(timeEntryApproveSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await timeClockService.approveMany({
          ids: input.ids,
          businessId,
          approverId: ctx.session.user.id,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  reject: managerProcedure
    .input(timeEntryRejectSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await timeClockService.rejectMany({
          ids: input.ids,
          businessId,
          reviewerId: ctx.session.user.id,
          reason: input.reason,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  update: managerProcedure
    .input(timeEntryUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await timeClockService.updateEntry({
          id: input.id,
          businessId,
          reviewerId: ctx.session.user.id,
          reason: input.reason,
          clockInAt: input.clockInAt,
          clockOutAt: input.clockOutAt ?? undefined,
          breakMinutes: input.breakMinutes,
          notes: input.notes,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  corrections: managerProcedure
    .input(idSchema)
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await timeClockService.listCorrections({
          timeEntryId: input.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  listMine: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return timeClockService.listMine(
        ctx.session.user.id,
        input.from,
        input.to,
      );
    }),
});

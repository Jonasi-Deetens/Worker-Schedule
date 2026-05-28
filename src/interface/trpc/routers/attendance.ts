import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  managerProcedure,
  mapServiceError,
  protectedProcedure,
  router,
} from "../init";
import { attendanceService, requireBusinessId } from "../services";

export const attendanceRouter = router({
  mark: managerProcedure
    .input(
      z.object({
        assignmentId: z.string(),
        status: z.enum(["ON_TIME", "LATE", "NO_SHOW", "EXCUSED"]),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await attendanceService.mark({
          assignmentId: input.assignmentId,
          businessId,
          reviewerId: ctx.session.user.id,
          status: input.status,
          note: input.note,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  workerStats: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        from: z.date(),
        to: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (
        ctx.session.user.role === "WORKER" &&
        ctx.session.user.id !== input.userId
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return attendanceService.statsForWorker(input);
    }),
  businessSummary: managerProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return attendanceService.businessSummary({
        businessId,
        from: input.from,
        to: input.to,
      });
    }),
});

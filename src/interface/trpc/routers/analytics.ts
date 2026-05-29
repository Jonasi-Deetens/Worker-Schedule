import { z } from "zod";
import { managerProcedure, mapServiceError, router } from "../init";
import { analyticsService, requireBusinessId } from "../services";

export const analyticsRouter = router({
  weekly: managerProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(52).default(12) }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return analyticsService.weeklyTrend({ businessId, weeks: input.weeks });
    }),

  setRevenue: managerProcedure
    .input(
      z.object({
        weekStart: z.coerce.date(),
        amount: z.number().min(0).max(100_000_000).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await analyticsService.setWeeklyRevenue({
          businessId,
          weekStart: input.weekStart,
          amount: input.amount,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

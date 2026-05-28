import { z } from "zod";
import { managerProcedure, router } from "../init";
import { analyticsService, requireBusinessId } from "../services";

export const analyticsRouter = router({
  weekly: managerProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(52).default(12) }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return analyticsService.weeklyTrend({ businessId, weeks: input.weeks });
    }),
});

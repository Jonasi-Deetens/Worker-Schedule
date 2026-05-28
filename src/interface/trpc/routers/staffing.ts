import { z } from "zod";
import { managerProcedure, mapServiceError, router } from "../init";
import { staffingSuggestionsService } from "../services";

export const staffingRouter = router({
  suggest: managerProcedure
    .input(z.object({ shiftId: z.string() }))
    .query(async ({ input }) => {
      try {
        return await staffingSuggestionsService.rankForShift(input.shiftId);
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

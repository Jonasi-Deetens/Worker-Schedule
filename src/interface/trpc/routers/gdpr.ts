import { mapServiceError, protectedProcedure, router } from "../init";
import { gdprService } from "../services";

export const gdprRouter = router({
  exportMine: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await gdprService.exportUser(ctx.session.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),
  deleteMine: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await gdprService.softDelete(ctx.session.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),
});

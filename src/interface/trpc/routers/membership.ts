import { protectedProcedure, router } from "../init";
import { membershipService } from "../services";

export const membershipRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return membershipService.listForUser(ctx.session.user.id);
  }),
});

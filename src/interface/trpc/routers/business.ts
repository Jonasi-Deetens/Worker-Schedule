import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../init";
import { businessService, requireBusinessId } from "../services";

export const businessRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    const business = await businessService.get(businessId);
    if (!business) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Business not found" });
    }
    return business;
  }),
});

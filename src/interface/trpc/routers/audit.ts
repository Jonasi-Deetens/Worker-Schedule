import { z } from "zod";
import { ownerProcedure, router } from "../init";
import { auditService, requireBusinessId } from "../services";

export const auditRouter = router({
  /**
   * Paginated search over the audit log scoped to the calling owner's
   * business. Filters are all optional and combine with AND semantics; the
   * server caps `take` at 200 to keep the query cheap.
   */
  search: ownerProcedure
    .input(
      z.object({
        q: z.string().max(120).optional(),
        action: z.string().max(64).optional(),
        userId: z.string().cuid().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        cursor: z.string().optional(),
        take: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return auditService.search({ ...input, businessId });
    }),

  /** Distinct list of business members for the user filter dropdown. */
  members: ownerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return auditService.members(businessId);
  }),
});

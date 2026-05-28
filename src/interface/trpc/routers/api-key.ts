import { z } from "zod";
import { API_SCOPES } from "@/application/services/api-key-service";
import {
  mapServiceError,
  ownerProcedure,
  router,
} from "../init";
import { idSchema } from "../schemas";
import { apiKeyService, requireBusinessId } from "../services";

export const apiKeyRouter = router({
  list: ownerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return apiKeyService.list(businessId);
  }),
  create: ownerProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        scopes: z.array(z.enum(API_SCOPES)).min(1),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await apiKeyService.create({
          businessId,
          name: input.name,
          scopes: input.scopes,
          expiresAt: input.expiresAt ?? null,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  revoke: ownerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await apiKeyService.revoke({ id: input.id, businessId });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

import { z } from "zod";
import { WEBHOOK_EVENTS } from "@/application/services/webhook-service";
import {
  mapServiceError,
  ownerProcedure,
  router,
} from "../init";
import { idSchema } from "../schemas";
import { requireBusinessId, webhookService } from "../services";

export const webhookRouter = router({
  list: ownerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return webhookService.list(businessId);
  }),
  create: ownerProcedure
    .input(
      z.object({
        url: z.string().url(),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await webhookService.create({
          businessId,
          url: input.url,
          events: input.events,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  delete: ownerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await webhookService.delete({ id: input.id, businessId });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

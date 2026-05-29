import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mapServiceError, ownerProcedure, protectedProcedure, router } from "../init";
import { businessService, requireBusinessId } from "../services";

const dimonaSettingsSchema = z.object({
  dimonaEmployerId: z.string().max(40).nullable(),
  // Plaintext secret (e.g. JSON `{ "token": "...", "baseUrl": "..." }`).
  // Encrypted server-side before persistence. `null` clears it.
  dimonaCredentials: z.string().max(4000).nullable().optional(),
});

export const businessRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    const business = await businessService.get(businessId);
    if (!business) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Business not found" });
    }
    return business;
  }),

  settings: ownerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    try {
      return await businessService.getSettings(businessId);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  updateDimona: ownerProcedure
    .input(dimonaSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await businessService.updateDimonaSettings({
          businessId,
          actorId: ctx.session.user.id,
          dimonaEmployerId: input.dimonaEmployerId,
          dimonaCredentials: input.dimonaCredentials,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

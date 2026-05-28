import { z } from "zod";
import {
  managerProcedure,
  mapServiceError,
  router,
} from "../init";
import { idSchema } from "../schemas";
import { locationService, requireBusinessId } from "../services";

export const locationRouter = router({
  list: managerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return locationService.list(businessId);
  }),
  create: managerProcedure
    .input(
      z.object({
        name: z.string().min(1),
        address: z.string().optional(),
        timezone: z.string().optional(),
        geofenceLat: z.number().optional(),
        geofenceLng: z.number().optional(),
        geofenceRadiusM: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await locationService.create({ businessId, ...input });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  update: managerProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        address: z.string().nullable().optional(),
        timezone: z.string().optional(),
        geofenceLat: z.number().nullable().optional(),
        geofenceLng: z.number().nullable().optional(),
        geofenceRadiusM: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await locationService.update({ businessId, ...input });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  delete: managerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        await locationService.delete({ id: input.id, businessId });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

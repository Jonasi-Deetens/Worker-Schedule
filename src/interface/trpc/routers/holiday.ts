import { z } from "zod";
import { managerProcedure, mapServiceError, router } from "../init";
import { idSchema } from "../schemas";
import { holidayService, requireActiveMembership } from "../services";

/** Defaults to the current calendar year (UTC) when no year is given. */
function resolveYear(year?: number): number {
  return year ?? new Date().getUTCFullYear();
}

export const holidayRouter = router({
  /**
   * Merged calendar for a year: statutory Belgian holidays plus the business's
   * custom closure days. Owners and managers may view it.
   */
  list: managerProcedure
    .input(z.object({ year: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await holidayService.listForYear(
          businessId,
          resolveYear(input?.year),
        );
      } catch (error) {
        mapServiceError(error);
      }
    }),

  /** Adds (or relabels) a custom closure day for the business. */
  add: managerProcedure
    .input(
      z.object({
        date: z.coerce.date(),
        name: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await holidayService.addCustom({
          businessId,
          date: input.date,
          name: input.name,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  /** Removes a custom closure day, scoped to the business. */
  remove: managerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        await holidayService.removeCustom({ businessId, id: input.id });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

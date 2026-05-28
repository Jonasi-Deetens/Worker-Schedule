import { mapServiceError, ownerProcedure, router } from "../init";
import {
  idSchema,
  templateInputSchema,
  templateUpdateSchema,
} from "../schemas";
import { requireBusinessId, templateService } from "../services";

export const templateRouter = router({
  list: ownerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return templateService.list(businessId);
  }),

  create: ownerProcedure
    .input(templateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await templateService.create({
          businessId,
          ...input,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  update: ownerProcedure
    .input(templateUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        const { id, ...data } = input;
        return await templateService.update({
          id,
          businessId,
          ...data,
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
        return await templateService.delete({
          id: input.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

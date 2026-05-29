import { managerProcedure, mapServiceError, router } from "../init";
import {
  idSchema,
  workerProfileSchema,
  workerSkillsSchema,
  workerStatusSchema,
} from "../schemas";
import { requireActiveMembership, workerService } from "../services";

export const workerRouter = router({
  list: managerProcedure.query(async ({ ctx }) => {
    const businessId = await requireActiveMembership(
      ctx.session.user.id,
      ctx.session.user.businessId,
    );
    return workerService.list(businessId);
  }),

  get: managerProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const businessId = await requireActiveMembership(
      ctx.session.user.id,
      ctx.session.user.businessId,
    );
    try {
      return await workerService.get({ id: input.id, businessId });
    } catch (error) {
      mapServiceError(error);
    }
  }),

  stats: managerProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const businessId = await requireActiveMembership(
      ctx.session.user.id,
      ctx.session.user.businessId,
    );
    return workerService.stats({ id: input.id, businessId });
  }),

  documents: managerProcedure
    .input(idSchema)
    .query(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      return workerService.documents({ id: input.id, businessId });
    }),

  update: managerProcedure
    .input(workerProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await workerService.updateProfile({
          businessId,
          actorId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  // Suspend/reactivate is a manager capability, consistent with the rest of
  // worker management (all managerProcedure). The UI already exposes these
  // buttons to managers; this keeps the API in step with it.
  setStatus: managerProcedure
    .input(workerStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await workerService.setStatus({
          id: input.id,
          businessId,
          actorId: ctx.session.user.id,
          status: input.status,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  setSkills: managerProcedure
    .input(workerSkillsSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await workerService.setSkills({
          userId: input.userId,
          businessId,
          skillIds: input.skillIds,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

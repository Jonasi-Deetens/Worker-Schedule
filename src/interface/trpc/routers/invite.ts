import {
  managerProcedure,
  mapServiceError,
  publicProcedure,
  router,
} from "../init";
import {
  idSchema,
  inviteAcceptSchema,
  inviteCreateSchema,
  inviteTokenSchema,
} from "../schemas";
import { inviteService, requireActiveMembership } from "../services";

export const inviteRouter = router({
  list: managerProcedure.query(async ({ ctx }) => {
    const businessId = await requireActiveMembership(
      ctx.session.user.id,
      ctx.session.user.businessId,
    );
    return inviteService.listForBusiness(businessId);
  }),

  create: managerProcedure
    .input(inviteCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await inviteService.create({
          businessId,
          invitedById: ctx.session.user.id,
          email: input.email,
          role: input.role,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  revoke: managerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        await inviteService.revoke({ id: input.id, businessId });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  lookup: publicProcedure
    .input(inviteTokenSchema)
    .query(async ({ input }) => {
      const invite = await inviteService.findByToken(input.token);
      if (!invite) return null;
      return {
        businessName: invite.business.name,
        email: invite.email,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt,
      };
    }),

  accept: publicProcedure
    .input(inviteAcceptSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await inviteService.accept(input);
        return {
          userId: result.user.id,
          email: result.user.email,
          businessId: result.businessId,
        };
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

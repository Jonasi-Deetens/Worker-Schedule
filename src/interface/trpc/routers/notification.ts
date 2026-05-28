import { z } from "zod";
import { mapServiceError, protectedProcedure, router } from "../init";
import { idSchema } from "../schemas";
import { notificationService } from "../services";

export const notificationRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
          cursor: z.string().cuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return notificationService.list({
        userId: ctx.session.user.id,
        limit: input?.limit,
        cursor: input?.cursor,
      });
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return notificationService.unreadCount(ctx.session.user.id);
  }),

  markRead: protectedProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await notificationService.markRead({
          id: input.id,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    return notificationService.markAllRead(ctx.session.user.id);
  }),
});

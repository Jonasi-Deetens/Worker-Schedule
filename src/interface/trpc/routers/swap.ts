import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  mapServiceError,
  router,
  workerProcedure,
} from "../init";
import {
  idSchema,
  swapDecideSchema,
  swapOfferSchema,
} from "../schemas";
import { requireBusinessId, swapService } from "../services";

export const swapRouter = router({
  offer: workerProcedure
    .input(swapOfferSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await swapService.offer({
          subscriptionId: input.subscriptionId,
          fromUserId: ctx.session.user.id,
          toUserId: input.toUserId,
          message: input.message,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  listMine: workerProcedure.query(async ({ ctx }) => {
    return swapService.listMine(ctx.session.user.id);
  }),
  candidates: workerProcedure
    .input(z.object({ subscriptionId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await swapService.findCandidates({
          subscriptionId: input.subscriptionId,
          requestingUserId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        if (error instanceof Error && /not found/i.test(error.message)) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        mapServiceError(error);
      }
    }),
  decide: workerProcedure
    .input(swapDecideSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await swapService.decide({
          id: input.id,
          decidingUserId: ctx.session.user.id,
          accept: input.accept,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  cancel: workerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await swapService.cancel({
          id: input.id,
          requestingUserId: ctx.session.user.id,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

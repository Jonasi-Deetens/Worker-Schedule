import { z } from "zod";
import {
  managerProcedure,
  mapServiceError,
  router,
  workerOrManagerProcedure,
} from "../init";
import { idSchema } from "../schemas";
import {
  requireBusinessId,
  workerContractService,
} from "../services";

export const contractRouter = router({
  listMine: workerOrManagerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return workerContractService.listForWorker(ctx.session.user.id, businessId);
  }),

  listPendingMine: workerOrManagerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return workerContractService.listPendingForWorker(
      ctx.session.user.id,
      businessId,
    );
  }),

  listForWorker: managerProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return workerContractService.listForBusiness(businessId, input.userId);
    }),

  send: managerProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        title: z.string().min(1).max(200),
        body: z.string().max(8000).optional(),
        fileUrl: z.string().url().optional(),
        contractType: z
          .enum(["FLEXI", "JOBSTUDENT", "EMPLOYEE", "EXTRA"])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await workerContractService.send({
          businessId,
          userId: input.userId,
          actorId: ctx.session.user.id,
          title: input.title,
          body: input.body,
          fileUrl: input.fileUrl,
          contractType: input.contractType,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  sign: workerOrManagerProcedure
    .input(
      z.object({
        contractId: z.string().min(1),
        signatureName: z.string().min(2).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await workerContractService.sign({
          contractId: input.contractId,
          userId: ctx.session.user.id,
          businessId,
          signatureName: input.signatureName,
          signatureIp: ctx.ip ?? null,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  decline: workerOrManagerProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await workerContractService.decline({
          contractId: input.id,
          userId: ctx.session.user.id,
          businessId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

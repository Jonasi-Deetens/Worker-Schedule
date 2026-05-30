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

const signatureInputSchema = z.object({
  contractId: z.string().min(1),
  signaturePngBase64: z.string().min(100).max(300_000),
  signerLabel: z.string().max(120).optional(),
});

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

  listPendingEmployer: managerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    return workerContractService.listPendingEmployerSignature(businessId);
  }),

  pendingEmployerCount: managerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    const rows = await workerContractService.listPendingEmployerSignature(
      businessId,
    );
    return rows.length;
  }),

  listForWorker: managerProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return workerContractService.listForBusiness(businessId, input.userId);
    }),

  prefill: managerProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        title: z.string().max(200).optional(),
        contractType: z
          .enum(["FLEXI", "JOBSTUDENT", "EMPLOYEE", "EXTRA"])
          .optional(),
        startDate: z.coerce.date().nullable().optional(),
        endDate: z.coerce.date().nullable().optional(),
        scheduleText: z.string().max(2000).nullable().optional(),
        hourlyWageCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
        jobDescription: z.string().max(4000).nullable().optional(),
        locale: z.enum(["nl", "fr"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await workerContractService.prefillForWorker({
          businessId,
          userId: input.userId,
          overrides: {
            title: input.title,
            contractType: input.contractType,
            startDate: input.startDate,
            endDate: input.endDate,
            scheduleText: input.scheduleText,
            hourlyWageCents: input.hourlyWageCents,
            jobDescription: input.jobDescription,
          },
          locale: input.locale,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  send: managerProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        title: z.string().max(200).optional(),
        fileUrl: z.string().url().optional(),
        contractType: z
          .enum(["FLEXI", "JOBSTUDENT", "EMPLOYEE", "EXTRA"])
          .optional(),
        startDate: z.coerce.date().nullable().optional(),
        endDate: z.coerce.date().nullable().optional(),
        scheduleText: z.string().max(2000).nullable().optional(),
        hourlyWageCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
        jobDescription: z.string().max(4000).nullable().optional(),
        locale: z.enum(["nl", "fr"]).optional(),
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
          fileUrl: input.fileUrl,
          contractType: input.contractType,
          startDate: input.startDate,
          endDate: input.endDate,
          scheduleText: input.scheduleText,
          hourlyWageCents: input.hourlyWageCents,
          jobDescription: input.jobDescription,
          locale: input.locale,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  signAsWorker: workerOrManagerProcedure
    .input(signatureInputSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await workerContractService.signAsWorker({
          contractId: input.contractId,
          userId: ctx.session.user.id,
          businessId,
          signaturePngBase64: input.signaturePngBase64,
          signerLabel: input.signerLabel,
          signatureIp: ctx.ip ?? null,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  signAsEmployer: managerProcedure
    .input(signatureInputSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await workerContractService.signAsEmployer({
          contractId: input.contractId,
          actorId: ctx.session.user.id,
          businessId,
          signaturePngBase64: input.signaturePngBase64,
          signerLabel: input.signerLabel,
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

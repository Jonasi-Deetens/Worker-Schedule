import { z } from "zod";
import { isStorageConfigured } from "@/application/services/document-service";
import {
  managerProcedure,
  mapServiceError,
  protectedProcedure,
  router,
} from "../init";
import { idSchema } from "../schemas";
import { documentService, requireBusinessId } from "../services";

export const documentRouter = router({
  storageStatus: protectedProcedure.query(() => {
    return { configured: isStorageConfigured() };
  }),
  presignUpload: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(120),
        contentType: z.string().min(1).max(120),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return documentService.presignUpload({
          userId: ctx.session.user.id,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return documentService.listForUser(ctx.session.user.id);
  }),
  listExpiring: managerProcedure
    .input(z.object({ days: z.number().int().positive().max(180).default(30) }))
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      return documentService.listForBusiness(businessId, {
        expiringWithinDays: input.days,
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        kind: z.enum([
          "ID_CARD",
          "WORK_CONTRACT",
          "RESIDENCE_PERMIT",
          "FOOD_SAFETY",
          "ENROLLMENT_CERTIFICATE",
          "STUDENT_AT_WORK_ATTESTATION",
          "OTHER",
        ]),
        url: z.string().url(),
        fileName: z.string().min(1),
        contentType: z.string().optional(),
        sizeBytes: z.number().int().positive().optional(),
        expiresOn: z.date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await documentService.create({
          userId: ctx.session.user.id,
          kind: input.kind,
          url: input.url,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          expiresOn: input.expiresOn ?? null,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
  delete: protectedProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      const isOwnerOrManager =
        ctx.session.user.role === "OWNER" ||
        ctx.session.user.role === "MANAGER";
      try {
        await documentService.delete({
          id: input.id,
          userId: ctx.session.user.id,
          isOwnerOrManager,
          actingBusinessId: ctx.session.user.businessId,
        });
        return { success: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

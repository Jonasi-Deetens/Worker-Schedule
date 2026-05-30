import { z } from "zod";
import { isStorageConfigured } from "@/application/services/document-service";
import { mapServiceError, ownerProcedure, router } from "../init";
import {
  contractTemplateService,
  requireBusinessId,
} from "../services";

export const contractTemplateRouter = router({
  fieldSpec: ownerProcedure.query(() => {
    return contractTemplateService.fieldSpec();
  }),

  presignUpload: ownerProcedure
    .input(
      z.object({
        locale: z.enum(["nl", "fr"]),
        fileName: z.string().min(1).max(200),
        contentType: z.literal("application/pdf"),
        sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      if (!isStorageConfigured()) {
        throw new Error("Object storage is not configured");
      }
      try {
        return await contractTemplateService.presignTemplateUpload({
          businessId,
          locale: input.locale,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateUrl: ownerProcedure
    .input(
      z.object({
        locale: z.enum(["nl", "fr"]),
        fileUrl: z.string().url().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await contractTemplateService.updateTemplateUrl({
          businessId,
          actorId: ctx.session.user.id,
          locale: input.locale,
          fileUrl: input.fileUrl,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  preview: ownerProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        locale: z.enum(["nl", "fr"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await contractTemplateService.previewFilledPdf({
          businessId,
          userId: input.userId,
          locale: input.locale,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

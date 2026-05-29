import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { isStorageConfigured } from "@/application/services/document-service";
import { presignS3Put } from "@/infrastructure/storage/s3-presign";
import { protectedProcedure, router } from "../init";
import {
  hoursPeriodSchema,
  mePasswordSchema,
  meProfileUpdateSchema,
} from "../schemas";
import {
  meService,
  requireBusinessId,
  timeClockService,
  workerService,
} from "../services";

export const meRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    return meService.dashboard({
      userId: ctx.session.user.id,
      businessId: ctx.session.user.businessId ?? null,
    });
  }),
  calendarUrl: protectedProcedure.query(async ({ ctx }) => {
    return meService.calendarUrl(ctx.session.user.id);
  }),
  rotateCalendarToken: protectedProcedure.mutation(async ({ ctx }) => {
    return meService.rotateCalendarToken(ctx.session.user.id);
  }),
  profile: protectedProcedure.query(async ({ ctx }) => {
    return meService.profile(ctx.session.user.id);
  }),

  /**
   * Presigned PUT URL for an avatar upload. Same S3-compatible storage
   * we use for documents, but a stricter cap (2 MiB) and image-only
   * content types because avatars get rendered everywhere — including
   * inside FullCalendar event cards — and we don't want a fat upload to
   * tank rendering performance.
   */
  presignAvatar: protectedProcedure
    .input(
      z.object({
        contentType: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
        ]),
        sizeBytes: z
          .number()
          .int()
          .positive()
          .max(2 * 1024 * 1024, "Avatar must be ≤2 MiB"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isStorageConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Object storage is not configured",
        });
      }
      const ext = input.contentType === "image/jpeg" ? "jpg" :
        input.contentType === "image/png" ? "png" : "webp";
      const key = `avatars/${ctx.session.user.id}/${randomUUID()}.${ext}`;
      const presigned = presignS3Put({
        endpoint: env.STORAGE_ENDPOINT!,
        region: env.STORAGE_REGION!,
        bucket: env.STORAGE_BUCKET!,
        accessKeyId: env.STORAGE_ACCESS_KEY!,
        secretAccessKey: env.STORAGE_SECRET_KEY!,
        key,
        contentType: input.contentType,
        expiresInSeconds: 300,
        forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === true,
      });
      return { ...presigned, key };
    }),
  updateProfile: protectedProcedure
    .input(meProfileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      return meService.updateProfile(ctx.session.user.id, input);
    }),
  changePassword: protectedProcedure
    .input(mePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      return meService.changePassword({
        userId: ctx.session.user.id,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
    }),
  hours: protectedProcedure
    .input(hoursPeriodSchema)
    .query(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      const [scheduled, worked] = await Promise.all([
        workerService.aggregateHours(
          ctx.session.user.id,
          businessId,
          input.from,
          input.to,
        ),
        timeClockService.aggregateWorkedHours(
          ctx.session.user.id,
          input.from,
          input.to,
        ),
      ]);
      // `total` is kept for backwards-compatible callers; it mirrors scheduled.
      return { total: scheduled, scheduled, worked };
    }),
});

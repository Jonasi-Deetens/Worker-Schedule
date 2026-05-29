import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mapServiceError, ownerProcedure, protectedProcedure, router } from "../init";
import { businessService, requireBusinessId } from "../services";

const dimonaSettingsSchema = z.object({
  dimonaEmployerId: z.string().max(40).nullable(),
  // Plaintext secret (e.g. JSON `{ "token": "...", "baseUrl": "..." }`).
  // Encrypted server-side before persistence. `null` clears it.
  dimonaCredentials: z.string().max(4000).nullable().optional(),
});

export const businessRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    const business = await businessService.get(businessId);
    if (!business) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Business not found" });
    }
    return business;
  }),

  settings: ownerProcedure.query(async ({ ctx }) => {
    const businessId = requireBusinessId(ctx.session.user.businessId);
    try {
      return await businessService.getSettings(businessId);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  updateDimona: ownerProcedure
    .input(dimonaSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await businessService.updateDimonaSettings({
          businessId,
          actorId: ctx.session.user.id,
          dimonaEmployerId: input.dimonaEmployerId,
          dimonaCredentials: input.dimonaCredentials,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateContractPolicy: ownerProcedure
    .input(z.object({ requireSignedContract: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await businessService.updateContractPolicy({
          businessId,
          actorId: ctx.session.user.id,
          requireSignedContract: input.requireSignedContract,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateEmployerProfile: ownerProcedure
    .input(
      z.object({
        addressLine: z.string().max(200).nullable(),
        postalCode: z.string().max(20).nullable(),
        city: z.string().max(120).nullable(),
        cbeNumber: z.string().max(40).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await businessService.updateEmployerProfile({
          businessId,
          actorId: ctx.session.user.id,
          addressLine: input.addressLine,
          postalCode: input.postalCode,
          city: input.city,
          cbeNumber: input.cbeNumber,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateStudentQuotaPolicy: ownerProcedure
    .input(
      z.object({
        studentQuotaHardStop: z.boolean(),
        studentQuotaHardStopBufferHours: z.number().int().min(0).max(650),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await businessService.updateStudentQuotaPolicy({
          businessId,
          actorId: ctx.session.user.id,
          studentQuotaHardStop: input.studentQuotaHardStop,
          studentQuotaHardStopBufferHours:
            input.studentQuotaHardStopBufferHours,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateStudentAttestationPolicy: ownerProcedure
    .input(
      z.object({
        requireStudentAttestation: z.boolean(),
        attestationMaxAgeDays: z.number().int().min(1).max(3650),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = requireBusinessId(ctx.session.user.businessId);
      try {
        return await businessService.updateStudentAttestationPolicy({
          businessId,
          actorId: ctx.session.user.id,
          requireStudentAttestation: input.requireStudentAttestation,
          attestationMaxAgeDays: input.attestationMaxAgeDays,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

import { z } from "zod";
import type { StudentRegion } from "@prisma/client";
import {
  managerProcedure,
  mapServiceError,
  protectedProcedure,
  router,
} from "../init";
import {
  prisma,
  requireActiveMembership,
  studentQuotaService,
} from "../services";

/** Defaults to the current calendar year (UTC) when no year is given. */
function resolveYear(year?: number): number {
  return year ?? new Date().getUTCFullYear();
}

/**
 * Computes the Student@Work attestation status for the quota widget: whether
 * the business requires it, whether one is on file, and whether the latest one
 * is stale (older than the configured max age). Staleness is measured as of now
 * since the widget reflects current eligibility, not a specific shift.
 */
async function buildAttestationStatus(userId: string, businessId: string) {
  const [business, latest] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { requireStudentAttestation: true, attestationMaxAgeDays: true },
    }),
    prisma.document.findFirst({
      where: { userId, kind: "STUDENT_AT_WORK_ATTESTATION" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const required = business?.requireStudentAttestation ?? false;
  const maxAgeDays = business?.attestationMaxAgeDays ?? 365;
  const uploadedAt = latest?.createdAt ?? null;
  const stale =
    uploadedAt !== null &&
    uploadedAt.getTime() < Date.now() - maxAgeDays * 86_400_000;
  return {
    required,
    maxAgeDays,
    present: uploadedAt !== null,
    uploadedAt,
    stale,
  };
}

async function buildQuotaResponse(
  userId: string,
  businessId: string,
  year: number,
) {
  const [usage, worker, attestation] = await Promise.all([
    studentQuotaService.getUsage({ userId, businessId, year }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { region: true },
    }),
    buildAttestationStatus(userId, businessId),
  ]);
  const region = worker?.region ?? null;
  const regional = region
    ? await studentQuotaService.getRegionalAdvisory({
        userId,
        businessId,
        year,
        region: region as StudentRegion,
      })
    : null;
  return { usage, region, regional, attestation };
}

export const quotaRouter = router({
  /** Manager view of a specific worker's 650h quota + regional advisory. */
  forWorker: managerProcedure
    .input(z.object({ userId: z.string().min(1), year: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await buildQuotaResponse(
          input.userId,
          businessId,
          resolveYear(input.year),
        );
      } catch (error) {
        mapServiceError(error);
      }
    }),

  /** The calling user's own quota (worker `/me` widget). */
  mine: protectedProcedure
    .input(z.object({ year: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const businessId = ctx.session.user.businessId;
      if (!businessId) return null;
      // The quota only applies to student workers; hide it for everyone else.
      const me = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { contractType: true },
      });
      if (me?.contractType !== "JOBSTUDENT") return null;
      try {
        return await buildQuotaResponse(
          ctx.session.user.id,
          businessId,
          resolveYear(input?.year),
        );
      } catch (error) {
        mapServiceError(error);
      }
    }),

  /**
   * Records the national remaining balance from the worker's Student@Work
   * attestation (not API-readable, so entered manually by a manager).
   */
  setAttestation: managerProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        year: z.number().int().optional(),
        balanceHours: z.number().int().min(0).max(650).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = await requireActiveMembership(
        ctx.session.user.id,
        ctx.session.user.businessId,
      );
      try {
        return await studentQuotaService.setAttestationBalance({
          userId: input.userId,
          businessId,
          year: resolveYear(input.year),
          balanceHours: input.balanceHours,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});

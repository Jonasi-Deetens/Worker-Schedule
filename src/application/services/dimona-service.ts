import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  defaultEnqueueDimonaDeclare,
  type DimonaDeclareEnqueue,
  type DimonaDeclareJob,
} from "./dimona-declare-job";
import {
  getDimonaAdapter,
  HttpDimonaAdapter,
  type DimonaAdapter,
  type DimonaDeclarationInput,
} from "@/infrastructure/dimona/adapter";
import { decryptString } from "@/infrastructure/dimona/crypto";

/**
 * Maps a worker's contract type to the Dimona worker type code.
 * - FLEXI -> FLX (flexi-job)
 * - JOBSTUDENT -> STU (student)
 * - EXTRA -> EXT (extra in horeca)
 * - EMPLOYEE (default) -> OTH (other / standard employment)
 */
function mapWorkerType(
  contractType: "FLEXI" | "JOBSTUDENT" | "EXTRA" | "EMPLOYEE" | null | undefined,
): DimonaDeclarationInput["workerType"] {
  switch (contractType) {
    case "FLEXI":
      return "FLX";
    case "JOBSTUDENT":
      return "STU";
    case "EXTRA":
      return "EXT";
    default:
      return "OTH";
  }
}

/** Contract types that the system declares automatically on assignment. */
const AUTO_DECLARE_TYPES = new Set(["FLEXI", "EXTRA", "JOBSTUDENT"]);

export class DimonaService {
  constructor(
    private readonly db: PrismaClient,
    private readonly adapter: DimonaAdapter = getDimonaAdapter(),
    private readonly enqueueRetry: DimonaDeclareEnqueue = defaultEnqueueDimonaDeclare,
  ) {}

  /**
   * Returns true when the given worker contract type should be auto-declared.
   * Manual confirmation is required for EMPLOYEE because the validity period
   * differs from the per-shift model.
   */
  static shouldAutoDeclare(
    contractType: "FLEXI" | "JOBSTUDENT" | "EXTRA" | "EMPLOYEE" | null | undefined,
  ): boolean {
    return contractType ? AUTO_DECLARE_TYPES.has(contractType) : false;
  }

  /**
   * Picks the adapter for a declaration. When `DIMONA_ENV` is prod/sandbox and
   * the business has stored (encrypted) credentials, a per-business HTTP
   * adapter is built from them; otherwise the process-default adapter (mock in
   * dev/tests) is used.
   */
  private resolveAdapter(business: {
    dimonaCredentials?: string | null;
  }): DimonaAdapter {
    const env = process.env.DIMONA_ENV;
    if ((env === "prod" || env === "sandbox") && business.dimonaCredentials) {
      try {
        const creds = JSON.parse(
          decryptString(business.dimonaCredentials),
        ) as { token?: string; baseUrl?: string };
        const baseUrl =
          creds.baseUrl ??
          (env === "prod"
            ? process.env.DIMONA_PROD_URL
            : process.env.DIMONA_SANDBOX_URL);
        if (creds.token && baseUrl) {
          return new HttpDimonaAdapter({ baseUrl, token: creds.token });
        }
      } catch (err) {
        logger.warn({
          event: "dimona.credentials.invalid",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return this.adapter;
  }

  /**
   * Declare a worker IN for the given shift. Idempotent: if a CONFIRMED
   * declaration already exists for this shift/worker pair, it is returned
   * unchanged.
   */
  async declareIn(input: { shiftId: string; workerId: string }) {
    const [shift, worker] = await Promise.all([
      this.db.shift.findUnique({
        where: { id: input.shiftId },
        include: { business: true },
      }),
      this.db.user.findUnique({ where: { id: input.workerId } }),
    ]);
    if (!shift) throw new Error("Shift not found");
    if (!worker) throw new Error("Worker not found");
    if (!shift.business.dimonaEmployerId) {
      logger.info({
        event: "dimona.skip",
        reason: "no_employer_id",
        shiftId: input.shiftId,
      });
      return null;
    }

    const existing = await this.db.dimonaDeclaration.findFirst({
      where: { shiftId: input.shiftId, workerId: input.workerId, status: "CONFIRMED" },
    });
    if (existing) return existing;

    const request: DimonaDeclarationInput = {
      workerNiss: worker.nationalNumber ?? "",
      workerType: mapWorkerType(worker.contractType),
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      employerId: shift.business.dimonaEmployerId,
      action: "IN",
    };

    const result = await this.resolveAdapter(shift.business).declare(request);
    const status = result.ok ? "CONFIRMED" : "REJECTED";
    const declaration = await this.db.dimonaDeclaration.create({
      data: {
        shiftId: input.shiftId,
        workerId: input.workerId,
        dimonaPeriodId: result.dimonaPeriodId,
        status,
        requestPayload: request as unknown as object,
        responsePayload: result as unknown as object,
        errorMessage: result.ok ? null : result.errorMessage,
      },
    });
    await this.db.auditEvent.create({
      data: {
        action: "DIMONA_DECLARED",
        entityType: "Shift",
        entityId: input.shiftId,
        metadata: { workerId: input.workerId, ok: result.ok },
      },
    });
    if (!result.ok) {
      await this.enqueueRetryJob({
        shiftId: input.shiftId,
        workerId: input.workerId,
        action: "IN",
        declarationId: declaration.id,
      });
    }
    return declaration;
  }

  /**
   * Declares OUT for a worker after clock-out when a CONFIRMED IN declaration
   * exists. Idempotent — skips if OUT was already recorded.
   */
  async declareOut(input: { shiftId: string; workerId: string }) {
    const declaration = await this.db.dimonaDeclaration.findFirst({
      where: {
        shiftId: input.shiftId,
        workerId: input.workerId,
        status: "CONFIRMED",
      },
    });
    if (!declaration?.dimonaPeriodId) return null;
    if (declaration.outDeclaredAt) return declaration;

    const [shift, worker] = await Promise.all([
      this.db.shift.findUnique({
        where: { id: input.shiftId },
        include: { business: true },
      }),
      this.db.user.findUnique({ where: { id: input.workerId } }),
    ]);
    if (!shift?.business.dimonaEmployerId || !worker) return null;

    const request: DimonaDeclarationInput = {
      workerNiss: worker.nationalNumber ?? "",
      workerType: mapWorkerType(worker.contractType),
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      employerId: shift.business.dimonaEmployerId,
      action: "OUT",
      dimonaPeriodId: declaration.dimonaPeriodId,
    };

    const result = await this.resolveAdapter(shift.business).declare(request);
    const updated = await this.db.dimonaDeclaration.update({
      where: { id: declaration.id },
      data: {
        outDeclaredAt: result.ok ? new Date() : declaration.outDeclaredAt,
        outResponsePayload: result as unknown as object,
        errorMessage: result.ok ? declaration.errorMessage : result.errorMessage,
      },
    });

    await this.db.auditEvent.create({
      data: {
        action: "DIMONA_OUT_DECLARED",
        entityType: "Shift",
        entityId: input.shiftId,
        metadata: { workerId: input.workerId, ok: result.ok },
      },
    });

    if (!result.ok) {
      await this.enqueueRetryJob({
        shiftId: input.shiftId,
        workerId: input.workerId,
        action: "OUT",
        declarationId: declaration.id,
      });
    }

    return updated;
  }

  /** Re-run a failed IN declaration (manager retry or background job). */
  async retryDeclareIn(input: { declarationId: string; businessId: string }) {
    const existing = await this.db.dimonaDeclaration.findFirst({
      where: {
        id: input.declarationId,
        shift: { businessId: input.businessId },
      },
    });
    if (!existing) throw new Error("Declaration not found");
    if (existing.status === "CONFIRMED") return existing;

    await this.db.dimonaDeclaration.delete({ where: { id: existing.id } });
    return this.declareIn({
      shiftId: existing.shiftId,
      workerId: existing.workerId,
    });
  }

  /** Manual IN for EMPLOYEE contract types (not auto-declared). */
  async declareManual(input: {
    shiftId: string;
    workerId: string;
    businessId: string;
    actorId: string;
  }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
    });
    if (!shift) throw new Error("Shift not found");

    const assignment = await this.db.shiftAssignment.findUnique({
      where: {
        shiftId_userId: { shiftId: input.shiftId, userId: input.workerId },
      },
    });
    if (!assignment || assignment.status !== "CONFIRMED") {
      throw new Error("Worker must have a confirmed assignment on this shift");
    }

    const declaration = await this.declareIn({
      shiftId: input.shiftId,
      workerId: input.workerId,
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "DIMONA_DECLARED",
        entityType: "Shift",
        entityId: input.shiftId,
        metadata: { workerId: input.workerId, manual: true },
      },
    });

    return declaration;
  }

  private async enqueueRetryJob(job: DimonaDeclareJob): Promise<void> {
    if (process.env.DIMONA_ENV === "mock" || !process.env.DIMONA_ENV) return;
    await this.enqueueRetry(job).catch((err) =>
      logger.warn({
        event: "dimona.retry.enqueue.failed",
        shiftId: job.shiftId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  /** Cancel an existing Dimona declaration (e.g. when an assignment is removed). */
  async cancel(input: { shiftId: string; workerId: string }) {
    const declaration = await this.db.dimonaDeclaration.findFirst({
      where: {
        shiftId: input.shiftId,
        workerId: input.workerId,
        status: "CONFIRMED",
      },
    });
    if (!declaration?.dimonaPeriodId) return null;

    const shift = await this.db.shift.findUnique({
      where: { id: input.shiftId },
      include: { business: true },
    });
    if (!shift?.business.dimonaEmployerId) return null;

    const result = await this.resolveAdapter(shift.business).declare({
      workerNiss: "n/a",
      workerType: "OTH",
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      employerId: shift.business.dimonaEmployerId,
      action: "CANCEL",
      dimonaPeriodId: declaration.dimonaPeriodId,
    });
    const updated = await this.db.dimonaDeclaration.update({
      where: { id: declaration.id },
      data: {
        status: result.ok ? "CANCELLED" : declaration.status,
        responsePayload: result as unknown as object,
        errorMessage: result.ok ? null : result.errorMessage,
      },
    });

    await this.db.auditEvent.create({
      data: {
        action: "DIMONA_CANCELLED",
        entityType: "Shift",
        entityId: input.shiftId,
        metadata: { workerId: input.workerId, ok: result.ok },
      },
    });

    return updated;
  }

  /**
   * Compares local CONFIRMED assignments with their declarations. Returns the
   * list of pairs where no CONFIRMED declaration exists. Intended for a daily
   * reconciliation job.
   */
  async reconcile(businessId: string, since: Date) {
    const assignments = await this.db.shiftAssignment.findMany({
      where: {
        shift: { businessId, startsAt: { gte: since } },
        user: { contractType: { in: ["FLEXI", "EXTRA", "JOBSTUDENT"] } },
      },
      include: { shift: true },
    });
    const gaps: { shiftId: string; userId: string }[] = [];
    for (const a of assignments) {
      const d = await this.db.dimonaDeclaration.findFirst({
        where: { shiftId: a.shiftId, workerId: a.userId, status: "CONFIRMED" },
      });
      if (!d) gaps.push({ shiftId: a.shiftId, userId: a.userId });
    }
    return gaps;
  }
}

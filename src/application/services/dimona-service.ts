import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  getDimonaAdapter,
  type DimonaAdapter,
  type DimonaDeclarationInput,
} from "@/infrastructure/dimona/adapter";

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

    const result = await this.adapter.declare(request);
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
    return declaration;
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

    const result = await this.adapter.declare({
      workerNiss: "n/a",
      workerType: "OTH",
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      employerId: shift.business.dimonaEmployerId,
      action: "CANCEL",
      dimonaPeriodId: declaration.dimonaPeriodId,
    });
    return this.db.dimonaDeclaration.update({
      where: { id: declaration.id },
      data: {
        status: result.ok ? "CANCELLED" : declaration.status,
        responsePayload: result as unknown as object,
        errorMessage: result.ok ? null : result.errorMessage,
      },
    });
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

import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { distinctQuarters } from "@/lib/quarter";
import { DimonaService } from "./dimona-service";
import { StudentQuotaService } from "./student-quota-service";

type ContractType = "FLEXI" | "JOBSTUDENT" | "EXTRA" | "EMPLOYEE" | null | undefined;

async function loadContractType(
  db: PrismaClient,
  workerId: string,
): Promise<ContractType> {
  const worker = await db.user.findUnique({
    where: { id: workerId },
    select: { contractType: true },
  });
  return worker?.contractType;
}

/**
 * Fires a Dimona IN when the worker's contract type is auto-declared
 * (FLEXI / EXTRA / JOBSTUDENT). Non-fatal — failures are logged, not thrown.
 */
export async function declareInIfAuto(
  db: PrismaClient,
  shiftId: string,
  workerId: string,
): Promise<void> {
  const contractType = await loadContractType(db, workerId);
  if (!DimonaService.shouldAutoDeclare(contractType)) return;

  await new DimonaService(db)
    .declareIn({ shiftId, workerId })
    .catch((err) =>
      logger.warn({
        event: "dimona.declare.failed",
        shiftId,
        workerId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
}

/**
 * Cancels an existing Dimona declaration when an assignment leaves CONFIRMED.
 * Non-fatal — failures are logged, not thrown.
 */
export async function cancelIfAuto(
  db: PrismaClient,
  shiftId: string,
  workerId: string,
): Promise<void> {
  const contractType = await loadContractType(db, workerId);
  if (!DimonaService.shouldAutoDeclare(contractType)) return;

  await new DimonaService(db)
    .cancel({ shiftId, workerId })
    .catch((err) =>
      logger.warn({
        event: "dimona.cancel.failed",
        shiftId,
        workerId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
}

/**
 * Re-computes the per-quarter Dimona STU declaration(s) and the 650h quota
 * ledger for a JOBSTUDENT worker after their assignments change or a shift is
 * rescheduled. `dates` are the shift dates touched by the change (old and new
 * when rescheduled) so the right quarter(s) are recomputed. Non-fatal — failures
 * are logged, not thrown — so it can be fired-and-awaited from commit paths.
 */
export async function recomputeStuQuartersIfStudent(
  db: PrismaClient,
  input: { workerId: string; businessId: string; dates: Date[] },
): Promise<void> {
  const contractType = await loadContractType(db, input.workerId);
  if (contractType !== "JOBSTUDENT") return;

  const quarters = distinctQuarters(input.dates);
  if (quarters.length === 0) return;

  try {
    const dimona = new DimonaService(db);
    const quota = new StudentQuotaService(db);
    const years = new Set<number>();
    for (const yq of quarters) {
      await dimona.recomputeStuQuarter({
        userId: input.workerId,
        businessId: input.businessId,
        year: yq.year,
        quarter: yq.quarter,
      });
      years.add(yq.year);
    }
    for (const year of years) {
      await quota.recompute({
        userId: input.workerId,
        businessId: input.businessId,
        year,
      });
    }
  } catch (err) {
    logger.warn({
      event: "dimona.stu.recompute.failed",
      workerId: input.workerId,
      businessId: input.businessId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fires a Dimona OUT after clock-out when a CONFIRMED IN declaration exists.
 * Non-fatal — failures are logged, not thrown.
 */
export async function declareOutIfAuto(
  db: PrismaClient,
  shiftId: string,
  workerId: string,
): Promise<void> {
  const contractType = await loadContractType(db, workerId);
  if (!DimonaService.shouldAutoDeclare(contractType)) return;

  await new DimonaService(db)
    .declareOut({ shiftId, workerId })
    .catch((err) =>
      logger.warn({
        event: "dimona.out.failed",
        shiftId,
        workerId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
}

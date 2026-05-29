import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { DimonaService } from "./dimona-service";

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

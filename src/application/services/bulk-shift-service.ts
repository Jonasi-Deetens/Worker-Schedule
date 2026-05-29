import type { PrismaClient, ShiftStatus } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { recomputeStuQuartersIfStudent } from "./dimona-hooks";
import { requestShiftReconfirmations } from "./shift-reconfirmation";

/**
 * Service helpers for the planner's "do this to a lot of shifts at once"
 * actions. Each method is transactional where it touches multiple rows so a
 * mid-operation failure rolls back cleanly.
 *
 * These exist outside `ShiftService` to keep that file focused on
 * single-shift business rules; the bulk operations explicitly skip per-shift
 * domain hooks (Dimona, webhooks) because owners using them are doing
 * planning work, not committing assignments yet.
 */
export class BulkShiftService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Copies every shift starting in `[fromWeekStart, fromWeekStart + 7d)` to
   * the same weekday/time offset starting at `toWeekStart`. Existing
   * assignments are intentionally not carried over — the duplicated shifts
   * land as drafts so the planner can review before publishing.
   */
  async duplicateWeek(input: {
    businessId: string;
    ownerId: string;
    fromWeekStart: Date;
    toWeekStart: Date;
  }) {
    const startOfFrom = startOfDay(input.fromWeekStart);
    const endOfFrom = new Date(startOfFrom.getTime() + 7 * 86_400_000);
    const startOfTo = startOfDay(input.toWeekStart);
    const offsetMs = startOfTo.getTime() - startOfFrom.getTime();

    const shifts = await this.db.shift.findMany({
      where: {
        businessId: input.businessId,
        startsAt: { gte: startOfFrom, lt: endOfFrom },
        status: { not: "CANCELLED" satisfies ShiftStatus },
      },
      orderBy: { startsAt: "asc" },
    });

    if (shifts.length === 0) {
      return { created: 0 };
    }

    const created = await this.db.$transaction(
      shifts.map((s) =>
        this.db.shift.create({
          data: {
            businessId: s.businessId,
            locationId: s.locationId,
            startsAt: new Date(s.startsAt.getTime() + offsetMs),
            endsAt: new Date(s.endsAt.getTime() + offsetMs),
            roleLabel: s.roleLabel,
            requiredSpots: s.requiredSpots,
            notes: s.notes,
            requiredSkillId: s.requiredSkillId,
          },
        }),
      ),
    );

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_CREATED",
        entityType: "Shift",
        entityId: "bulk:duplicate-week",
        metadata: {
          fromWeekStart: startOfFrom.toISOString(),
          toWeekStart: startOfTo.toISOString(),
          count: created.length,
        },
      },
    });
    logger.info({
      event: "bulk.duplicateWeek",
      businessId: input.businessId,
      count: created.length,
    });
    publishEvent(input.businessId, {
      type: "shift.updated",
      shiftId: "bulk",
    });
    return { created: created.length };
  }

  /**
   * Cancels every non-cancelled shift on a single calendar date. Existing
   * approved assignments are kept on the shift record so the audit log shows
   * who was affected; the worker-facing UI uses the status to render them
   * struck-through.
   */
  async cancelDay(input: {
    businessId: string;
    ownerId: string;
    date: Date;
  }) {
    const dayStart = startOfDay(input.date);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const targets = await this.db.shift.findMany({
      where: {
        businessId: input.businessId,
        startsAt: { gte: dayStart, lt: dayEnd },
        status: { not: "CANCELLED" satisfies ShiftStatus },
      },
      select: { id: true },
    });
    if (targets.length === 0) return { cancelled: 0 };

    const result = await this.db.shift.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { status: "CANCELLED" satisfies ShiftStatus },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_DELETED",
        entityType: "Shift",
        entityId: "bulk:cancel-day",
        metadata: {
          date: dayStart.toISOString(),
          count: result.count,
          ids: targets.map((t) => t.id),
        },
      },
    });
    logger.info({
      event: "bulk.cancelDay",
      businessId: input.businessId,
      count: result.count,
    });
    publishEvent(input.businessId, {
      type: "shift.updated",
      shiftId: "bulk",
    });
    return { cancelled: result.count };
  }

  /**
   * Shifts a set of selected shifts in time. `deltaMinutes` may be negative
   * (move earlier) or positive (move later). Bails entirely if any moved
   * shift would land in the past so we don't create silently broken state.
   */
  async reschedule(input: {
    businessId: string;
    ownerId: string;
    ids: string[];
    deltaMinutes: number;
  }) {
    if (input.ids.length === 0) return { moved: 0 };
    const targets = await this.db.shift.findMany({
      where: {
        id: { in: input.ids },
        businessId: input.businessId,
        status: { not: "CANCELLED" satisfies ShiftStatus },
      },
    });
    if (targets.length === 0) return { moved: 0 };

    const deltaMs = input.deltaMinutes * 60_000;
    const now = Date.now();
    for (const s of targets) {
      if (s.startsAt.getTime() + deltaMs < now) {
        throw new Error("Reschedule would push a shift into the past");
      }
    }

    await this.db.$transaction(
      targets.map((s) =>
        this.db.shift.update({
          where: { id: s.id },
          data: {
            startsAt: new Date(s.startsAt.getTime() + deltaMs),
            endsAt: new Date(s.endsAt.getTime() + deltaMs),
          },
        }),
      ),
    );

    // A bulk time change is still a reschedule: every CONFIRMED worker must
    // reconfirm the new slot, exactly like the single-shift update path.
    if (deltaMs !== 0) {
      for (const s of targets) {
        const newStart = new Date(s.startsAt.getTime() + deltaMs);
        await requestShiftReconfirmations(this.db, {
          shift: {
            id: s.id,
            startsAt: newStart,
            endsAt: new Date(s.endsAt.getTime() + deltaMs),
            roleLabel: s.roleLabel,
          },
          businessId: input.businessId,
          ownerId: input.ownerId,
        });

        // Re-declare per-quarter Dimona STU + quota for assigned students,
        // covering both the old and new quarter of each moved shift.
        const assignments =
          (await this.db.shiftAssignment.findMany({
            where: { shiftId: s.id },
            select: { userId: true },
          })) ?? [];
        for (const a of assignments) {
          await recomputeStuQuartersIfStudent(this.db, {
            workerId: a.userId,
            businessId: input.businessId,
            dates: [s.startsAt, newStart],
          });
        }
      }
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_UPDATED",
        entityType: "Shift",
        entityId: "bulk:reschedule",
        metadata: {
          deltaMinutes: input.deltaMinutes,
          count: targets.length,
          ids: targets.map((t) => t.id),
        },
      },
    });
    logger.info({
      event: "bulk.reschedule",
      businessId: input.businessId,
      count: targets.length,
      deltaMinutes: input.deltaMinutes,
    });
    publishEvent(input.businessId, {
      type: "shift.updated",
      shiftId: "bulk",
    });
    return { moved: targets.length };
  }
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

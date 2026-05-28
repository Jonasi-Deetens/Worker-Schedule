import type { PrismaClient } from "@prisma/client";

const MIN_REST_HOURS = 11;
const JOBSTUDENT_WEEKLY_CAP_HOURS = 24;
const MIN_AGE_YEARS = 16;

export interface RuleViolation {
  code:
    | "MIN_REST_BROKEN"
    | "WEEKLY_CAP_EXCEEDED"
    | "AGE_RESTRICTED"
    | "TIME_OFF_CONFLICT";
  message: string;
}

/**
 * Pure-data scheduling rules used by approve/assign/update paths. Each rule
 * returns `null` when fine and a `RuleViolation` when the assignment should
 * be blocked. The caller decides whether violations are hard errors or warnings.
 */
export class SchedulingRules {
  constructor(private readonly db: PrismaClient) {}

  /** Minimum 11 hours between any two assigned shifts. */
  async checkMinRest(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
    options: { excludeShiftId?: string } = {},
  ): Promise<RuleViolation | null> {
    const restMs = MIN_REST_HOURS * 60 * 60 * 1000;
    const windowStart = new Date(candidate.startsAt.getTime() - restMs);
    const windowEnd = new Date(candidate.endsAt.getTime() + restMs);

    const neighbours = await this.db.shiftAssignment.findMany({
      where: {
        userId,
        ...(options.excludeShiftId
          ? { shiftId: { not: options.excludeShiftId } }
          : {}),
        shift: { startsAt: { lt: windowEnd }, endsAt: { gt: windowStart } },
      },
      include: { shift: { select: { startsAt: true, endsAt: true } } },
    });

    for (const n of neighbours) {
      const gapBefore = candidate.startsAt.getTime() - n.shift.endsAt.getTime();
      const gapAfter = n.shift.startsAt.getTime() - candidate.endsAt.getTime();
      const gap = Math.max(gapBefore, gapAfter);
      if (gap >= 0 && gap < restMs) {
        return {
          code: "MIN_REST_BROKEN",
          message: `Less than ${MIN_REST_HOURS}h rest from another shift`,
        };
      }
    }
    return null;
  }

  /** Honors `User.weeklyHourCap` and a hard 24h cap for JOBSTUDENT workers. */
  async checkWeeklyCap(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
  ): Promise<RuleViolation | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { weeklyHourCap: true, contractType: true },
    });
    if (!user) return null;

    const cap =
      user.weeklyHourCap ??
      (user.contractType === "JOBSTUDENT" ? JOBSTUDENT_WEEKLY_CAP_HOURS : null);
    if (!cap) return null;

    const weekStart = startOfWeek(candidate.startsAt);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const assignments = await this.db.shiftAssignment.findMany({
      where: {
        userId,
        shift: { startsAt: { lt: weekEnd, gte: weekStart } },
      },
      include: { shift: { select: { startsAt: true, endsAt: true } } },
    });

    const existingMs = assignments.reduce(
      (sum, a) => sum + (a.shift.endsAt.getTime() - a.shift.startsAt.getTime()),
      0,
    );
    const candidateMs = candidate.endsAt.getTime() - candidate.startsAt.getTime();
    const totalHours = (existingMs + candidateMs) / 3_600_000;

    if (totalHours > cap) {
      return {
        code: "WEEKLY_CAP_EXCEEDED",
        message: `Weekly hour cap (${cap}h) would be exceeded`,
      };
    }
    return null;
  }

  /** Workers must be at least 16 years old at shift start (Belgian baseline). */
  async checkAge(
    userId: string,
    candidate: { startsAt: Date },
  ): Promise<RuleViolation | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });
    if (!user?.birthDate) return null;

    const ageAtShift = yearsBetween(user.birthDate, candidate.startsAt);
    if (ageAtShift < MIN_AGE_YEARS) {
      return {
        code: "AGE_RESTRICTED",
        message: `Worker is under ${MIN_AGE_YEARS} at the shift time`,
      };
    }
    return null;
  }

  /** Approved time-off overlapping the candidate range. */
  async checkTimeOff(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
  ): Promise<RuleViolation | null> {
    const conflict = await this.db.timeOffRequest.findFirst({
      where: {
        userId,
        status: "APPROVED",
        startsAt: { lt: candidate.endsAt },
        endsAt: { gt: candidate.startsAt },
      },
      select: { id: true },
    });
    return conflict
      ? { code: "TIME_OFF_CONFLICT", message: "Worker has approved time-off" }
      : null;
  }

  /** Runs every rule and returns all violations (may be empty). */
  async checkAll(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
    options: { excludeShiftId?: string } = {},
  ): Promise<RuleViolation[]> {
    const results = await Promise.all([
      this.checkMinRest(userId, candidate, options),
      this.checkWeeklyCap(userId, candidate),
      this.checkAge(userId, candidate),
      this.checkTimeOff(userId, candidate),
    ]);
    return results.filter((r): r is RuleViolation => r !== null);
  }
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday-start week
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function yearsBetween(birth: Date, when: Date): number {
  let years = when.getFullYear() - birth.getFullYear();
  const m = when.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && when.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years;
}

import type { PrismaClient } from "@prisma/client";
import { ceilShiftHours } from "@/lib/quarter";
import { StudentQuotaService } from "./student-quota-service";

const MIN_REST_HOURS = 11;
const JOBSTUDENT_WEEKLY_CAP_HOURS = 24;
const MIN_AGE_YEARS = 16;

// ---------------------------------------------------------------------------
// Belgian-aligned youth-labour limits (Phase F). Each is documented as either
// a HARD block (throws in assertAssignable / blocks clock-in) or ADVISORY
// (surfaced as a non-blocking warning). Defaults are conservative — exact
// limits vary by region, joint committee and the worker's exact age, so a
// business may relax them later, but the safe baseline is enforced here.
// ---------------------------------------------------------------------------

/** A worker is a "minor" (stricter youth-labour rules apply) below this age. */
export const MINOR_AGE_YEARS = 18;
/** HARD: minors may not work more than 8 hours on a single day. */
export const MINOR_MAX_DAILY_HOURS = 8;
/** HARD: minors may not work during the night ban window (20:00–06:00). */
export const MINOR_NIGHT_START_HOUR = 20;
export const MINOR_NIGHT_END_HOUR = 6;
/**
 * HARD: documents a student worker must have on file (and not expired) before
 * they can be scheduled, approved or clock in.
 */
export const REQUIRED_STUDENT_DOCUMENT_KINDS = [
  "ID_CARD",
  "ENROLLMENT_CERTIFICATE",
] as const;
/**
 * ADVISORY ONLY: typical school hours/term used to warn (never block) when a
 * student is scheduled during class time. Term excludes the July/August summer
 * break; "school hours" are weekday 08:00–16:00. Institutions differ, so this
 * is intentionally a soft signal.
 */
export const SCHOOL_DAY_START_HOUR = 8;
export const SCHOOL_DAY_END_HOUR = 16;
export const SCHOOL_HOLIDAY_MONTHS = [6, 7] as const; // July, August (0-indexed)

/** Document kind that represents the Belgian Student@Work attestation. */
export const STUDENT_AT_WORK_DOCUMENT_KIND = "STUDENT_AT_WORK_ATTESTATION";

export interface RuleViolation {
  code:
    | "MIN_REST_BROKEN"
    | "WEEKLY_CAP_EXCEEDED"
    | "AGE_RESTRICTED"
    | "TIME_OFF_CONFLICT"
    | "STUDENT_QUOTA_EXCEEDED"
    | "STUDENT_BIRTHDATE_REQUIRED"
    | "MINOR_DAILY_HOURS_EXCEEDED"
    | "MINOR_NIGHT_WORK"
    | "REQUIRED_DOCUMENT_MISSING"
    | "REQUIRED_DOCUMENT_EXPIRED"
    | "STUDENT_ATTESTATION_MISSING"
    | "STUDENT_ATTESTATION_STALE"
    | "SCHOOL_PERIOD_ADVISORY";
  message: string;
}

export interface AssignableOptions {
  excludeShiftId?: string;
  /**
   * When provided, enables the student-quota hard-stop check for JOBSTUDENT
   * workers against this business's `studentQuotaHardStop` setting.
   */
  businessId?: string;
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

  /**
   * Student 650h/year quota HARD STOP. Returns a violation only when the
   * business has `studentQuotaHardStop` enabled, the worker is a JOBSTUDENT, and
   * assigning this candidate's (rounded-up) hours would exceed the remaining
   * quota — preferring the attestation balance when present, else local
   * reserved+worked vs 650. The business's `studentQuotaHardStopBufferHours` is
   * subtracted from the remaining quota first, so a business can stop scheduling
   * a configurable margin before the hard cap. Otherwise returns null (the soft
   * 80/95% warnings are surfaced via the quota widget, not here).
   */
  async checkStudentQuota(
    userId: string,
    businessId: string,
    candidate: { startsAt: Date; endsAt: Date },
  ): Promise<RuleViolation | null> {
    const [user, business] = await Promise.all([
      this.db.user.findUnique({
        where: { id: userId },
        select: { contractType: true },
      }),
      this.db.business.findUnique({
        where: { id: businessId },
        select: {
          studentQuotaHardStop: true,
          studentQuotaHardStopBufferHours: true,
        },
      }),
    ]);
    if (user?.contractType !== "JOBSTUDENT") return null;
    if (!business?.studentQuotaHardStop) return null;

    const additionalHours = ceilShiftHours(
      candidate.startsAt,
      candidate.endsAt,
    );
    const year = candidate.startsAt.getUTCFullYear();
    const remaining = await new StudentQuotaService(this.db).getRemainingHours({
      userId,
      year,
    });
    const buffer = Math.max(0, business.studentQuotaHardStopBufferHours ?? 0);
    if (additionalHours > remaining - buffer) {
      return {
        code: "STUDENT_QUOTA_EXCEEDED",
        message: "errors.studentQuotaExceeded",
      };
    }
    return null;
  }

  /**
   * HARD: when the business has `requireStudentAttestation` enabled, a
   * JOBSTUDENT may only be assigned if a Student@Work attestation document is on
   * file and not stale. Staleness is measured from the attestation's upload
   * (`createdAt`) against the business's `attestationMaxAgeDays`, evaluated as of
   * the shift date. Returns "missing" when none exists, "stale" when the most
   * recent one is older than the allowed age. Non-students and businesses that
   * have not enabled the requirement are unaffected.
   */
  async checkStudentAttestation(
    userId: string,
    businessId: string,
    candidate: { startsAt: Date },
  ): Promise<RuleViolation | null> {
    const [user, business] = await Promise.all([
      this.db.user.findUnique({
        where: { id: userId },
        select: { contractType: true },
      }),
      this.db.business.findUnique({
        where: { id: businessId },
        select: {
          requireStudentAttestation: true,
          attestationMaxAgeDays: true,
        },
      }),
    ]);
    if (user?.contractType !== "JOBSTUDENT") return null;
    if (!business?.requireStudentAttestation) return null;

    const latest = await this.db.document.findFirst({
      where: { userId, kind: STUDENT_AT_WORK_DOCUMENT_KIND },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!latest) {
      return {
        code: "STUDENT_ATTESTATION_MISSING",
        message: "errors.studentAttestationMissing",
      };
    }

    const maxAgeDays = Math.max(1, business.attestationMaxAgeDays ?? 365);
    const staleBefore = new Date(
      candidate.startsAt.getTime() - maxAgeDays * 86_400_000,
    );
    if (latest.createdAt < staleBefore) {
      return {
        code: "STUDENT_ATTESTATION_STALE",
        message: "errors.studentAttestationStale",
      };
    }
    return null;
  }

  /**
   * HARD: a JOBSTUDENT must have a birth date on file, otherwise age-based
   * youth-labour rules cannot be evaluated. Non-students are unaffected.
   */
  async checkStudentBirthDateRequired(
    userId: string,
    _candidate: { startsAt: Date; endsAt: Date },
  ): Promise<RuleViolation | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { contractType: true, birthDate: true },
    });
    if (user?.contractType !== "JOBSTUDENT") return null;
    if (user.birthDate) return null;
    return {
      code: "STUDENT_BIRTHDATE_REQUIRED",
      message: "errors.studentBirthDateRequired",
    };
  }

  /**
   * HARD: a minor (under 18 at the shift date) may not work more than
   * {@link MINOR_MAX_DAILY_HOURS} hours on a single calendar day. Aggregates
   * the candidate with the worker's other assignments starting that day.
   */
  async checkMinorDailyHours(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
    options: { excludeShiftId?: string } = {},
  ): Promise<RuleViolation | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });
    if (!user?.birthDate) return null;
    if (yearsBetween(user.birthDate, candidate.startsAt) >= MINOR_AGE_YEARS) {
      return null;
    }

    const dayStart = startOfUtcDay(candidate.startsAt);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const sameDay = await this.db.shiftAssignment.findMany({
      where: {
        userId,
        ...(options.excludeShiftId
          ? { shiftId: { not: options.excludeShiftId } }
          : {}),
        shift: { startsAt: { gte: dayStart, lt: dayEnd } },
      },
      include: { shift: { select: { startsAt: true, endsAt: true } } },
    });

    const existingMs = sameDay.reduce(
      (sum, a) => sum + (a.shift.endsAt.getTime() - a.shift.startsAt.getTime()),
      0,
    );
    const candidateMs = candidate.endsAt.getTime() - candidate.startsAt.getTime();
    const totalHours = (existingMs + candidateMs) / 3_600_000;
    if (totalHours > MINOR_MAX_DAILY_HOURS) {
      return {
        code: "MINOR_DAILY_HOURS_EXCEEDED",
        message: "errors.minorDailyHoursExceeded",
      };
    }
    return null;
  }

  /**
   * HARD: a minor may not work during the night ban window
   * ({@link MINOR_NIGHT_START_HOUR}:00–{@link MINOR_NIGHT_END_HOUR}:00). Hours
   * are evaluated against the shift's stored timestamps.
   */
  async checkMinorNightWork(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
  ): Promise<RuleViolation | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });
    if (!user?.birthDate) return null;
    if (yearsBetween(user.birthDate, candidate.startsAt) >= MINOR_AGE_YEARS) {
      return null;
    }
    if (overlapsNightBan(candidate.startsAt, candidate.endsAt)) {
      return { code: "MINOR_NIGHT_WORK", message: "errors.minorNightWork" };
    }
    return null;
  }

  /**
   * HARD: a student worker must have every {@link REQUIRED_STUDENT_DOCUMENT_KINDS}
   * document on file and unexpired as of the shift date. Returns the first
   * problem found (missing wins over expired). Non-students are unaffected.
   */
  async checkRequiredDocuments(
    userId: string,
    candidate: { startsAt: Date },
  ): Promise<RuleViolation | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { contractType: true },
    });
    if (user?.contractType !== "JOBSTUDENT") return null;

    const docs =
      (await this.db.document.findMany({
        where: {
          userId,
          kind: { in: [...REQUIRED_STUDENT_DOCUMENT_KINDS] },
        },
        select: { kind: true, expiresOn: true },
      })) ?? [];

    for (const kind of REQUIRED_STUDENT_DOCUMENT_KINDS) {
      const forKind = docs.filter((d) => d.kind === kind);
      if (forKind.length === 0) {
        return {
          code: "REQUIRED_DOCUMENT_MISSING",
          message: "errors.requiredDocumentMissing",
        };
      }
      // A kind is valid if at least one document is non-expiring or not yet
      // expired at the shift date.
      const valid = forKind.some(
        (d) => !d.expiresOn || d.expiresOn >= candidate.startsAt,
      );
      if (!valid) {
        return {
          code: "REQUIRED_DOCUMENT_EXPIRED",
          message: "errors.requiredDocumentExpired",
        };
      }
    }
    return null;
  }

  /**
   * ADVISORY (never blocks): warns when a student is scheduled during typical
   * school hours/term. Returns a violation-shaped advisory or null.
   */
  async schoolPeriodAdvisory(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
  ): Promise<RuleViolation | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { contractType: true },
    });
    if (user?.contractType !== "JOBSTUDENT") return null;

    const day = candidate.startsAt.getUTCDay(); // 0 Sun .. 6 Sat
    const month = candidate.startsAt.getUTCMonth();
    const hour = candidate.startsAt.getUTCHours();
    const isWeekday = day >= 1 && day <= 5;
    const inTerm = !SCHOOL_HOLIDAY_MONTHS.includes(
      month as (typeof SCHOOL_HOLIDAY_MONTHS)[number],
    );
    const inSchoolHours =
      hour >= SCHOOL_DAY_START_HOUR && hour < SCHOOL_DAY_END_HOUR;
    if (isWeekday && inTerm && inSchoolHours) {
      return {
        code: "SCHOOL_PERIOD_ADVISORY",
        message: "errors.schoolPeriodAdvisory",
      };
    }
    return null;
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

  /**
   * Hard-enforcement entrypoint shared by every path that commits an
   * assignment (approve, direct assign, broadcast accept, swap accept). Runs
   * {@link checkAll} and throws when any rule is violated, so callers cannot
   * accidentally forget to enforce a subset of the rules. The thrown message
   * is the concatenation of all violation messages and is mapped to a
   * user-facing error by the tRPC layer.
   */
  async assertAssignable(
    userId: string,
    candidate: { startsAt: Date; endsAt: Date },
    options: AssignableOptions = {},
  ): Promise<void> {
    // The student-quota hard stop throws a standalone localized key so the
    // tRPC layer surfaces `errors.studentQuotaExceeded` cleanly.
    if (options.businessId) {
      const quota = await this.checkStudentQuota(
        userId,
        options.businessId,
        candidate,
      );
      if (quota) throw new Error(quota.message);

      const attestation = await this.checkStudentAttestation(
        userId,
        options.businessId,
        candidate,
      );
      if (attestation) throw new Error(attestation.message);
    }

    // Phase F youth-labour / eligibility hard stops. Each maps to a single
    // localized `errors.*` key, so they are evaluated individually (not joined)
    // to keep `mapServiceError` happy. Order: birth-date prerequisite first,
    // then documents, then the minor-specific limits.
    const keyed =
      (await this.checkStudentBirthDateRequired(userId, candidate)) ??
      (await this.checkRequiredDocuments(userId, candidate)) ??
      (await this.checkMinorDailyHours(userId, candidate, options)) ??
      (await this.checkMinorNightWork(userId, candidate));
    if (keyed) throw new Error(keyed.message);

    const violations = await this.checkAll(userId, candidate, options);
    if (violations.length > 0) {
      throw new Error(violations.map((v) => v.message).join("; "));
    }
  }
}

/** Midnight (UTC) of the day that `d` falls on. */
function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

/**
 * True when any part of the half-open interval [start, end) falls inside the
 * nightly minor work-ban window (>= 20:00 or < 06:00), evaluated in UTC.
 */
function overlapsNightBan(start: Date, end: Date): boolean {
  const inBan = (d: Date) => {
    const h = d.getUTCHours();
    return h >= MINOR_NIGHT_START_HOUR || h < MINOR_NIGHT_END_HOUR;
  };
  if (inBan(start)) return true;
  // start is within the allowed daytime band [06:00, 20:00); the next ban
  // boundary is 20:00 on start's day. Any work past it enters the ban.
  const nextBan = new Date(start);
  nextBan.setUTCHours(MINOR_NIGHT_START_HOUR, 0, 0, 0);
  return end > nextBan;
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

import type { PrismaClient, StudentRegion } from "@prisma/client";
import { ceilShiftHours, quarterOf } from "@/lib/quarter";
import {
  computeRegionalAdvisory,
  type RegionalAdvisory,
} from "@/lib/regional-limits";

/** Belgian student-worker quota: 650 hours per calendar year, all employers. */
export const STUDENT_QUOTA_HOURS = 650;

/** Warning thresholds (fraction of the 650h quota used). */
export const QUOTA_WARN_80 = 0.8;
export const QUOTA_WARN_95 = 0.95;

export interface QuotaUsage {
  year: number;
  limit: number;
  reservedHours: number;
  workedHours: number;
  /** Manually-entered national remaining balance, when an attestation exists. */
  attestationBalanceHours: number | null;
  attestationUploadedAt: Date | null;
  /** Hours considered "used" toward the 650h cap (drives the % indicator). */
  usedHours: number;
  /** Hours still available before hitting the cap (can go negative). */
  remainingHours: number;
  percentUsed: number;
  /** "ok" | "warn80" | "warn95" | "exceeded". */
  level: "ok" | "warn80" | "warn95" | "exceeded";
}

/**
 * Student-worker 650h/calendar-year quota ledger. Tracks this employer's
 * reserved (planned STU) and worked (approved) hours and the manually-entered
 * national Student@Work balance. The national remaining balance is NOT
 * API-readable, so when an attestation balance is present it is the source of
 * truth for "remaining"; otherwise we fall back to local `reserved + worked`.
 */
export class StudentQuotaService {
  constructor(private readonly db: PrismaClient) {}

  private yearRange(year: number): { start: Date; end: Date } {
    return {
      start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
    };
  }

  /**
   * Recomputes reserved hours (sum of this employer's non-cancelled STU planned
   * hours for the year) and worked hours (approved time entries in the year),
   * persisting them on the (user, year) ledger row.
   */
  async recompute(input: { userId: string; businessId: string; year: number }) {
    const { start, end } = this.yearRange(input.year);

    const [stuDeclarations, timeEntries] = await Promise.all([
      this.db.dimonaStuDeclaration.findMany({
        where: {
          userId: input.userId,
          businessId: input.businessId,
          year: input.year,
          status: { not: "CANCELLED" },
        },
        select: { plannedHours: true },
      }),
      this.db.timeEntry.findMany({
        where: {
          userId: input.userId,
          status: "APPROVED",
          clockInAt: { gte: start, lt: end },
          clockOutAt: { not: null },
        },
        select: { clockInAt: true, clockOutAt: true, breakMinutes: true },
      }),
    ]);

    const reservedHours = stuDeclarations.reduce(
      (sum, d) => sum + d.plannedHours,
      0,
    );

    const workedMs = timeEntries.reduce((sum, e) => {
      if (!e.clockOutAt) return sum;
      const gross = e.clockOutAt.getTime() - e.clockInAt.getTime();
      const net = gross - e.breakMinutes * 60_000;
      return sum + Math.max(0, net);
    }, 0);
    const workedHours = Math.round(workedMs / 3_600_000);

    return this.db.studentQuota.upsert({
      where: { userId_year: { userId: input.userId, year: input.year } },
      update: { businessId: input.businessId, reservedHours, workedHours },
      create: {
        userId: input.userId,
        businessId: input.businessId,
        year: input.year,
        reservedHours,
        workedHours,
      },
    });
  }

  /**
   * Records the national remaining balance from the student's Student@Work
   * attestation (not API-readable, so entered manually) and stamps the upload
   * time. Recomputes reserved/worked first so the row is coherent.
   */
  async setAttestationBalance(input: {
    userId: string;
    businessId: string;
    year: number;
    balanceHours: number | null;
  }) {
    await this.recompute({
      userId: input.userId,
      businessId: input.businessId,
      year: input.year,
    });
    return this.db.studentQuota.update({
      where: { userId_year: { userId: input.userId, year: input.year } },
      data: {
        studentAtWorkBalanceHours: input.balanceHours,
        attestationUploadedAt: input.balanceHours === null ? null : new Date(),
      },
    });
  }

  /** Derives the warning level + remaining hours from a ledger row's numbers. */
  static deriveUsage(
    year: number,
    row: {
      reservedHours: number;
      workedHours: number;
      studentAtWorkBalanceHours: number | null;
      attestationUploadedAt: Date | null;
    } | null,
  ): QuotaUsage {
    const reservedHours = row?.reservedHours ?? 0;
    const workedHours = row?.workedHours ?? 0;
    const attestationBalanceHours = row?.studentAtWorkBalanceHours ?? null;

    const localUsed = reservedHours + workedHours;
    const remainingHours =
      attestationBalanceHours !== null
        ? attestationBalanceHours
        : STUDENT_QUOTA_HOURS - localUsed;
    const usedHours = STUDENT_QUOTA_HOURS - remainingHours;
    const percentUsed = usedHours / STUDENT_QUOTA_HOURS;

    let level: QuotaUsage["level"] = "ok";
    if (remainingHours < 0) level = "exceeded";
    else if (percentUsed >= QUOTA_WARN_95) level = "warn95";
    else if (percentUsed >= QUOTA_WARN_80) level = "warn80";

    return {
      year,
      limit: STUDENT_QUOTA_HOURS,
      reservedHours,
      workedHours,
      attestationBalanceHours,
      attestationUploadedAt: row?.attestationUploadedAt ?? null,
      usedHours,
      remainingHours,
      percentUsed: Math.round(percentUsed * 1000) / 1000,
      level,
    };
  }

  /** Returns the current quota usage for (user, year), recomputing first. */
  async getUsage(input: {
    userId: string;
    businessId: string;
    year: number;
  }): Promise<QuotaUsage> {
    const row = await this.recompute(input);
    return StudentQuotaService.deriveUsage(input.year, row);
  }

  /**
   * Advisory regional secondary limits for the worker's region, computed from
   * the year's active assignments (planned hours per quarter and per month,
   * each shift's started hour rounded up). Never blocks — for display only.
   */
  async getRegionalAdvisory(input: {
    userId: string;
    businessId: string;
    year: number;
    region: StudentRegion;
  }): Promise<RegionalAdvisory> {
    const { start, end } = this.yearRange(input.year);
    const assignments = await this.db.shiftAssignment.findMany({
      where: {
        userId: input.userId,
        status: { in: ["CONFIRMED", "PENDING_RECONFIRMATION"] },
        shift: {
          businessId: input.businessId,
          status: { not: "CANCELLED" },
          startsAt: { gte: start, lt: end },
        },
      },
      include: { shift: { select: { startsAt: true, endsAt: true } } },
    });

    const quarterHours = [0, 0, 0, 0];
    const monthHours = Array.from({ length: 12 }, () => 0);
    for (const a of assignments) {
      const hours = ceilShiftHours(a.shift.startsAt, a.shift.endsAt);
      const { quarter } = quarterOf(a.shift.startsAt);
      quarterHours[quarter - 1] += hours;
      monthHours[a.shift.startsAt.getUTCMonth()] += hours;
    }
    return computeRegionalAdvisory(input.region, { quarterHours, monthHours });
  }

  /**
   * Remaining quota for (user, year) WITHOUT recomputing (cheap, read-only).
   * Prefers the attestation balance when present, else local reserved+worked.
   * Returns the full 650h when there is no ledger row yet.
   */
  async getRemainingHours(input: {
    userId: string;
    year: number;
  }): Promise<number> {
    const row = await this.db.studentQuota.findUnique({
      where: { userId_year: { userId: input.userId, year: input.year } },
      select: {
        reservedHours: true,
        workedHours: true,
        studentAtWorkBalanceHours: true,
        attestationUploadedAt: true,
      },
    });
    return StudentQuotaService.deriveUsage(input.year, row).remainingHours;
  }
}

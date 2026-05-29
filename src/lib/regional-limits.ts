import type { StudentRegion } from "@prisma/client";

/**
 * Belgian *regional* secondary student-work limits. These are ADVISORY only —
 * they never block scheduling; the binding cap is the federal 650h/year quota.
 *
 * - Brussels: 240h per quarter.
 * - Wallonia: an extra 240h per quarter (treated as a 240h/quarter indicator).
 * - Flanders: an extra 80h per month beyond the federal quota.
 * - East Belgium: no annual cap.
 */
export type RegionalLimitType = "quarter" | "month" | "none";

export interface RegionalPeriodIndicator {
  /** "Q1".."Q4" for quarter limits, "1".."12" for month limits. */
  label: string;
  hours: number;
  limit: number;
  exceeded: boolean;
}

export interface RegionalAdvisory {
  region: StudentRegion;
  limitType: RegionalLimitType;
  /** Per-period hour ceiling (0 when there is no cap). */
  limitHours: number;
  periods: RegionalPeriodIndicator[];
}

const QUARTER_LIMITS: Partial<Record<StudentRegion, number>> = {
  BRUSSELS: 240,
  WALLONIA: 240,
};
const MONTH_LIMITS: Partial<Record<StudentRegion, number>> = {
  FLANDERS: 80,
};

/**
 * Pure regional advisory calculation. `quarterHours` is a length-4 array
 * (Q1..Q4) and `monthHours` a length-12 array (Jan..Dec) of planned hours.
 */
export function computeRegionalAdvisory(
  region: StudentRegion,
  hours: { quarterHours: number[]; monthHours: number[] },
): RegionalAdvisory {
  const quarterLimit = QUARTER_LIMITS[region];
  if (quarterLimit !== undefined) {
    return {
      region,
      limitType: "quarter",
      limitHours: quarterLimit,
      periods: hours.quarterHours.map((h, i) => ({
        label: `Q${i + 1}`,
        hours: h,
        limit: quarterLimit,
        exceeded: h > quarterLimit,
      })),
    };
  }

  const monthLimit = MONTH_LIMITS[region];
  if (monthLimit !== undefined) {
    return {
      region,
      limitType: "month",
      limitHours: monthLimit,
      periods: hours.monthHours.map((h, i) => ({
        label: String(i + 1),
        hours: h,
        limit: monthLimit,
        exceeded: h > monthLimit,
      })),
    };
  }

  return { region, limitType: "none", limitHours: 0, periods: [] };
}

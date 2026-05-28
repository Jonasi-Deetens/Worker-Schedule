import type { PrismaClient } from "@prisma/client";

interface CandidateScore {
  userId: string;
  name: string;
  score: number;
  reasons: { label: string; weight: number }[];
}

/**
 * Rule-based ranker that scores workers for a given shift. Higher is better.
 * Weights are deliberately small integers so a planner can reason about why
 * worker A outranked worker B at a glance.
 */
const WEIGHTS = {
  skillMatch: 5,
  available: 4,
  notExceedingCap: 3,
  recency: 2,
  noOverlap: 5,
  hasTimeOff: -10,
};

export class StaffingSuggestionsService {
  constructor(private readonly db: PrismaClient) {}

  async rankForShift(shiftId: string) {
    const shift = await this.db.shift.findUnique({
      where: { id: shiftId },
      include: { requiredSkill: true },
    });
    if (!shift) throw new Error("Shift not found");

    const workers = await this.db.user.findMany({
      where: {
        businessId: shift.businessId,
        role: { in: ["WORKER", "MANAGER"] },
        status: "ACTIVE",
      },
      include: { skills: true },
    });

    const weekStart = new Date(shift.startsAt);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const scores: CandidateScore[] = [];
    for (const w of workers) {
      const reasons: { label: string; weight: number }[] = [];
      let score = 0;

      const skillOk =
        !shift.requiredSkillId ||
        w.skills.some((s) => s.skillId === shift.requiredSkillId);
      if (skillOk && shift.requiredSkillId) {
        score += WEIGHTS.skillMatch;
        reasons.push({ label: "skill match", weight: WEIGHTS.skillMatch });
      } else if (shift.requiredSkillId) {
        continue;
      }

      const availability = await this.db.availability.findFirst({
        where: {
          userId: w.id,
          startsAt: { lte: shift.startsAt },
          endsAt: { gte: shift.endsAt },
        },
      });
      if (availability) {
        score += WEIGHTS.available;
        reasons.push({ label: "marked available", weight: WEIGHTS.available });
      }

      const overlap = await this.db.shiftAssignment.findFirst({
        where: {
          userId: w.id,
          shift: {
            startsAt: { lt: shift.endsAt },
            endsAt: { gt: shift.startsAt },
          },
        },
      });
      if (overlap) continue;
      score += WEIGHTS.noOverlap;
      reasons.push({ label: "no overlap", weight: WEIGHTS.noOverlap });

      const timeOff = await this.db.timeOffRequest.findFirst({
        where: {
          userId: w.id,
          status: "APPROVED",
          startsAt: { lt: shift.endsAt },
          endsAt: { gt: shift.startsAt },
        },
      });
      if (timeOff) continue;

      const weekly = await this.db.shiftAssignment.findMany({
        where: {
          userId: w.id,
          shift: { startsAt: { gte: weekStart, lt: weekEnd } },
        },
        include: { shift: true },
      });
      const hoursSoFar = weekly.reduce(
        (acc, a) =>
          acc + (a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 3_600_000,
        0,
      );
      const shiftHours =
        (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
      const cap = w.weeklyHourCap ?? (w.contractType === "JOBSTUDENT" ? 24 : 48);
      if (hoursSoFar + shiftHours <= cap) {
        score += WEIGHTS.notExceedingCap;
        reasons.push({
          label: `under ${cap}h cap`,
          weight: WEIGHTS.notExceedingCap,
        });
      }

      const last = await this.db.shiftAssignment.findFirst({
        where: { userId: w.id },
        orderBy: { shift: { endsAt: "desc" } },
        include: { shift: true },
      });
      if (!last) {
        score += WEIGHTS.recency;
        reasons.push({ label: "needs hours", weight: WEIGHTS.recency });
      } else {
        const daysSince =
          (Date.now() - last.shift.endsAt.getTime()) / 86_400_000;
        if (daysSince > 14) {
          score += WEIGHTS.recency;
          reasons.push({
            label: "not worked in 2+ weeks",
            weight: WEIGHTS.recency,
          });
        }
      }

      scores.push({ userId: w.id, name: w.name, score, reasons });
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, 10);
  }
}

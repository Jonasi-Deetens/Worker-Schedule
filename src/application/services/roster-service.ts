import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";

export interface RosterShiftInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roleLabel: string;
  requiredSpots: number;
  notes?: string | null;
}

/**
 * Weekly roster templates: a set of recurring shifts that an owner can apply
 * to any week in one click. Generated shifts are created as drafts so the
 * owner can review and `publishRange` them.
 */
export class RosterService {
  constructor(private readonly db: PrismaClient) {}

  async list(businessId: string) {
    return this.db.rosterTemplate.findMany({
      where: { businessId },
      include: { shifts: true, _count: { select: { shifts: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(input: {
    businessId: string;
    name: string;
    shifts: RosterShiftInput[];
  }) {
    return this.db.rosterTemplate.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        shifts: {
          create: input.shifts.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            roleLabel: s.roleLabel,
            requiredSpots: s.requiredSpots,
            notes: s.notes ?? null,
          })),
        },
      },
      include: { shifts: true },
    });
  }

  async delete(input: { id: string; businessId: string }) {
    const existing = await this.db.rosterTemplate.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) throw new Error("Roster template not found");
    await this.db.rosterTemplate.delete({ where: { id: input.id } });
  }

  async applyToWeek(input: {
    businessId: string;
    ownerId: string;
    rosterId: string;
    weekStart: Date;
  }) {
    const roster = await this.db.rosterTemplate.findFirst({
      where: { id: input.rosterId, businessId: input.businessId },
      include: { shifts: true },
    });
    if (!roster) throw new Error("Roster template not found");

    const created: string[] = [];
    for (const tpl of roster.shifts) {
      const dayOffset = (tpl.dayOfWeek - input.weekStart.getDay() + 7) % 7;
      const day = new Date(input.weekStart);
      day.setDate(day.getDate() + dayOffset);
      const [sh, sm] = tpl.startTime.split(":").map(Number);
      const [eh, em] = tpl.endTime.split(":").map(Number);
      const startsAt = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        sh ?? 0,
        sm ?? 0,
      );
      const endsAt = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        eh ?? 0,
        em ?? 0,
      );
      if (endsAt <= startsAt) continue;
      const shift = await this.db.shift.create({
        data: {
          businessId: input.businessId,
          startsAt,
          endsAt,
          roleLabel: tpl.roleLabel,
          requiredSpots: tpl.requiredSpots,
          notes: tpl.notes,
          publishedAt: null,
        },
      });
      created.push(shift.id);
    }

    logger.info({
      event: "roster.applied",
      rosterId: roster.id,
      count: created.length,
    });
    return { created: created.length, ids: created };
  }
}

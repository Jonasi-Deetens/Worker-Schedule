import type { ContractType, PrismaClient, UserStatus } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";

export class WorkerService {
  constructor(private readonly db: PrismaClient) {}

  async list(businessId: string) {
    return this.db.user.findMany({
      where: { businessId, role: { in: ["WORKER", "MANAGER"] } },
      include: { skills: { include: { skill: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
  }

  async get(input: { id: string; businessId: string }) {
    const user = await this.db.user.findFirst({
      where: { id: input.id, businessId: input.businessId },
      include: {
        skills: { include: { skill: true } },
        assignments: {
          include: {
            shift: { select: { id: true, startsAt: true, endsAt: true, roleLabel: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!user) throw new Error("Worker not found");
    return user;
  }

  async stats(input: { id: string; businessId: string }) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

    const [thisMonth, thisYear, upcoming, attendanceWindow, noShowsAllTime] =
      await Promise.all([
        this.aggregateHours(input.id, input.businessId, startOfMonth, now),
        this.aggregateHours(input.id, input.businessId, startOfYear, now),
        this.db.shiftAssignment.count({
          where: {
            userId: input.id,
            shift: { businessId: input.businessId, startsAt: { gt: now } },
          },
        }),
        this.db.shiftAssignment.groupBy({
          by: ["attendance"],
          where: {
            userId: input.id,
            shift: {
              businessId: input.businessId,
              startsAt: { gte: ninetyDaysAgo, lte: now },
            },
            attendance: { not: null },
          },
          _count: { _all: true },
        }),
        this.db.shiftAssignment.count({
          where: {
            userId: input.id,
            shift: { businessId: input.businessId },
            attendance: "NO_SHOW",
          },
        }),
      ]);

    let attendanceTotal = 0;
    let attendanceNoShow = 0;
    for (const row of attendanceWindow as Array<{
      attendance: string | null;
      _count: { _all: number };
    }>) {
      attendanceTotal += row._count._all;
      if (row.attendance === "NO_SHOW") attendanceNoShow += row._count._all;
    }
    const noShowRate90d =
      attendanceTotal === 0
        ? 0
        : Math.round((attendanceNoShow / attendanceTotal) * 1000) / 10;

    return {
      hoursThisMonth: thisMonth,
      hoursThisYear: thisYear,
      upcoming,
      noShowsAllTime,
      noShowsLast90d: attendanceNoShow,
      attendanceMarkedLast90d: attendanceTotal,
      noShowRate90d,
    };
  }

  /**
   * Documents owned by this worker, ordered with the soonest-expiring first
   * so the UI can highlight items that need renewing.
   */
  async documents(input: { id: string; businessId: string }) {
    const docs = await this.db.document.findMany({
      where: { userId: input.id, user: { businessId: input.businessId } },
      orderBy: [
        { expiresOn: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
    });
    return docs;
  }

  /**
   * Computes total scheduled hours from approved assignments inside a range.
   * Uses raw shift times - actual hours (from time entries) are a Phase 6 feature.
   */
  async aggregateHours(
    userId: string,
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const assignments = await this.db.shiftAssignment.findMany({
      where: {
        userId,
        shift: {
          businessId,
          startsAt: { gte: from, lte: to },
          status: { not: "CANCELLED" },
        },
      },
      include: { shift: { select: { startsAt: true, endsAt: true } } },
    });
    const ms = assignments.reduce(
      (sum, a) => sum + (a.shift.endsAt.getTime() - a.shift.startsAt.getTime()),
      0,
    );
    return Math.round((ms / 3_600_000) * 100) / 100;
  }

  async updateProfile(input: {
    id: string;
    businessId: string;
    actorId: string;
    name?: string;
    phone?: string | null;
    contractType?: ContractType | null;
    hourlyRate?: number | null;
    weeklyHourCap?: number | null;
    birthDate?: Date | null;
  }) {
    const worker = await this.db.user.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!worker) throw new Error("Worker not found");

    return this.db.user.update({
      where: { id: input.id },
      data: {
        name: input.name,
        phone: input.phone,
        contractType: input.contractType,
        hourlyRate: input.hourlyRate ?? undefined,
        weeklyHourCap: input.weeklyHourCap,
        birthDate: input.birthDate,
      },
    });
  }

  async setStatus(input: {
    id: string;
    businessId: string;
    actorId: string;
    status: UserStatus;
  }) {
    const worker = await this.db.user.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!worker) throw new Error("Worker not found");

    const updated = await this.db.user.update({
      where: { id: input.id },
      data: { status: input.status },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: input.status === "ARCHIVED" ? "WORKER_ARCHIVED" : "WORKER_SUSPENDED",
        entityType: "User",
        entityId: worker.id,
        metadata: { status: input.status },
      },
    });

    logger.info({
      event: "worker.statusChanged",
      workerId: worker.id,
      status: input.status,
    });

    return updated;
  }

  async setSkills(input: {
    userId: string;
    businessId: string;
    skillIds: string[];
  }) {
    const worker = await this.db.user.findFirst({
      where: { id: input.userId, businessId: input.businessId },
    });
    if (!worker) throw new Error("Worker not found");

    const validSkills = await this.db.skill.findMany({
      where: { id: { in: input.skillIds }, businessId: input.businessId },
      select: { id: true },
    });
    const validIds = new Set(validSkills.map((s) => s.id));

    await this.db.$transaction([
      this.db.userSkill.deleteMany({ where: { userId: input.userId } }),
      this.db.userSkill.createMany({
        data: input.skillIds
          .filter((id) => validIds.has(id))
          .map((skillId) => ({ userId: input.userId, skillId })),
        skipDuplicates: true,
      }),
    ]);

    return this.db.user.findUnique({
      where: { id: input.userId },
      include: { skills: { include: { skill: true } } },
    });
  }
}

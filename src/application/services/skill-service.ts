import type { PrismaClient } from "@prisma/client";

export class SkillService {
  constructor(private readonly db: PrismaClient) {}

  async list(businessId: string) {
    return this.db.skill.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
      include: { _count: { select: { workers: true } } },
    });
  }

  async create(input: { businessId: string; name: string; color?: string }) {
    if (input.name.trim().length === 0) throw new Error("Skill name required");
    return this.db.skill.create({
      data: {
        businessId: input.businessId,
        name: input.name.trim(),
        color: input.color ?? "#6366f1",
      },
    });
  }

  async update(input: {
    id: string;
    businessId: string;
    name?: string;
    color?: string;
  }) {
    const existing = await this.db.skill.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) throw new Error("Skill not found");
    return this.db.skill.update({
      where: { id: input.id },
      data: { name: input.name, color: input.color },
    });
  }

  async delete(input: { id: string; businessId: string }) {
    const existing = await this.db.skill.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) throw new Error("Skill not found");
    await this.db.skill.delete({ where: { id: input.id } });
  }
}

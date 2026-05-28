import type { PrismaClient } from "@prisma/client";

export interface TemplateInput {
  name: string;
  roleLabel: string;
  requiredSpots: number;
  defaultStart: string;
  defaultEnd: string;
  notes?: string | null;
}

/**
 * CRUD for owner-defined shift templates. Templates are reusable presets the
 * shift creation dialog can pre-fill from; they do not perform recurrence
 * expansion themselves (that lives in `ShiftService.createRecurring`).
 */
export class TemplateService {
  constructor(private readonly db: PrismaClient) {}

  async list(businessId: string) {
    return this.db.shiftTemplate.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
  }

  async create(input: { businessId: string } & TemplateInput) {
    return this.db.shiftTemplate.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        defaultStart: input.defaultStart,
        defaultEnd: input.defaultEnd,
        notes: input.notes ?? null,
      },
    });
  }

  async update(input: { id: string; businessId: string } & Partial<TemplateInput>) {
    const existing = await this.db.shiftTemplate.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) {
      throw new Error("Template not found");
    }
    return this.db.shiftTemplate.update({
      where: { id: input.id },
      data: {
        name: input.name,
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        defaultStart: input.defaultStart,
        defaultEnd: input.defaultEnd,
        notes: input.notes ?? undefined,
      },
    });
  }

  async delete(input: { id: string; businessId: string }) {
    const existing = await this.db.shiftTemplate.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) {
      throw new Error("Template not found");
    }
    await this.db.shiftTemplate.delete({ where: { id: input.id } });
    return { success: true };
  }
}

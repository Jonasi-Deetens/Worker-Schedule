import { beforeEach, describe, expect, it } from "vitest";
import { TemplateService } from "@/application/services/template-service";
import {
  asPrisma,
  createPrismaMock,
  type PrismaMock,
} from "../../helpers/mock-prisma";

const BUSINESS_ID = "biz-1";

let prisma: PrismaMock;
let service: TemplateService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new TemplateService(asPrisma(prisma));
});

describe("TemplateService", () => {
  it("lists templates scoped to a business", async () => {
    prisma.shiftTemplate.findMany.mockResolvedValue([]);
    await service.list(BUSINESS_ID);
    expect(prisma.shiftTemplate.findMany).toHaveBeenCalledWith({
      where: { businessId: BUSINESS_ID },
      orderBy: { name: "asc" },
    });
  });

  it("creates a template with the expected payload", async () => {
    prisma.shiftTemplate.create.mockResolvedValue({ id: "tpl-1" });
    await service.create({
      businessId: BUSINESS_ID,
      name: "Friday Rush",
      roleLabel: "Bartender",
      requiredSpots: 2,
      defaultStart: "17:00",
      defaultEnd: "23:00",
    });
    expect(prisma.shiftTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: BUSINESS_ID,
          name: "Friday Rush",
          defaultStart: "17:00",
        }),
      }),
    );
  });

  it("rejects updating a template owned by a different business", async () => {
    prisma.shiftTemplate.findFirst.mockResolvedValue(null);
    await expect(
      service.update({ id: "tpl-x", businessId: BUSINESS_ID, name: "x" }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects deleting an unknown template", async () => {
    prisma.shiftTemplate.findFirst.mockResolvedValue(null);
    await expect(
      service.delete({ id: "tpl-x", businessId: BUSINESS_ID }),
    ).rejects.toThrow(/not found/);
  });
});

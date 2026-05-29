import { beforeEach, describe, expect, it } from "vitest";
import { SkillService } from "@/application/services/skill-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

let db: PrismaMock;
let service: SkillService;

beforeEach(() => {
  db = createPrismaMock();
  service = new SkillService(asPrisma(db));
});

describe("SkillService.list", () => {
  it("scopes to the business and includes worker counts", async () => {
    db.skill.findMany.mockResolvedValue([]);
    await service.list("b1");
    const arg = db.skill.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ businessId: "b1" });
    expect(arg.include).toMatchObject({ _count: { select: { workers: true } } });
  });
});

describe("SkillService.create", () => {
  it("trims the name and defaults the colour", async () => {
    db.skill.create.mockResolvedValue({ id: "s1" });
    await service.create({ businessId: "b1", name: "  Bar  " });
    const data = db.skill.create.mock.calls[0][0].data;
    expect(data.name).toBe("Bar");
    expect(data.color).toBe("#6366f1");
    expect(data.businessId).toBe("b1");
  });

  it("rejects an empty name", async () => {
    await expect(
      service.create({ businessId: "b1", name: "   " }),
    ).rejects.toThrow(/required/i);
    expect(db.skill.create).not.toHaveBeenCalled();
  });
});

describe("SkillService.update", () => {
  it("rejects updating a skill from another business", async () => {
    db.skill.findFirst.mockResolvedValue(null);
    await expect(
      service.update({ id: "s1", businessId: "b1", name: "X" }),
    ).rejects.toThrow(/not found/i);
    expect(db.skill.update).not.toHaveBeenCalled();
    expect(db.skill.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "s1",
      businessId: "b1",
    });
  });

  it("updates a skill within the business", async () => {
    db.skill.findFirst.mockResolvedValue({ id: "s1", businessId: "b1" });
    db.skill.update.mockResolvedValue({ id: "s1", name: "Kitchen" });
    await service.update({ id: "s1", businessId: "b1", name: "Kitchen" });
    expect(db.skill.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { name: "Kitchen", color: undefined },
    });
  });
});

describe("SkillService.delete", () => {
  it("rejects deleting a skill from another business", async () => {
    db.skill.findFirst.mockResolvedValue(null);
    await expect(
      service.delete({ id: "s1", businessId: "b1" }),
    ).rejects.toThrow(/not found/i);
    expect(db.skill.delete).not.toHaveBeenCalled();
  });

  it("deletes a skill within the business", async () => {
    db.skill.findFirst.mockResolvedValue({ id: "s1", businessId: "b1" });
    db.skill.delete.mockResolvedValue({ id: "s1" });
    await service.delete({ id: "s1", businessId: "b1" });
    expect(db.skill.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });
});

import { describe, expect, it } from "vitest";
import { BusinessService } from "@/application/services/business-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("BusinessService.get", () => {
  it("returns the business with the workers projection", async () => {
    const db = createPrismaMock();
    db.business.findUnique.mockResolvedValue({
      id: "b1",
      name: "Cafe",
      workers: [{ id: "u1", name: "Alex", email: "a@x.io" }],
    });
    const service = new BusinessService(asPrisma(db));
    const result = await service.get("b1");
    expect(result?.workers).toHaveLength(1);
    expect(db.business.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b1" },
        include: expect.objectContaining({ workers: expect.anything() }),
      }),
    );
  });

  it("returns null when the business does not exist", async () => {
    const db = createPrismaMock();
    db.business.findUnique.mockResolvedValue(null);
    const service = new BusinessService(asPrisma(db));
    expect(await service.get("missing")).toBeNull();
  });
});

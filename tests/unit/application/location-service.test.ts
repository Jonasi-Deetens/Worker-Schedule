import { beforeEach, describe, expect, it } from "vitest";
import { LocationService } from "@/application/services/location-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

let db: PrismaMock;
let service: LocationService;

beforeEach(() => {
  db = createPrismaMock();
  service = new LocationService(asPrisma(db));
});

describe("LocationService.list", () => {
  it("scopes to the business and orders by name", async () => {
    db.location.findMany.mockResolvedValue([]);
    await service.list("b1");
    expect(db.location.findMany).toHaveBeenCalledWith({
      where: { businessId: "b1" },
      orderBy: { name: "asc" },
    });
  });
});

describe("LocationService.create", () => {
  it("defaults the timezone and persists with the business id", async () => {
    db.location.create.mockResolvedValue({ id: "l1" });
    await service.create({ businessId: "b1", name: "Main bar" });
    const data = db.location.create.mock.calls[0][0].data;
    expect(data.businessId).toBe("b1");
    expect(data.name).toBe("Main bar");
    expect(data.timezone).toBe("Europe/Brussels");
    expect(data.geofenceLat).toBeNull();
  });
});

describe("LocationService.update", () => {
  it("rejects updating a location from another business", async () => {
    db.location.findFirst.mockResolvedValue(null);
    await expect(
      service.update({ id: "l1", businessId: "b1", name: "X" }),
    ).rejects.toThrow(/not found/i);
    expect(db.location.update).not.toHaveBeenCalled();
    expect(db.location.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "l1",
      businessId: "b1",
    });
  });

  it("preserves existing fields when not provided", async () => {
    db.location.findFirst.mockResolvedValue({
      id: "l1",
      businessId: "b1",
      name: "Old",
      address: "Street 1",
      timezone: "Europe/Brussels",
      geofenceLat: null,
      geofenceLng: null,
      geofenceRadiusM: null,
    });
    db.location.update.mockResolvedValue({ id: "l1" });
    await service.update({ id: "l1", businessId: "b1", name: "New" });
    const data = db.location.update.mock.calls[0][0].data;
    expect(data.name).toBe("New");
    expect(data.address).toBe("Street 1");
  });
});

describe("LocationService.delete", () => {
  it("rejects deleting a location from another business", async () => {
    db.location.findFirst.mockResolvedValue(null);
    await expect(
      service.delete({ id: "l1", businessId: "b1" }),
    ).rejects.toThrow(/not found/i);
    expect(db.location.delete).not.toHaveBeenCalled();
  });

  it("deletes a location within the business", async () => {
    db.location.findFirst.mockResolvedValue({ id: "l1", businessId: "b1" });
    db.location.delete.mockResolvedValue({ id: "l1" });
    await service.delete({ id: "l1", businessId: "b1" });
    expect(db.location.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
  });
});

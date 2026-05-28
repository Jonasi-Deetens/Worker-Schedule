import type { PrismaClient } from "@prisma/client";

export class LocationService {
  constructor(private readonly db: PrismaClient) {}

  list(businessId: string) {
    return this.db.location.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
  }

  create(input: {
    businessId: string;
    name: string;
    address?: string;
    timezone?: string;
    geofenceLat?: number;
    geofenceLng?: number;
    geofenceRadiusM?: number;
  }) {
    return this.db.location.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        address: input.address,
        timezone: input.timezone ?? "Europe/Brussels",
        geofenceLat: input.geofenceLat ?? null,
        geofenceLng: input.geofenceLng ?? null,
        geofenceRadiusM: input.geofenceRadiusM ?? null,
      },
    });
  }

  async update(input: {
    id: string;
    businessId: string;
    name?: string;
    address?: string | null;
    timezone?: string;
    geofenceLat?: number | null;
    geofenceLng?: number | null;
    geofenceRadiusM?: number | null;
  }) {
    const existing = await this.db.location.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) throw new Error("Location not found");
    return this.db.location.update({
      where: { id: input.id },
      data: {
        name: input.name ?? existing.name,
        address: input.address === undefined ? existing.address : input.address,
        timezone: input.timezone ?? existing.timezone,
        geofenceLat:
          input.geofenceLat === undefined ? existing.geofenceLat : input.geofenceLat,
        geofenceLng:
          input.geofenceLng === undefined ? existing.geofenceLng : input.geofenceLng,
        geofenceRadiusM:
          input.geofenceRadiusM === undefined
            ? existing.geofenceRadiusM
            : input.geofenceRadiusM,
      },
    });
  }

  async delete(input: { id: string; businessId: string }) {
    const existing = await this.db.location.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) throw new Error("Location not found");
    return this.db.location.delete({ where: { id: input.id } });
  }
}

import { beforeEach, describe, expect, it } from "vitest";
import { AvailabilityService } from "@/application/services/availability-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const USER_ID = "worker-1";

let prisma: PrismaMock;
let service: AvailabilityService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new AvailabilityService(asPrisma(prisma));
});

describe("AvailabilityService.set", () => {
  it("rejects when end is not after start", async () => {
    await expect(
      service.set({
        userId: USER_ID,
        startsAt: new Date("2026-06-01T09:00:00Z"),
        endsAt: new Date("2026-06-01T09:00:00Z"),
      }),
    ).rejects.toThrow(/after start time/i);
  });

  it("creates an availability block and writes audit", async () => {
    prisma.availability.create.mockResolvedValue({ id: "av-1" });

    const result = await service.set({
      userId: USER_ID,
      startsAt: new Date("2026-06-01T09:00:00Z"),
      endsAt: new Date("2026-06-01T17:00:00Z"),
    });

    expect(result).toEqual({ id: "av-1" });
    expect(prisma.availability.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_ID }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "AVAILABILITY_SET" }),
      }),
    );
  });
});

describe("AvailabilityService.delete", () => {
  it("rejects when block does not belong to the worker", async () => {
    prisma.availability.findFirst.mockResolvedValue(null);

    await expect(
      service.delete({ id: "av-x", userId: USER_ID }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.availability.delete).not.toHaveBeenCalled();
  });

  it("deletes when owned by worker", async () => {
    prisma.availability.findFirst.mockResolvedValue({ id: "av-1" });
    prisma.availability.delete.mockResolvedValue({ id: "av-1" });

    await service.delete({ id: "av-1", userId: USER_ID });

    expect(prisma.availability.delete).toHaveBeenCalledWith({
      where: { id: "av-1" },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "AVAILABILITY_DELETED" }),
      }),
    );
  });
});

describe("AvailabilityService.list", () => {
  it("scopes the query to the worker and the requested range", async () => {
    prisma.availability.findMany.mockResolvedValue([]);
    await service.list({
      userId: USER_ID,
      from: new Date("2026-06-01T00:00:00Z"),
      to: new Date("2026-06-30T00:00:00Z"),
    });
    expect(prisma.availability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID }),
        orderBy: { startsAt: "asc" },
      }),
    );
  });
});

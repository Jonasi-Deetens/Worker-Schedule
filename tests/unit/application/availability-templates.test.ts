import { describe, expect, it } from "vitest";
import { AvailabilityService } from "@/application/services/availability-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("AvailabilityService – templates", () => {
  it("rejects an invalid dayOfWeek", async () => {
    const db = createPrismaMock();
    const svc = new AvailabilityService(asPrisma(db));
    await expect(
      svc.setTemplate({
        userId: "u1",
        dayOfWeek: 9,
        startTime: "10:00",
        endTime: "12:00",
      }),
    ).rejects.toThrow(/dayOfWeek/);
  });

  it("rejects when start >= end", async () => {
    const db = createPrismaMock();
    const svc = new AvailabilityService(asPrisma(db));
    await expect(
      svc.setTemplate({
        userId: "u1",
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "18:00",
      }),
    ).rejects.toThrow(/must be after/i);
  });

  it("materialises one row per matching dow in range", async () => {
    const db = createPrismaMock();
    // Template for Monday (dayOfWeek=1) 09:00-17:00, no expiry
    db.availabilityTemplate.findMany.mockResolvedValue([
      {
        id: "t1",
        userId: "u1",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
        validFrom: new Date("2020-01-01"),
        validUntil: null,
      },
    ]);
    db.availability.findMany.mockResolvedValue([]);
    db.availability.createMany.mockResolvedValue({ count: 2 });

    const svc = new AvailabilityService(asPrisma(db));
    const count = await svc.materialiseTemplates(
      "u1",
      new Date("2026-06-01T00:00:00"),
      new Date("2026-06-15T00:00:00"),
    );
    expect(count).toBe(2);
    expect(db.availability.createMany).toHaveBeenCalled();
    const payload = (db.availability.createMany.mock.calls[0] as
      | [{ data: Array<{ userId: string; startsAt: Date; endsAt: Date }> }]
      | undefined)?.[0]?.data ?? [];
    expect(payload).toHaveLength(2);
  });

  it("skips slots already covered by an existing availability", async () => {
    const db = createPrismaMock();
    const existingStart = new Date(2026, 5, 1, 9);
    const existingEnd = new Date(2026, 5, 1, 17);
    db.availabilityTemplate.findMany.mockResolvedValue([
      {
        id: "t1",
        userId: "u1",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
        validFrom: new Date("2020-01-01"),
        validUntil: null,
      },
    ]);
    db.availability.findMany.mockResolvedValue([
      { startsAt: existingStart, endsAt: existingEnd },
    ]);
    db.availability.createMany.mockResolvedValue({ count: 1 });

    const svc = new AvailabilityService(asPrisma(db));
    const count = await svc.materialiseTemplates(
      "u1",
      new Date(2026, 5, 1),
      new Date(2026, 5, 15),
    );
    expect(count).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { HolidayService } from "@/application/services/holiday-service";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

/** A `@db.Date` Prisma value is a UTC-midnight Date. */
function dateRow(id: string, iso: string, name: string) {
  return { id, date: new Date(`${iso}T00:00:00.000Z`), name };
}

describe("HolidayService", () => {
  describe("listForYear", () => {
    it("merges statutory holidays with custom rows", async () => {
      const db = createPrismaMock();
      db.holiday.findMany.mockResolvedValue([
        dateRow("h1", "2025-07-11", "Flemish Community Day"),
      ]);
      const service = new HolidayService(asPrisma(db));
      const entries = await service.listForYear("b1", 2025);

      // 10 statutory + 1 custom = 11, sorted by date.
      expect(entries).toHaveLength(11);
      const custom = entries.find((e) => e.date === "2025-07-11");
      expect(custom).toEqual({
        date: "2025-07-11",
        name: "Flemish Community Day",
        custom: true,
        id: "h1",
      });
      // Statutory entry is flagged non-custom.
      expect(entries.find((e) => e.date === "2025-12-25")?.custom).toBe(false);
    });

    it("lets a custom row override a statutory holiday's label", async () => {
      const db = createPrismaMock();
      db.holiday.findMany.mockResolvedValue([
        dateRow("h2", "2025-12-25", "Kerstmis"),
      ]);
      const service = new HolidayService(asPrisma(db));
      const entries = await service.listForYear("b1", 2025);
      expect(entries).toHaveLength(10); // no extra row, just relabelled
      const christmas = entries.find((e) => e.date === "2025-12-25");
      expect(christmas).toEqual({
        date: "2025-12-25",
        name: "Kerstmis",
        custom: true,
        id: "h2",
      });
    });
  });

  describe("effectiveHolidaySet", () => {
    it("unions statutory + custom days across every year in the range", async () => {
      const db = createPrismaMock();
      // Called once per year (2024 and 2025); return a custom row only for 2025.
      db.holiday.findMany
        .mockResolvedValueOnce([]) // 2024
        .mockResolvedValueOnce([dateRow("h3", "2025-07-11", "Custom")]); // 2025
      const service = new HolidayService(asPrisma(db));
      const set = await service.effectiveHolidaySet({
        businessId: "b1",
        from: new Date("2024-12-20T00:00:00Z"),
        to: new Date("2025-01-10T00:00:00Z"),
      });
      expect(set.has("2024-12-25")).toBe(true);
      expect(set.has("2025-01-01")).toBe(true);
      expect(set.has("2025-07-11")).toBe(true);
      expect(set.has("2025-07-10")).toBe(false);
    });
  });

  describe("removeCustom", () => {
    it("refuses to delete a holiday from another business", async () => {
      const db = createPrismaMock();
      db.holiday.findUnique.mockResolvedValue({
        id: "h1",
        businessId: "other",
      });
      const service = new HolidayService(asPrisma(db));
      await expect(
        service.removeCustom({ businessId: "b1", id: "h1" }),
      ).rejects.toThrow("Holiday not found");
      expect(db.holiday.delete).not.toHaveBeenCalled();
    });
  });
});

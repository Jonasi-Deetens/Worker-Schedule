import type { PrismaClient } from "@prisma/client";
import { computeBelgianHolidays } from "@/lib/belgian-holidays";

/**
 * Effective public-holiday calendar for a business.
 *
 * Design choice: the effective holiday set is the UNION of the statutory
 * Belgian holidays computed in code ({@link computeBelgianHolidays}) and the
 * business's stored custom {@link Holiday} rows. Computed defaults are never
 * persisted — they are derived on demand — so the `holidays` table only ever
 * holds a business's *extra* closure days (e.g. a local feast or annual
 * shutdown). This keeps the table small and the statutory list always correct
 * without a seeding/backfill step.
 */
export interface HolidayEntry {
  /** Calendar day as `YYYY-MM-DD`. */
  date: string;
  name: string;
  /** True for a business-specific custom row, false for a statutory default. */
  custom: boolean;
  /** Present only for custom rows (so the UI can delete them). */
  id?: string;
}

/** Renders a `@db.Date` value (UTC-midnight Date) as `YYYY-MM-DD`. */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class HolidayService {
  constructor(private readonly db: PrismaClient) {}

  /** Business custom holiday rows for a calendar year, ordered by date. */
  private async customForYear(businessId: string, year: number) {
    return this.db.holiday.findMany({
      where: {
        businessId,
        date: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      orderBy: { date: "asc" },
    });
  }

  /**
   * Merged calendar for a single year: statutory Belgian holidays plus the
   * business's custom rows. A custom row sharing a date with a statutory
   * holiday overrides its name (so owners can localise/relabel a default).
   */
  async listForYear(
    businessId: string,
    year: number,
  ): Promise<HolidayEntry[]> {
    const custom = await this.customForYear(businessId, year);
    const customByDate = new Map(custom.map((row) => [dateKey(row.date), row]));

    const entries: HolidayEntry[] = computeBelgianHolidays(year).map((h) => {
      const override = customByDate.get(h.date);
      return override
        ? { date: h.date, name: override.name, custom: true, id: override.id }
        : { date: h.date, name: h.name, custom: false };
    });

    // Custom rows that don't coincide with a statutory holiday are appended.
    const statutoryDates = new Set(entries.map((e) => e.date));
    for (const row of custom) {
      const key = dateKey(row.date);
      if (!statutoryDates.has(key)) {
        entries.push({ date: key, name: row.name, custom: true, id: row.id });
      }
    }

    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * The effective set of public-holiday `YYYY-MM-DD` strings covering every
   * calendar year touched by `[from, to]`. Used by the payroll export to feed
   * the HOLIDAY wage bucket.
   */
  async effectiveHolidaySet(input: {
    businessId: string;
    from: Date;
    to: Date;
  }): Promise<Set<string>> {
    const fromYear = input.from.getUTCFullYear();
    const toYear = input.to.getUTCFullYear();
    const set = new Set<string>();
    for (let year = fromYear; year <= toYear; year++) {
      for (const entry of await this.listForYear(input.businessId, year)) {
        set.add(entry.date);
      }
    }
    return set;
  }

  /**
   * Adds or relabels a custom closure day. Idempotent on `(businessId, date)`:
   * re-adding an existing date updates its name rather than failing.
   */
  async addCustom(input: { businessId: string; date: Date; name: string }) {
    const date = new Date(
      Date.UTC(
        input.date.getUTCFullYear(),
        input.date.getUTCMonth(),
        input.date.getUTCDate(),
      ),
    );
    return this.db.holiday.upsert({
      where: { businessId_date: { businessId: input.businessId, date } },
      update: { name: input.name },
      create: { businessId: input.businessId, date, name: input.name },
    });
  }

  /** Removes a custom closure day, scoped to the owning business. */
  async removeCustom(input: { businessId: string; id: string }) {
    const row = await this.db.holiday.findUnique({ where: { id: input.id } });
    if (!row || row.businessId !== input.businessId) {
      throw new Error("Holiday not found");
    }
    return this.db.holiday.delete({ where: { id: input.id } });
  }
}

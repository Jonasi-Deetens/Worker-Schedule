import { beforeEach, describe, expect, it } from "vitest";
import {
  buildContractPrefill,
  deriveScheduleFromShifts,
} from "@/application/services/contract-field-mapper";
import {
  asPrisma,
  createPrismaMock,
  type PrismaMock,
} from "../../helpers/mock-prisma";

describe("contract-field-mapper", () => {
  let db: PrismaMock;

  beforeEach(() => {
    db = createPrismaMock();
  });

  it("buildContractPrefill maps employer and student data", async () => {
    db.business.findUnique.mockResolvedValue({
      name: "Cafe BV",
      dimonaEmployerId: "RSZ-1",
      addressLine: "Main 1",
      postalCode: "1000",
      city: "Brussels",
      cbeNumber: "BE0123456789",
      contractTemplateUrlNl: "https://s3/template-nl.pdf",
      contractTemplateUrlFr: null,
    });
    db.user.findUnique.mockResolvedValue({
      name: "Jane",
      contractType: "JOBSTUDENT",
      nationalNumber: "90010112345",
      addressLine: "Student st",
      postalCode: "9000",
      city: "Gent",
      birthDate: new Date("2004-01-15"),
      iban: "BE68539007547034",
      emergencyContactName: "Mom",
      emergencyContactPhone: "+32470123456",
      hourlyRate: { toString: () => "14.5" },
    });
    db.shiftAssignment.findFirst.mockResolvedValue({
      shift: { roleLabel: "Bartender" },
    });
    db.shiftAssignment.findMany.mockResolvedValue([]);

    const result = await buildContractPrefill(asPrisma(db), {
      businessId: "b1",
      userId: "u1",
    });

    expect(result.title).toContain("Student");
    expect(result.hourlyWageCents).toBe(1450);
    expect(result.fieldValues.employer_name).toBe("Cafe BV");
    expect(result.completeness.missing).toContain("schedule");
    expect(result.completeness.ready).toBe(false);
  });

  it("deriveScheduleFromShifts formats confirmed assignments", async () => {
    db.shiftAssignment.findMany.mockResolvedValue([
      {
        shift: {
          startsAt: new Date("2026-06-07T10:00:00Z"),
          endsAt: new Date("2026-06-07T18:00:00Z"),
          roleLabel: "Floor",
        },
      },
    ]);

    const text = await deriveScheduleFromShifts(asPrisma(db), {
      userId: "u1",
      businessId: "b1",
      from: new Date("2026-06-01"),
      to: new Date("2026-09-01"),
    });

    expect(text).toContain("Floor");
  });
});

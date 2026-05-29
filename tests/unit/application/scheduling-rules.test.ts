import { describe, expect, it } from "vitest";
import { SchedulingRules } from "@/application/services/scheduling-rules";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

const start = (h: number) => new Date(`2026-06-01T${String(h).padStart(2, "0")}:00:00Z`);

describe("SchedulingRules", () => {
  describe("checkMinRest", () => {
    it("returns null when no neighbours exist", async () => {
      const db = createPrismaMock();
      db.shiftAssignment.findMany.mockResolvedValue([]);
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkMinRest("u1", {
        startsAt: start(10),
        endsAt: start(14),
      });
      expect(result).toBeNull();
    });

    it("flags shifts with less than 11h rest", async () => {
      const db = createPrismaMock();
      db.shiftAssignment.findMany.mockResolvedValue([
        { shift: { startsAt: start(20), endsAt: start(23) } },
      ]);
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkMinRest("u1", {
        startsAt: new Date("2026-06-02T08:00:00Z"),
        endsAt: new Date("2026-06-02T12:00:00Z"),
      });
      expect(result?.code).toBe("MIN_REST_BROKEN");
    });
  });

  describe("checkWeeklyCap", () => {
    it("returns null without a cap", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({ weeklyHourCap: null, contractType: null });
      const rules = new SchedulingRules(asPrisma(db));
      expect(
        await rules.checkWeeklyCap("u1", {
          startsAt: start(10),
          endsAt: start(18),
        }),
      ).toBeNull();
    });

    it("flags JOBSTUDENT exceeding 24h", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        weeklyHourCap: null,
        contractType: "JOBSTUDENT",
      });
      db.shiftAssignment.findMany.mockResolvedValue([
        { shift: { startsAt: start(8), endsAt: start(20) } },
        { shift: { startsAt: start(8), endsAt: start(20) } },
      ]);
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkWeeklyCap("u1", {
        startsAt: start(10),
        endsAt: start(18),
      });
      expect(result?.code).toBe("WEEKLY_CAP_EXCEEDED");
    });
  });

  describe("checkAge", () => {
    it("blocks workers below 16", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        birthDate: new Date("2015-01-01"),
      });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkAge("u1", { startsAt: start(10) });
      expect(result?.code).toBe("AGE_RESTRICTED");
    });

    it("allows workers at or above 16", async () => {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        birthDate: new Date("2008-01-01"),
      });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkAge("u1", { startsAt: start(10) });
      expect(result).toBeNull();
    });
  });

  describe("checkTimeOff", () => {
    it("blocks approved time-off overlapping the candidate range", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({ id: "to1" });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkTimeOff("u1", {
        startsAt: start(10),
        endsAt: start(18),
      });
      expect(result?.code).toBe("TIME_OFF_CONFLICT");
    });

    it("returns null when no overlap", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue(null);
      const rules = new SchedulingRules(asPrisma(db));
      expect(
        await rules.checkTimeOff("u1", { startsAt: start(10), endsAt: start(18) }),
      ).toBeNull();
    });
  });

  describe("checkStudentQuota (650h hard stop)", () => {
    // 09:00–21:00 = 12h candidate (rounded up).
    const candidate = { startsAt: start(9), endsAt: start(21) };

    function seed(opts: {
      hardStop: boolean;
      contractType?: string;
      row?: {
        reservedHours: number;
        workedHours: number;
        studentAtWorkBalanceHours: number | null;
        attestationUploadedAt: Date | null;
      } | null;
    }) {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        contractType: opts.contractType ?? "JOBSTUDENT",
      });
      db.business.findUnique.mockResolvedValue({
        studentQuotaHardStop: opts.hardStop,
      });
      db.studentQuota.findUnique.mockResolvedValue(opts.row ?? null);
      return db;
    }

    it("returns null when the business has no hard stop", async () => {
      const db = seed({ hardStop: false, row: { reservedHours: 700, workedHours: 0, studentAtWorkBalanceHours: null, attestationUploadedAt: null } });
      const rules = new SchedulingRules(asPrisma(db));
      expect(await rules.checkStudentQuota("u1", "b1", candidate)).toBeNull();
    });

    it("returns null for non-students", async () => {
      const db = seed({ hardStop: true, contractType: "FLEXI" });
      const rules = new SchedulingRules(asPrisma(db));
      expect(await rules.checkStudentQuota("u1", "b1", candidate)).toBeNull();
    });

    it("blocks when the candidate hours exceed the remaining quota", async () => {
      const db = seed({
        hardStop: true,
        row: {
          reservedHours: 640, // 10h left of 650
          workedHours: 0,
          studentAtWorkBalanceHours: null,
          attestationUploadedAt: null,
        },
      });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkStudentQuota("u1", "b1", candidate);
      expect(result?.code).toBe("STUDENT_QUOTA_EXCEEDED");
      expect(result?.message).toBe("errors.studentQuotaExceeded");
    });

    it("allows when within the remaining quota", async () => {
      const db = seed({
        hardStop: true,
        row: {
          reservedHours: 100,
          workedHours: 0,
          studentAtWorkBalanceHours: null,
          attestationUploadedAt: null,
        },
      });
      const rules = new SchedulingRules(asPrisma(db));
      expect(await rules.checkStudentQuota("u1", "b1", candidate)).toBeNull();
    });

    it("respects the attestation balance over the local ledger", async () => {
      const db = seed({
        hardStop: true,
        row: {
          reservedHours: 0,
          workedHours: 0,
          studentAtWorkBalanceHours: 5, // only 5h left nationally
          attestationUploadedAt: new Date(),
        },
      });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkStudentQuota("u1", "b1", candidate);
      expect(result?.code).toBe("STUDENT_QUOTA_EXCEEDED");
    });

    it("assertAssignable throws the localized key when the hard stop trips (quota)", async () => {
      const db = seed({
        hardStop: true,
        row: {
          reservedHours: 649,
          workedHours: 0,
          studentAtWorkBalanceHours: null,
          attestationUploadedAt: null,
        },
      });
      // No other-rule data needed — quota check runs first and throws.
      db.shiftAssignment.findMany.mockResolvedValue([]);
      db.timeOffRequest.findFirst.mockResolvedValue(null);
      const rules = new SchedulingRules(asPrisma(db));
      await expect(
        rules.assertAssignable("u1", candidate, { businessId: "b1" }),
      ).rejects.toThrow("errors.studentQuotaExceeded");
    });
  });

  describe("checkStudentQuota buffer", () => {
    // 09:00–21:00 = 12h candidate (rounded up).
    const candidate = { startsAt: start(9), endsAt: start(21) };

    function seedBuffer(reservedHours: number, buffer: number) {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({ contractType: "JOBSTUDENT" });
      db.business.findUnique.mockResolvedValue({
        studentQuotaHardStop: true,
        studentQuotaHardStopBufferHours: buffer,
      });
      db.studentQuota.findUnique.mockResolvedValue({
        reservedHours,
        workedHours: 0,
        studentAtWorkBalanceHours: null,
        attestationUploadedAt: null,
      });
      return db;
    }

    it("allows when within remaining and no buffer", async () => {
      // 650 - 630 = 20h remaining; 12h candidate fits.
      const rules = new SchedulingRules(asPrisma(seedBuffer(630, 0)));
      expect(await rules.checkStudentQuota("u1", "b1", candidate)).toBeNull();
    });

    it("blocks once the buffer eats into the remaining quota", async () => {
      // 20h remaining minus a 10h buffer = 10h usable; 12h candidate exceeds it.
      const rules = new SchedulingRules(asPrisma(seedBuffer(630, 10)));
      const result = await rules.checkStudentQuota("u1", "b1", candidate);
      expect(result?.code).toBe("STUDENT_QUOTA_EXCEEDED");
    });
  });

  describe("checkStudentAttestation", () => {
    const candidate = { startsAt: start(10), endsAt: start(14) };

    function seed(opts: {
      required: boolean;
      contractType?: string;
      maxAgeDays?: number;
      attestationCreatedAt?: Date | null;
    }) {
      const db = createPrismaMock();
      db.user.findUnique.mockResolvedValue({
        contractType: opts.contractType ?? "JOBSTUDENT",
      });
      db.business.findUnique.mockResolvedValue({
        requireStudentAttestation: opts.required,
        attestationMaxAgeDays: opts.maxAgeDays ?? 365,
      });
      db.document.findFirst.mockResolvedValue(
        opts.attestationCreatedAt === undefined
          ? null
          : opts.attestationCreatedAt === null
            ? null
            : { createdAt: opts.attestationCreatedAt },
      );
      return db;
    }

    it("returns null when the business does not require attestation", async () => {
      const db = seed({ required: false });
      const rules = new SchedulingRules(asPrisma(db));
      expect(
        await rules.checkStudentAttestation("u1", "b1", candidate),
      ).toBeNull();
    });

    it("returns null for non-students", async () => {
      const db = seed({ required: true, contractType: "FLEXI" });
      const rules = new SchedulingRules(asPrisma(db));
      expect(
        await rules.checkStudentAttestation("u1", "b1", candidate),
      ).toBeNull();
    });

    it("blocks when no attestation is on file", async () => {
      const db = seed({ required: true, attestationCreatedAt: null });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkStudentAttestation("u1", "b1", candidate);
      expect(result?.code).toBe("STUDENT_ATTESTATION_MISSING");
      expect(result?.message).toBe("errors.studentAttestationMissing");
    });

    it("blocks when the attestation is stale", async () => {
      // Uploaded 400 days before the shift, max age 365.
      const stale = new Date(candidate.startsAt.getTime() - 400 * 86_400_000);
      const db = seed({
        required: true,
        maxAgeDays: 365,
        attestationCreatedAt: stale,
      });
      const rules = new SchedulingRules(asPrisma(db));
      const result = await rules.checkStudentAttestation("u1", "b1", candidate);
      expect(result?.code).toBe("STUDENT_ATTESTATION_STALE");
      expect(result?.message).toBe("errors.studentAttestationStale");
    });

    it("allows when a fresh attestation is on file", async () => {
      const fresh = new Date(candidate.startsAt.getTime() - 10 * 86_400_000);
      const db = seed({
        required: true,
        maxAgeDays: 365,
        attestationCreatedAt: fresh,
      });
      const rules = new SchedulingRules(asPrisma(db));
      expect(
        await rules.checkStudentAttestation("u1", "b1", candidate),
      ).toBeNull();
    });

    it("assertAssignable throws the localized key when the attestation is missing", async () => {
      const db = seed({ required: true, attestationCreatedAt: null });
      // Quota check runs first; make it a no-op (no hard stop).
      db.business.findUnique.mockResolvedValue({
        studentQuotaHardStop: false,
        studentQuotaHardStopBufferHours: 0,
        requireStudentAttestation: true,
        attestationMaxAgeDays: 365,
      });
      db.studentQuota.findUnique.mockResolvedValue(null);
      await expect(
        new SchedulingRules(asPrisma(db)).assertAssignable("u1", candidate, {
          businessId: "b1",
        }),
      ).rejects.toThrow("errors.studentAttestationMissing");
    });
  });

  describe("Phase F — eligibility & youth-labour rules", () => {
    describe("checkStudentBirthDateRequired", () => {
      it("blocks a student with no birth date on file", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          contractType: "JOBSTUDENT",
          birthDate: null,
        });
        const rules = new SchedulingRules(asPrisma(db));
        const result = await rules.checkStudentBirthDateRequired("u1", {
          startsAt: start(10),
          endsAt: start(14),
        });
        expect(result?.message).toBe("errors.studentBirthDateRequired");
      });

      it("allows a student with a birth date", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          contractType: "JOBSTUDENT",
          birthDate: new Date("2006-01-01"),
        });
        const rules = new SchedulingRules(asPrisma(db));
        expect(
          await rules.checkStudentBirthDateRequired("u1", {
            startsAt: start(10),
            endsAt: start(14),
          }),
        ).toBeNull();
      });

      it("ignores non-students", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          contractType: "FLEXI",
          birthDate: null,
        });
        const rules = new SchedulingRules(asPrisma(db));
        expect(
          await rules.checkStudentBirthDateRequired("u1", {
            startsAt: start(10),
            endsAt: start(14),
          }),
        ).toBeNull();
      });
    });

    describe("checkMinorDailyHours (hard, max 8h/day)", () => {
      it("blocks a minor working more than 8 hours in a day", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          birthDate: new Date("2010-06-01"),
        });
        db.shiftAssignment.findMany.mockResolvedValue([]);
        const rules = new SchedulingRules(asPrisma(db));
        const result = await rules.checkMinorDailyHours("u1", {
          startsAt: start(8),
          endsAt: start(17), // 9h
        });
        expect(result?.message).toBe("errors.minorDailyHoursExceeded");
      });

      it("allows a minor working exactly 8 hours", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          birthDate: new Date("2010-06-01"),
        });
        db.shiftAssignment.findMany.mockResolvedValue([]);
        const rules = new SchedulingRules(asPrisma(db));
        expect(
          await rules.checkMinorDailyHours("u1", {
            startsAt: start(8),
            endsAt: start(16),
          }),
        ).toBeNull();
      });

      it("ignores adults", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          birthDate: new Date("1999-01-01"),
        });
        const rules = new SchedulingRules(asPrisma(db));
        expect(
          await rules.checkMinorDailyHours("u1", {
            startsAt: start(8),
            endsAt: start(20),
          }),
        ).toBeNull();
      });
    });

    describe("checkMinorNightWork (hard, 20:00–06:00 ban)", () => {
      it("blocks a minor working into the night", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          birthDate: new Date("2010-06-01"),
        });
        const rules = new SchedulingRules(asPrisma(db));
        const result = await rules.checkMinorNightWork("u1", {
          startsAt: start(18),
          endsAt: start(22),
        });
        expect(result?.message).toBe("errors.minorNightWork");
      });

      it("allows a minor working daytime hours", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({
          birthDate: new Date("2010-06-01"),
        });
        const rules = new SchedulingRules(asPrisma(db));
        expect(
          await rules.checkMinorNightWork("u1", {
            startsAt: start(10),
            endsAt: start(16),
          }),
        ).toBeNull();
      });
    });

    describe("checkRequiredDocuments (hard)", () => {
      const candidate = { startsAt: start(10) };

      it("blocks when a required document is missing", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({ contractType: "JOBSTUDENT" });
        db.document.findMany.mockResolvedValue([
          { kind: "ID_CARD", expiresOn: null },
        ]);
        const rules = new SchedulingRules(asPrisma(db));
        const result = await rules.checkRequiredDocuments("u1", candidate);
        expect(result?.message).toBe("errors.requiredDocumentMissing");
      });

      it("blocks when a required document has expired", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({ contractType: "JOBSTUDENT" });
        db.document.findMany.mockResolvedValue([
          { kind: "ID_CARD", expiresOn: null },
          {
            kind: "ENROLLMENT_CERTIFICATE",
            expiresOn: new Date("2026-01-01"),
          },
        ]);
        const rules = new SchedulingRules(asPrisma(db));
        const result = await rules.checkRequiredDocuments("u1", candidate);
        expect(result?.message).toBe("errors.requiredDocumentExpired");
      });

      it("allows when all required documents are present and valid", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({ contractType: "JOBSTUDENT" });
        db.document.findMany.mockResolvedValue([
          { kind: "ID_CARD", expiresOn: null },
          {
            kind: "ENROLLMENT_CERTIFICATE",
            expiresOn: new Date("2027-01-01"),
          },
        ]);
        const rules = new SchedulingRules(asPrisma(db));
        expect(await rules.checkRequiredDocuments("u1", candidate)).toBeNull();
      });

      it("ignores non-students", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({ contractType: "FLEXI" });
        const rules = new SchedulingRules(asPrisma(db));
        expect(await rules.checkRequiredDocuments("u1", candidate)).toBeNull();
      });
    });

    describe("schoolPeriodAdvisory (advisory, non-blocking)", () => {
      // 2026-06-01 is a Monday in term, 10:00 is within school hours.
      const candidate = { startsAt: start(10), endsAt: start(14) };

      it("returns an advisory for a student during school hours", async () => {
        const db = createPrismaMock();
        db.user.findUnique.mockResolvedValue({ contractType: "JOBSTUDENT" });
        const rules = new SchedulingRules(asPrisma(db));
        const result = await rules.schoolPeriodAdvisory("u1", candidate);
        expect(result?.message).toBe("errors.schoolPeriodAdvisory");
      });

      it("does NOT block assignment (advisory only)", async () => {
        const db = createPrismaMock();
        // Adult student with valid documents and no other violations.
        db.user.findUnique.mockResolvedValue({
          contractType: "JOBSTUDENT",
          birthDate: new Date("2000-01-01"),
          weeklyHourCap: null,
        });
        db.document.findMany.mockResolvedValue([
          { kind: "ID_CARD", expiresOn: null },
          { kind: "ENROLLMENT_CERTIFICATE", expiresOn: null },
        ]);
        db.shiftAssignment.findMany.mockResolvedValue([]);
        db.timeOffRequest.findFirst.mockResolvedValue(null);
        const rules = new SchedulingRules(asPrisma(db));
        await expect(
          rules.assertAssignable("u1", candidate),
        ).resolves.toBeUndefined();
      });
    });
  });
});

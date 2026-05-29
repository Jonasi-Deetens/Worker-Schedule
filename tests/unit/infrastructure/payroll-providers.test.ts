import { describe, expect, it } from "vitest";
import {
  buildAbsenceRows,
  buildPayrollRows,
  formatPayrollDate,
  GENERIC,
  LIANTIS,
  PARTENA,
  payrollContentType,
  payrollFilename,
  renderPayrollCsv,
  renderPayrollCsvWithVariance,
  resolveFormat,
  SD_WORX,
  SECUREX,
  summarizeStuVariance,
  type PayrollRow,
} from "@/infrastructure/payroll/providers";

const ROW: PayrollRow = {
  workerExternalId: "u1",
  workerName: "Alice",
  date: "2026-06-01",
  code: "REGULAR",
  hours: 8,
  rate: 16.5,
  gross: 132,
  student: false,
};

const STUDENT_ROW: PayrollRow = { ...ROW, student: true };

describe("Payroll provider presets", () => {
  it("SD Worx CSV has the expected column order with a student column", () => {
    const csv = renderPayrollCsv(SD_WORX, [ROW]);
    expect(csv.split("\r\n")[0]).toBe(
      "employee_id,employee_name,date,wage_code,hours,rate,student",
    );
    expect(csv.split("\r\n")[1]).toBe(
      "u1,Alice,2026-06-01,REGULAR,8.00,16.50,",
    );
  });

  it("Securex CSV includes from and to dates", () => {
    const csv = renderPayrollCsv(SECUREX, [ROW]);
    expect(csv.split("\r\n")[0]).toBe(
      "employee_number,employee_name,from_date,to_date,code,hours,gross_amount,student",
    );
    expect(csv.split("\r\n")[1]).toBe(
      "u1,Alice,2026-06-01,2026-06-01,REGULAR,8.00,132.00,",
    );
  });

  it("Partena CSV uses its personnel columns", () => {
    const csv = renderPayrollCsv(PARTENA, [ROW]);
    expect(csv.split("\r\n")[0]).toBe(
      "personnel_no,name,date,wage_code,hours,amount,student_flag",
    );
    expect(csv.split("\r\n")[1]).toBe("u1,Alice,2026-06-01,REGULAR,8.00,132.00,");
  });

  it("Liantis CSV uses its solidarity column", () => {
    const csv = renderPayrollCsv(LIANTIS, [ROW]);
    expect(csv.split("\r\n")[0]).toBe(
      "employee,date,code,hours,rate,gross,solidarity",
    );
    expect(csv.split("\r\n")[1]).toBe(
      "u1,2026-06-01,REGULAR,8.00,16.50,132.00,",
    );
  });

  it("Generic CSV is the safe fallback", () => {
    const csv = renderPayrollCsv(GENERIC, [ROW]);
    expect(csv).toContain("worker,date,wage_code,hours,rate,gross,student");
    expect(csv).toContain("Alice,2026-06-01,REGULAR,8.00,16.50,132.00,");
  });

  it("marks student/solidarity rows with STU", () => {
    const csv = renderPayrollCsv(GENERIC, [STUDENT_ROW]);
    expect(csv.split("\r\n")[1].endsWith(",STU")).toBe(true);
  });

  it("escapes commas and quotes", () => {
    const csv = renderPayrollCsv(GENERIC, [
      { ...ROW, workerName: 'Bob, "the" Builder' },
    ]);
    expect(csv).toContain('"Bob, ""the"" Builder"');
  });
});

describe("buildPayrollRows", () => {
  const base = {
    clockInAt: new Date("2026-06-01T09:00:00Z"),
    clockOutAt: new Date("2026-06-01T17:30:00Z"),
    breakMinutes: 30,
    user: {
      name: "Alice",
      email: "alice@example.com",
      hourlyRate: 16.5,
      nationalNumber: "90010112345",
      contractType: "FLEXI",
    },
  };

  it("computes net hours and gross from rate for the regular bucket", () => {
    const rows = buildPayrollRows([base], { timeZone: "UTC" });
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("REGULAR");
    expect(rows[0].hours).toBe(8);
    expect(rows[0].gross).toBe(132);
  });

  it("splits an entry into one row per wage-code bucket", () => {
    const overnight = {
      ...base,
      clockInAt: new Date("2026-01-05T20:00:00Z"), // Monday 20:00
      clockOutAt: new Date("2026-01-06T02:00:00Z"), // Tuesday 02:00
      breakMinutes: 0,
    };
    const rows = buildPayrollRows([overnight], { timeZone: "UTC" });
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r.hours]));
    expect(byCode.REGULAR).toBe(2);
    expect(byCode.NIGHT).toBe(4);
  });

  it("uses the NISS as the worker identifier, never the internal id", () => {
    const [row] = buildPayrollRows([base], { timeZone: "UTC" });
    expect(row.workerExternalId).toBe("90010112345");
  });

  it("falls back to the email local-part when NISS is missing", () => {
    const [row] = buildPayrollRows(
      [{ ...base, user: { ...base.user, nationalNumber: null } }],
      { timeZone: "UTC" },
    );
    expect(row.workerExternalId).toBe("alice");
  });

  it("flags JOBSTUDENT workers with the solidarity indicator", () => {
    const [row] = buildPayrollRows(
      [{ ...base, user: { ...base.user, contractType: "JOBSTUDENT" } }],
      { timeZone: "UTC" },
    );
    expect(row.student).toBe(true);
  });

  it("renders the date in the business timezone, not UTC", () => {
    const lateNight = {
      ...base,
      clockInAt: new Date("2026-06-01T23:30:00Z"),
      clockOutAt: new Date("2026-06-02T03:00:00Z"),
      breakMinutes: 0,
    };
    const rows = buildPayrollRows([lateNight], { timeZone: "Europe/Brussels" });
    expect(rows[0].date).toBe("2026-06-02");
    expect(formatPayrollDate(lateNight.clockInAt, "UTC")).toBe("2026-06-01");
  });
});

describe("buildAbsenceRows", () => {
  const request = {
    startsAt: new Date("2026-06-01T00:00:00Z"),
    endsAt: new Date("2026-06-03T00:00:00Z"),
    user: {
      name: "Alice",
      email: "alice@example.com",
      hourlyRate: 16.5,
      nationalNumber: "90010112345",
      contractType: "JOBSTUDENT",
    },
  };

  it("emits one ABSENCE row per day clamped to the period", () => {
    const rows = buildAbsenceRows(
      [request],
      { from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-30T00:00:00Z") },
      "UTC",
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.code === "ABSENCE")).toBe(true);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
    expect(rows[0].student).toBe(true);
    expect(rows[0].hours).toBe(0);
  });
});

describe("summarizeStuVariance", () => {
  it("compares Dimona planned hours against actual approved worked hours", () => {
    const declarations = [
      {
        userId: "u1",
        plannedHours: 100,
        user: { name: "Alice", email: "alice@x.com", nationalNumber: "NISS1" },
      },
    ];
    const entries = [
      {
        userId: "u1",
        clockInAt: new Date("2026-01-05T09:00:00Z"),
        clockOutAt: new Date("2026-01-05T17:00:00Z"), // 8h
        breakMinutes: 0,
      },
      {
        userId: "u1",
        clockInAt: new Date("2026-01-06T09:00:00Z"),
        clockOutAt: new Date("2026-01-06T13:00:00Z"), // 4h
        breakMinutes: 0,
      },
    ];
    const [row] = summarizeStuVariance(declarations, entries);
    expect(row.plannedHours).toBe(100);
    expect(row.actualHours).toBe(12);
    expect(row.variance).toBe(-88);
    expect(row.workerExternalId).toBe("NISS1");
  });
});

describe("format selection", () => {
  it("resolves the format from the query value", () => {
    expect(resolveFormat("xlsx")).toBe("xlsx");
    expect(resolveFormat("XLSX")).toBe("xlsx");
    expect(resolveFormat("csv")).toBe("csv");
    expect(resolveFormat(null)).toBe("csv");
    expect(resolveFormat("nonsense")).toBe("csv");
  });

  it("maps the format to a content type and filename", () => {
    expect(payrollContentType("csv")).toContain("text/csv");
    expect(payrollContentType("xlsx")).toContain("spreadsheetml");
    expect(payrollFilename(SD_WORX, "xlsx", "2026-06-01", "2026-06-30")).toBe(
      "payroll-2026-06-01-to-2026-06-30-sdworx.xlsx",
    );
    expect(payrollFilename(GENERIC, "csv", "2026-06-01", "2026-06-30")).toBe(
      "payroll-2026-06-01-to-2026-06-30.csv",
    );
  });
});

describe("renderPayrollCsvWithVariance", () => {
  it("appends a STU variance section when present", () => {
    const variance = [
      {
        workerExternalId: "NISS1",
        workerName: "Alice",
        plannedHours: 100,
        actualHours: 12,
        variance: -88,
      },
    ];
    const csv = renderPayrollCsvWithVariance(GENERIC, [ROW], variance);
    expect(csv).toContain("# STU planned vs actual");
    expect(csv).toContain("worker,employee_id,planned_hours,actual_hours,variance");
    expect(csv).toContain("Alice,NISS1,100.00,12.00,-88.00");
  });

  it("omits the section when there is no variance data", () => {
    const csv = renderPayrollCsvWithVariance(GENERIC, [ROW], []);
    expect(csv).not.toContain("# STU planned vs actual");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPayrollRows,
  formatPayrollDate,
  SD_WORX,
  SECUREX,
  GENERIC,
  renderPayrollCsv,
} from "@/infrastructure/payroll/providers";

const ROW = {
  workerExternalId: "u1",
  workerName: "Alice",
  date: "2026-06-01",
  code: "WORK",
  hours: 8,
  rate: 16.5,
  gross: 132,
};

describe("Payroll provider presets", () => {
  it("SD Worx CSV has the expected column order", () => {
    const csv = renderPayrollCsv(SD_WORX, [ROW]);
    expect(csv.split("\r\n")[0]).toBe(
      "employee_id,employee_name,date,wage_code,hours,rate",
    );
    expect(csv.split("\r\n")[1]).toBe("u1,Alice,2026-06-01,WORK,8.00,16.50");
  });

  it("Securex CSV includes from and to dates", () => {
    const csv = renderPayrollCsv(SECUREX, [ROW]);
    expect(csv.split("\r\n")[0]).toBe(
      "employee_number,employee_name,from_date,to_date,code,hours,gross_amount",
    );
    expect(csv.split("\r\n")[1]).toBe(
      "u1,Alice,2026-06-01,2026-06-01,WORK,8.00,132.00",
    );
  });

  it("Generic CSV is the safe fallback", () => {
    const csv = renderPayrollCsv(GENERIC, [ROW]);
    expect(csv).toContain("worker,date,hours,rate,gross,code");
    expect(csv).toContain("Alice,2026-06-01,8.00,16.50,132.00,WORK");
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
    },
  };

  it("computes net hours and gross from rate", () => {
    const [row] = buildPayrollRows([base], "Europe/Brussels");
    // 8.5h gross - 0.5h break = 8h net
    expect(row.hours).toBe(8);
    expect(row.gross).toBe(132);
  });

  it("uses the NISS as the worker identifier, never the internal id", () => {
    const [row] = buildPayrollRows([base], "Europe/Brussels");
    expect(row.workerExternalId).toBe("90010112345");
  });

  it("falls back to the email local-part when NISS is missing", () => {
    const [row] = buildPayrollRows(
      [{ ...base, user: { ...base.user, nationalNumber: null } }],
      "Europe/Brussels",
    );
    expect(row.workerExternalId).toBe("alice");
  });

  it("renders the date in the business timezone, not UTC", () => {
    // 23:30 UTC on the 1st is 01:30 on the 2nd in Brussels (CEST, +02:00).
    const lateNight = {
      ...base,
      clockInAt: new Date("2026-06-01T23:30:00Z"),
      clockOutAt: new Date("2026-06-02T03:00:00Z"),
      breakMinutes: 0,
    };
    const [row] = buildPayrollRows([lateNight], "Europe/Brussels");
    expect(row.date).toBe("2026-06-02");
    expect(formatPayrollDate(lateNight.clockInAt, "UTC")).toBe("2026-06-01");
  });
});

import { describe, expect, it } from "vitest";
import { SD_WORX, SECUREX, GENERIC, renderPayrollCsv } from "@/infrastructure/payroll/providers";

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

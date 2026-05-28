/**
 * Belgian payroll provider column layouts. We emit a tab-separated table that
 * each provider's import wizard can map. Header row is added as the first row.
 *
 * Sources (publicly documented):
 *  - SD Worx Easy Pay import: employee, date, code, hours, rate
 *  - Securex Connect import: employee, dateFrom, dateTo, code, hours, gross
 *
 * Real-world deployments fine-tune these to the customer's contract; the
 * presets give a working starting point that we cover with golden tests.
 */
export interface PayrollRow {
  workerExternalId: string;
  workerName: string;
  date: string;
  code: string;
  hours: number;
  rate: number;
  gross: number;
}

export interface PayrollProvider {
  id: "sdworx" | "securex" | "generic";
  fileSuffix: string;
  headers: string[];
  format(row: PayrollRow): string[];
}

export const SD_WORX: PayrollProvider = {
  id: "sdworx",
  fileSuffix: "-sdworx.csv",
  headers: ["employee_id", "employee_name", "date", "wage_code", "hours", "rate"],
  format(row) {
    return [
      row.workerExternalId,
      row.workerName,
      row.date,
      row.code,
      row.hours.toFixed(2),
      row.rate.toFixed(2),
    ];
  },
};

export const SECUREX: PayrollProvider = {
  id: "securex",
  fileSuffix: "-securex.csv",
  headers: [
    "employee_number",
    "employee_name",
    "from_date",
    "to_date",
    "code",
    "hours",
    "gross_amount",
  ],
  format(row) {
    return [
      row.workerExternalId,
      row.workerName,
      row.date,
      row.date,
      row.code,
      row.hours.toFixed(2),
      row.gross.toFixed(2),
    ];
  },
};

export const GENERIC: PayrollProvider = {
  id: "generic",
  fileSuffix: ".csv",
  headers: ["worker", "date", "hours", "rate", "gross", "code"],
  format(row) {
    return [
      row.workerName,
      row.date,
      row.hours.toFixed(2),
      row.rate.toFixed(2),
      row.gross.toFixed(2),
      row.code,
    ];
  },
};

export const PROVIDERS: Record<string, PayrollProvider> = {
  sdworx: SD_WORX,
  securex: SECUREX,
  generic: GENERIC,
};

function escape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function renderPayrollCsv(provider: PayrollProvider, rows: PayrollRow[]): string {
  const lines = [
    provider.headers.map(escape).join(","),
    ...rows.map((row) => provider.format(row).map(escape).join(",")),
  ];
  return lines.join("\r\n");
}

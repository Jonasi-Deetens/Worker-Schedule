/**
 * Belgian payroll provider column layouts. We emit a comma-separated table that
 * each provider's import wizard can map. The header row is added first.
 *
 * Each worked time entry is split into one row per wage code (regular,
 * overtime, night, weekend, holiday — see {@link splitWorkedMinutes}); approved
 * time-off produces ABSENCE rows; and JOBSTUDENT rows carry a student/solidarity
 * indicator so the social secretariat applies the 8.13% solidarity regime. We
 * never compute contributions or premiums here — that is the secretariat's job.
 *
 * Sources (publicly documented import templates):
 *  - SD Worx Easy Pay, Securex Connect, Partena, Liantis.
 *
 * Real-world deployments fine-tune these to the customer's contract; the
 * presets give a working starting point that we cover with golden tests.
 */
import {
  BUCKET_TO_CODE,
  splitWorkedMinutes,
  WAGE_CODES,
  type BucketConfig,
} from "./wage-codes";

export interface PayrollRow {
  workerExternalId: string;
  workerName: string;
  date: string;
  code: string;
  hours: number;
  rate: number;
  gross: number;
  /** True for JOBSTUDENT workers — flags the solidarity-contribution regime. */
  student: boolean;
}

export type PayrollProviderId =
  | "sdworx"
  | "securex"
  | "generic"
  | "partena"
  | "liantis";

export interface PayrollProvider {
  id: PayrollProviderId;
  /** Filename stem appended after `payroll-<range>`, before the extension. */
  fileStem: string;
  headers: string[];
  format(row: PayrollRow): string[];
}

/** Solidarity/student indicator rendered in the dedicated column. */
function studentFlag(row: PayrollRow): string {
  return row.student ? "STU" : "";
}

export const SD_WORX: PayrollProvider = {
  id: "sdworx",
  fileStem: "-sdworx",
  headers: [
    "employee_id",
    "employee_name",
    "date",
    "wage_code",
    "hours",
    "rate",
    "student",
  ],
  format(row) {
    return [
      row.workerExternalId,
      row.workerName,
      row.date,
      row.code,
      row.hours.toFixed(2),
      row.rate.toFixed(2),
      studentFlag(row),
    ];
  },
};

export const SECUREX: PayrollProvider = {
  id: "securex",
  fileStem: "-securex",
  headers: [
    "employee_number",
    "employee_name",
    "from_date",
    "to_date",
    "code",
    "hours",
    "gross_amount",
    "student",
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
      studentFlag(row),
    ];
  },
};

export const PARTENA: PayrollProvider = {
  id: "partena",
  fileStem: "-partena",
  headers: [
    "personnel_no",
    "name",
    "date",
    "wage_code",
    "hours",
    "amount",
    "student_flag",
  ],
  format(row) {
    return [
      row.workerExternalId,
      row.workerName,
      row.date,
      row.code,
      row.hours.toFixed(2),
      row.gross.toFixed(2),
      studentFlag(row),
    ];
  },
};

export const LIANTIS: PayrollProvider = {
  id: "liantis",
  fileStem: "-liantis",
  headers: [
    "employee",
    "date",
    "code",
    "hours",
    "rate",
    "gross",
    "solidarity",
  ],
  format(row) {
    return [
      row.workerExternalId,
      row.date,
      row.code,
      row.hours.toFixed(2),
      row.rate.toFixed(2),
      row.gross.toFixed(2),
      studentFlag(row),
    ];
  },
};

export const GENERIC: PayrollProvider = {
  id: "generic",
  fileStem: "",
  headers: ["worker", "date", "wage_code", "hours", "rate", "gross", "student"],
  format(row) {
    return [
      row.workerName,
      row.date,
      row.code,
      row.hours.toFixed(2),
      row.rate.toFixed(2),
      row.gross.toFixed(2),
      studentFlag(row),
    ];
  },
};

export const PROVIDERS: Record<string, PayrollProvider> = {
  sdworx: SD_WORX,
  securex: SECUREX,
  partena: PARTENA,
  liantis: LIANTIS,
  generic: GENERIC,
};

export type PayrollFormat = "csv" | "xlsx";

/** Normalises a `?format=` query value to a supported export format. */
export function resolveFormat(value: string | null | undefined): PayrollFormat {
  return (value ?? "").toLowerCase() === "xlsx" ? "xlsx" : "csv";
}

export function payrollContentType(format: PayrollFormat): string {
  return format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv; charset=utf-8";
}

/** Builds the download filename for a provider + format + date range. */
export function payrollFilename(
  provider: PayrollProvider,
  format: PayrollFormat,
  fromIso: string,
  toIso: string,
): string {
  return `payroll-${fromIso}-to-${toIso}${provider.fileStem}.${format}`;
}

/**
 * Formats a date in a specific IANA timezone as `YYYY-MM-DD`. Using the
 * business timezone (not UTC) keeps a 22:00–02:00 night shift on its real
 * calendar day instead of rolling it forward.
 */
export function formatPayrollDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface PayrollSourceEntry {
  clockInAt: Date;
  clockOutAt: Date | null;
  breakMinutes: number;
  user: {
    name: string;
    email: string;
    hourlyRate: unknown;
    nationalNumber: string | null;
    contractType?: string | null;
  };
}

function workerExternalId(user: PayrollSourceEntry["user"]): string {
  return user.nationalNumber ?? user.email.split("@")[0] ?? "";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pure transform from approved time entries to payroll rows. Each entry is
 * split into one row per non-empty wage-code bucket; hours are net of breaks,
 * the worker identifier is the NISS (never an internal id), and the date is
 * rendered in the supplied business timezone. JOBSTUDENT workers are flagged.
 */
export function buildPayrollRows(
  entries: PayrollSourceEntry[],
  config: BucketConfig,
): PayrollRow[] {
  const rows: PayrollRow[] = [];
  for (const entry of entries) {
    const rate = entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 0;
    const date = formatPayrollDate(entry.clockInAt, config.timeZone);
    const student = entry.user.contractType === "JOBSTUDENT";
    const buckets = splitWorkedMinutes(
      entry.clockInAt,
      entry.clockOutAt,
      entry.breakMinutes,
      config,
    );
    for (const [key, code] of BUCKET_TO_CODE) {
      const minutes = buckets[key];
      if (minutes <= 0) continue;
      const hours = round2(minutes / 60);
      rows.push({
        workerExternalId: workerExternalId(entry.user),
        workerName: entry.user.name,
        date,
        code,
        hours,
        rate,
        gross: round2(hours * rate),
        student,
      });
    }
  }
  return rows;
}

export interface AbsenceSourceRequest {
  startsAt: Date;
  endsAt: Date;
  user: {
    name: string;
    email: string;
    hourlyRate: unknown;
    nationalNumber: string | null;
    contractType?: string | null;
  };
}

/** Inclusive list of `YYYY-MM-DD` calendar days between two instants in `tz`. */
export function eachCalendarDay(
  from: Date,
  to: Date,
  timeZone: string,
): string[] {
  if (to.getTime() < from.getTime()) return [];
  const days: string[] = [];
  const endStr = formatPayrollDate(to, timeZone);
  // Step from local noon to dodge DST edges; stop once we pass the end day.
  const cursor = new Date(from.getTime());
  cursor.setUTCHours(12, 0, 0, 0);
  if (cursor.getTime() < from.getTime()) {
    cursor.setTime(cursor.getTime() + 86_400_000);
  }
  let guard = 0;
  while (guard++ < 1000) {
    const day = formatPayrollDate(cursor, timeZone);
    if (day > endStr) break;
    if (days[days.length - 1] !== day) days.push(day);
    cursor.setTime(cursor.getTime() + 86_400_000);
  }
  return days;
}

/**
 * Builds one ABSENCE row per absence day, clamped to the export window. Hours
 * are left at 0 — the social secretariat fills the contractual day length —
 * but the day, worker and student flag are present so leave is never silently
 * dropped from the export.
 */
export function buildAbsenceRows(
  requests: AbsenceSourceRequest[],
  period: { from: Date; to: Date },
  timeZone: string,
): PayrollRow[] {
  const rows: PayrollRow[] = [];
  for (const request of requests) {
    const start =
      request.startsAt.getTime() > period.from.getTime()
        ? request.startsAt
        : period.from;
    const end =
      request.endsAt.getTime() < period.to.getTime()
        ? request.endsAt
        : period.to;
    const rate = request.user.hourlyRate ? Number(request.user.hourlyRate) : 0;
    const student = request.user.contractType === "JOBSTUDENT";
    for (const day of eachCalendarDay(start, end, timeZone)) {
      rows.push({
        workerExternalId: workerExternalId(request.user),
        workerName: request.user.name,
        date: day,
        code: WAGE_CODES.ABSENCE,
        hours: 0,
        rate,
        gross: 0,
        student,
      });
    }
  }
  return rows;
}

export interface StuVarianceRow {
  workerExternalId: string;
  workerName: string;
  plannedHours: number;
  actualHours: number;
  /** actual − planned: positive = worked beyond the Dimona STU reservation. */
  variance: number;
}

export interface StuDeclarationInput {
  userId: string;
  plannedHours: number;
  user: {
    name: string;
    email: string;
    nationalNumber: string | null;
  };
}

export interface StuActualEntry {
  userId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  breakMinutes: number;
}

/**
 * Compares Dimona STU planned (reserved) hours for the quarter against actual
 * approved worked hours, so over- and under-reservation is visible per worker.
 */
export function summarizeStuVariance(
  declarations: StuDeclarationInput[],
  entries: StuActualEntry[],
): StuVarianceRow[] {
  const actualMinutes = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.clockOutAt) continue;
    const gross = Math.max(
      0,
      Math.floor((entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 60_000),
    );
    const net = Math.max(0, gross - Math.max(0, entry.breakMinutes));
    actualMinutes.set(entry.userId, (actualMinutes.get(entry.userId) ?? 0) + net);
  }

  return declarations.map((declaration) => {
    const actualHours = round2((actualMinutes.get(declaration.userId) ?? 0) / 60);
    const plannedHours = declaration.plannedHours;
    return {
      workerExternalId:
        declaration.user.nationalNumber ??
        declaration.user.email.split("@")[0] ??
        "",
      workerName: declaration.user.name,
      plannedHours,
      actualHours,
      variance: round2(actualHours - plannedHours),
    };
  });
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function renderPayrollCsv(provider: PayrollProvider, rows: PayrollRow[]): string {
  const lines = [
    provider.headers.map(escapeCsv).join(","),
    ...rows.map((row) => provider.format(row).map(escapeCsv).join(",")),
  ];
  return lines.join("\r\n");
}

/** Headers used for the STU planned-vs-actual variance section/sheet. */
export const VARIANCE_HEADERS = [
  "worker",
  "employee_id",
  "planned_hours",
  "actual_hours",
  "variance",
] as const;

export function varianceRowCells(row: StuVarianceRow): string[] {
  return [
    row.workerName,
    row.workerExternalId,
    row.plannedHours.toFixed(2),
    row.actualHours.toFixed(2),
    row.variance.toFixed(2),
  ];
}

/**
 * Renders the full CSV body: the main wage-code table, then (when present) a
 * blank line and a STU planned-vs-actual variance section.
 */
export function renderPayrollCsvWithVariance(
  provider: PayrollProvider,
  rows: PayrollRow[],
  variance: StuVarianceRow[],
): string {
  const main = renderPayrollCsv(provider, rows);
  if (variance.length === 0) return main;
  const section = [
    "",
    "# STU planned vs actual",
    VARIANCE_HEADERS.map(escapeCsv).join(","),
    ...variance.map((row) => varianceRowCells(row).map(escapeCsv).join(",")),
  ];
  return [main, ...section].join("\r\n");
}

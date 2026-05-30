import type { ContractType, PrismaClient } from "@prisma/client";
import { decryptPiiNullable } from "@/infrastructure/crypto/pii";
import {
  CONTRACT_TEMPLATE_FIELDS as F,
  type ContractTemplateFieldValues,
} from "@/infrastructure/contracts/contract-template-fields";
import type { ContractPdfInput } from "@/infrastructure/contracts/contract-pdf";

function fmtDate(d?: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function fmtWage(cents?: number | null): string {
  if (cents == null) return "";
  return `€ ${(cents / 100).toFixed(2)} / h`;
}

function defaultEndDate(start: Date): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + 3);
  return end;
}

function defaultTitle(contractType: ContractType | null | undefined): string {
  if (contractType === "JOBSTUDENT") {
    return "Student employment agreement";
  }
  return "Employment agreement";
}

export interface ContractPrefillResult {
  title: string;
  contractType: ContractType | null;
  startDate: Date;
  endDate: Date;
  scheduleText: string | null;
  hourlyWageCents: number | null;
  jobDescription: string | null;
  fieldValues: ContractTemplateFieldValues;
  pdfInput: ContractPdfInput;
  completeness: {
    ready: boolean;
    missing: string[];
  };
}

export interface ContractSendOverrides {
  title?: string;
  contractType?: ContractType;
  startDate?: Date | null;
  endDate?: Date | null;
  scheduleText?: string | null;
  hourlyWageCents?: number | null;
  jobDescription?: string | null;
}

/**
 * Derives a human-readable schedule from upcoming confirmed assignments.
 */
export async function deriveScheduleFromShifts(
  db: PrismaClient,
  input: {
    userId: string;
    businessId: string;
    from: Date;
    to: Date;
  },
): Promise<string | null> {
  const assignments = await db.shiftAssignment.findMany({
    where: {
      userId: input.userId,
      status: "CONFIRMED",
      shift: {
        businessId: input.businessId,
        status: { not: "CANCELLED" },
        startsAt: { gte: input.from, lt: input.to },
      },
    },
    include: {
      shift: { select: { startsAt: true, endsAt: true, roleLabel: true } },
    },
    orderBy: { shift: { startsAt: "asc" } },
    take: 20,
  });
  if (assignments.length === 0) return null;

  const lines = assignments.map((a) => {
    const s = a.shift.startsAt;
    const e = a.shift.endsAt;
    const day = s.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" });
    const start = s.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
    const end = e.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
    return `${day} ${start}–${end} (${a.shift.roleLabel})`;
  });
  return lines.join("; ");
}

export async function buildContractPrefill(
  db: PrismaClient,
  input: {
    businessId: string;
    userId: string;
    overrides?: ContractSendOverrides;
    locale?: "nl" | "fr" | "en";
  },
): Promise<ContractPrefillResult> {
  const [business, student] = await Promise.all([
    db.business.findUnique({
      where: { id: input.businessId },
      select: {
        name: true,
        dimonaEmployerId: true,
        addressLine: true,
        postalCode: true,
        city: true,
        cbeNumber: true,
        contractTemplateUrlNl: true,
        contractTemplateUrlFr: true,
      },
    }),
    db.user.findUnique({
      where: { id: input.userId },
      select: {
        name: true,
        contractType: true,
        nationalNumber: true,
        addressLine: true,
        postalCode: true,
        city: true,
        birthDate: true,
        iban: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        hourlyRate: true,
      },
    }),
  ]);

  const contractType =
    input.overrides?.contractType ?? student?.contractType ?? null;

  const startDate =
    input.overrides?.startDate ?? new Date(new Date().setHours(0, 0, 0, 0));
  const endDate =
    input.overrides?.endDate ?? defaultEndDate(startDate);

  const hourlyWageCents =
    input.overrides?.hourlyWageCents ??
    (student?.hourlyRate != null
      ? Math.round(Number(student.hourlyRate) * 100)
      : null);

  let jobDescription = input.overrides?.jobDescription ?? null;
  if (!jobDescription) {
    const lastAssignment = await db.shiftAssignment.findFirst({
      where: {
        userId: input.userId,
        status: "CONFIRMED",
        shift: { businessId: input.businessId },
      },
      include: { shift: { select: { roleLabel: true } } },
      orderBy: { shift: { startsAt: "desc" } },
    });
    jobDescription = lastAssignment?.shift.roleLabel ?? null;
  }

  let scheduleText = input.overrides?.scheduleText ?? null;
  if (!scheduleText) {
    scheduleText = await deriveScheduleFromShifts(db, {
      userId: input.userId,
      businessId: input.businessId,
      from: startDate,
      to: endDate,
    });
  }

  const title =
    input.overrides?.title?.trim() ||
    defaultTitle(contractType ?? undefined);

  const studentAddress = [
    student?.addressLine,
    [student?.postalCode, student?.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const employerAddress = [
    business?.addressLine,
    [business?.postalCode, business?.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const employerSnapshot = {
    name: business?.name ?? null,
    enterpriseNumber:
      business?.cbeNumber ?? business?.dimonaEmployerId ?? null,
    address: employerAddress || null,
  };

  const niss = decryptPiiNullable(student?.nationalNumber ?? null);
  const studentSnapshot = {
    name: student?.name ?? null,
    nationalNumber: niss,
    address: studentAddress || null,
  };

  const pdfInput: ContractPdfInput = {
    title,
    employer: employerSnapshot,
    student: studentSnapshot,
    startDate,
    endDate,
    scheduleText,
    hourlyWageCents,
    jobDescription,
    contractType,
    studentBirthDate: student?.birthDate ?? null,
    studentIban: student?.iban ?? null,
    studentEmergencyName: student?.emergencyContactName ?? null,
    studentEmergencyPhone: student?.emergencyContactPhone ?? null,
  };

  const fieldValues: ContractTemplateFieldValues = {
    [F.contractTitle]: title,
    [F.contractType]: contractType ?? "",
    [F.employerName]: employerSnapshot.name ?? "",
    [F.employerAddress]: employerSnapshot.address ?? "",
    [F.employerCbe]: employerSnapshot.enterpriseNumber ?? "",
    [F.studentName]: studentSnapshot.name ?? "",
    [F.studentNiss]: niss ?? "",
    [F.studentAddress]: studentSnapshot.address ?? "",
    [F.studentBirthDate]: fmtDate(student?.birthDate),
    [F.studentIban]: student?.iban ?? "",
    [F.studentEmergencyName]: student?.emergencyContactName ?? "",
    [F.studentEmergencyPhone]: student?.emergencyContactPhone ?? "",
    [F.startDate]: fmtDate(startDate),
    [F.endDate]: fmtDate(endDate),
    [F.hourlyWage]: fmtWage(hourlyWageCents),
    [F.schedule]: scheduleText ?? "",
    [F.jobDescription]: jobDescription ?? "",
  };

  const missing: string[] = [];
  if (!employerSnapshot.name) missing.push("employer_name");
  if (!employerSnapshot.address) missing.push("employer_address");
  if (!employerSnapshot.enterpriseNumber) missing.push("employer_cbe");
  if (!studentSnapshot.name) missing.push("student_name");
  if (!niss) missing.push("student_niss");
  if (!studentSnapshot.address) missing.push("student_address");
  if (!hourlyWageCents) missing.push("hourly_wage");
  if (!jobDescription) missing.push("job_description");
  if (!scheduleText) missing.push("schedule");

  const hasTemplate =
    Boolean(business?.contractTemplateUrlNl) ||
    Boolean(business?.contractTemplateUrlFr);

  return {
    title,
    contractType,
    startDate,
    endDate,
    scheduleText,
    hourlyWageCents,
    jobDescription,
    fieldValues,
    pdfInput,
    completeness: {
      ready: missing.length === 0 || !hasTemplate,
      missing,
    },
  };
}

export function fieldValuesWithSignedAt(
  base: ContractTemplateFieldValues,
  signedAt: Date,
): ContractTemplateFieldValues {
  return {
    ...base,
    [F.signedAt]: signedAt.toISOString().slice(0, 16).replace("T", " "),
  };
}

/** @deprecated Use {@link fieldValuesWithSignedAt} — signatures are drawn images. */
export function fieldValuesWithSignature(
  base: ContractTemplateFieldValues,
  input: { signatureName: string; signedAt: Date },
): ContractTemplateFieldValues {
  return fieldValuesWithSignedAt(base, input.signedAt);
}

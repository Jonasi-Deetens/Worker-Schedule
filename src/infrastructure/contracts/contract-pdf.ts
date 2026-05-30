import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ContractTemplateFieldValues } from "./contract-template-fields";
import { CONTRACT_TEMPLATE_FIELDS as F } from "./contract-template-fields";
import { createDefaultFillableTemplate } from "./create-default-template";

export interface ContractPdfInput {
  title: string;
  employer: {
    name?: string | null;
    address?: string | null;
    enterpriseNumber?: string | null;
  };
  student: {
    name?: string | null;
    nationalNumber?: string | null;
    address?: string | null;
  };
  startDate?: Date | null;
  endDate?: Date | null;
  scheduleText?: string | null;
  hourlyWageCents?: number | null;
  jobDescription?: string | null;
  contractType?: string | null;
  studentBirthDate?: Date | null;
  studentIban?: string | null;
  studentEmergencyName?: string | null;
  studentEmergencyPhone?: string | null;
}

function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

function fmtWage(cents?: number | null): string {
  if (cents == null) return "—";
  return `€ ${(cents / 100).toFixed(2)} / h`;
}

/** Maps structured input to template field values when only pdfInput is available. */
export function pdfInputToFieldValues(
  input: ContractPdfInput,
): ContractTemplateFieldValues {
  return {
    [F.contractTitle]: input.title,
    [F.contractType]: input.contractType ?? "",
    [F.employerName]: input.employer.name ?? "",
    [F.employerAddress]: input.employer.address ?? "",
    [F.employerCbe]: input.employer.enterpriseNumber ?? "",
    [F.studentName]: input.student.name ?? "",
    [F.studentNiss]: input.student.nationalNumber ?? "",
    [F.studentAddress]: input.student.address ?? "",
    [F.studentBirthDate]: input.studentBirthDate
      ? fmtDate(input.studentBirthDate)
      : "",
    [F.studentIban]: input.studentIban ?? "",
    [F.studentEmergencyName]: input.studentEmergencyName ?? "",
    [F.studentEmergencyPhone]: input.studentEmergencyPhone ?? "",
    [F.startDate]: fmtDate(input.startDate),
    [F.endDate]: fmtDate(input.endDate),
    [F.hourlyWage]: fmtWage(input.hourlyWageCents),
    [F.schedule]: input.scheduleText ?? "",
    [F.jobDescription]: input.jobDescription ?? "",
  };
}

/**
 * Fills an AcroForm PDF template with the provided field map. Unknown fields
 * are skipped so partially-compatible templates still work.
 */
export async function fillContractTemplate(
  templateBytes: Uint8Array,
  fields: ContractTemplateFieldValues,
  options?: { flatten?: boolean },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();

  for (const [name, value] of Object.entries(fields)) {
    if (value == null || value === "") continue;
    try {
      const field = form.getTextField(name);
      field.setText(value);
    } catch {
      // Field not present on this template — ignore.
    }
  }

  try {
    form.updateFieldAppearances();
  } catch {
    // Some minimal templates may lack font resources — still save filled values.
  }

  if (options?.flatten) {
    form.flatten();
  }

  return doc.save();
}

/**
 * Renders a simple summary PDF (fallback when no business template is set).
 */
export async function generateSimpleContractPdf(
  input: ContractPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  let y = 800;
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.4, 0.43, 0.48);

  const line = (
    text: string,
    opts: { size?: number; font?: typeof font; color?: typeof ink; gap?: number } = {},
  ) => {
    const size = opts.size ?? 11;
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: opts.font ?? font,
      color: opts.color ?? ink,
    });
    y -= opts.gap ?? size + 8;
  };

  const heading = (text: string) => {
    y -= 6;
    line(text, { size: 13, font: bold });
  };

  const field = (label: string, value: string) => {
    page.drawText(`${label}:`, { x: margin, y, size: 10, font: bold, color: muted });
    page.drawText(value, { x: margin + 150, y, size: 10, font, color: ink });
    y -= 18;
  };

  line(input.title, { size: 18, font: bold, gap: 28 });

  heading("Employer");
  field("Name", input.employer.name ?? "—");
  field("Address", input.employer.address ?? "—");
  field("Enterprise no.", input.employer.enterpriseNumber ?? "—");

  heading("Student");
  field("Name", input.student.name ?? "—");
  field("National number", input.student.nationalNumber ?? "—");
  field("Address", input.student.address ?? "—");

  heading("Terms");
  field("Contract type", input.contractType ?? "Student");
  field("Start date", fmtDate(input.startDate));
  field("End date", fmtDate(input.endDate));
  field("Hourly wage", fmtWage(input.hourlyWageCents));

  heading("Work schedule");
  line(input.scheduleText ?? "—", { size: 10, gap: 16 });

  heading("Job description");
  line(input.jobDescription ?? "—", { size: 10, gap: 16 });

  heading("Signatures");
  line(
    "Signed electronically by the student via Work Calendar.",
    { size: 10, color: muted, gap: 30 },
  );

  page.drawText("Student signature: _______________________", {
    x: margin,
    y,
    size: 10,
    font,
    color: ink,
  });
  y -= 24;
  page.drawText("Employer signature: ______________________", {
    x: margin,
    y,
    size: 10,
    font,
    color: ink,
  });

  return doc.save();
}

export type ContractTemplateLocale = "nl" | "fr";

/**
 * Generates a contract PDF: uses the business template when configured,
 * otherwise the built-in fillable default, otherwise the simple summary layout.
 */
export async function generateContractPdf(input: {
  pdfInput: ContractPdfInput;
  fieldValues?: ContractTemplateFieldValues;
  templateBytes?: Uint8Array | null;
}): Promise<Uint8Array> {
  const fields = input.fieldValues ?? pdfInputToFieldValues(input.pdfInput);

  if (input.templateBytes && input.templateBytes.length > 0) {
    return fillContractTemplate(input.templateBytes, fields, { flatten: true });
  }

  const defaultTemplate = await createDefaultFillableTemplate();
  return fillContractTemplate(defaultTemplate, fields, { flatten: true });
}

/** @deprecated Use {@link generateSimpleContractPdf} — kept for tests importing the old name. */
export const generateContractPdfLegacy = generateSimpleContractPdf;

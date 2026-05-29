import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
}

function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

function fmtWage(cents?: number | null): string {
  if (cents == null) return "—";
  return `€ ${(cents / 100).toFixed(2)} / h`;
}

/**
 * Renders a simple but complete Belgian student-contract PDF with pdf-lib.
 * Deliberately self-contained (standard fonts only) so it runs anywhere Node
 * does, including tests, without external assets.
 */
export async function generateContractPdf(
  input: ContractPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 portrait
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

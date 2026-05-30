import { PDFDocument, StandardFonts } from "pdf-lib";
import { CONTRACT_TEMPLATE_FIELDS as F } from "./contract-template-fields";

/**
 * Builds a minimal fillable student-contract PDF for dev, tests, and as the
 * built-in fallback when a business has not uploaded a custom template.
 */
export async function createDefaultFillableTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();

  const addField = (name: string, label: string, y: number) => {
    page.drawText(label, { x: 56, y, size: 9, font });
    const field = form.createTextField(name);
    field.addToPage(page, { x: 200, y: y - 4, width: 320, height: 14 });
    field.setFontSize(9);
  };

  page.drawText("Student employment agreement (model)", {
    x: 56,
    y: 800,
    size: 14,
    font,
  });

  let y = 760;
  const fields: [string, string][] = [
    [F.contractTitle, "Title"],
    [F.contractType, "Contract type"],
    [F.employerName, "Employer"],
    [F.employerAddress, "Employer address"],
    [F.employerCbe, "Enterprise no."],
    [F.studentName, "Student"],
    [F.studentNiss, "NISS"],
    [F.studentAddress, "Student address"],
    [F.studentBirthDate, "Birth date"],
    [F.studentIban, "IBAN"],
    [F.studentEmergencyName, "Emergency contact"],
    [F.studentEmergencyPhone, "Emergency phone"],
    [F.startDate, "Start date"],
    [F.endDate, "End date"],
    [F.hourlyWage, "Hourly wage"],
    [F.schedule, "Schedule"],
    [F.jobDescription, "Job description"],
    [F.signatureStudent, "Student signature"],
    [F.signatureEmployer, "Employer signature"],
    [F.signedAt, "Signed at"],
  ];

  for (const [name, label] of fields) {
    addField(name, label, y);
    y -= 28;
  }

  return doc.save();
}

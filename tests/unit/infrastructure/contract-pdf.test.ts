import { describe, expect, it } from "vitest";
import { createDefaultFillableTemplate } from "@/infrastructure/contracts/create-default-template";
import { CONTRACT_TEMPLATE_FIELDS as F } from "@/infrastructure/contracts/contract-template-fields";
import {
  fillContractTemplate,
  generateContractPdf,
  pdfInputToFieldValues,
} from "@/infrastructure/contracts/contract-pdf";

describe("contract PDF template fill", () => {
  it("fills all fields on the default fillable template", async () => {
    const template = await createDefaultFillableTemplate();
    const fields = {
      [F.employerName]: "Cafe BV",
      [F.studentNiss]: "90010112345",
      [F.hourlyWage]: "€ 14.50 / h",
      [F.signatureStudent]: "Jane Doe",
    };
    const filled = await fillContractTemplate(template, fields, { flatten: true });
    expect(filled.byteLength).toBeGreaterThan(template.byteLength);
  });

  it("generateContractPdf uses default template when no custom bytes", async () => {
    const pdfInput = {
      title: "Student agreement",
      employer: { name: "Cafe", address: "Brussels", enterpriseNumber: "BE0123" },
      student: { name: "Jan", nationalNumber: "90010112345", address: "Gent" },
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-08-31"),
      scheduleText: "Weekends",
      hourlyWageCents: 1450,
      jobDescription: "Waiter",
      contractType: "JOBSTUDENT",
    };
    const bytes = await generateContractPdf({
      pdfInput,
      fieldValues: pdfInputToFieldValues(pdfInput),
      templateBytes: null,
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

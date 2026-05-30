import { PDFDocument, type PDFPage } from "pdf-lib";
import { CONTRACT_TEMPLATE_FIELDS as F } from "./contract-template-fields";
import type { ContractTemplateFieldValues } from "./contract-template-fields";
import {
  OFFICIAL_CONTRACT_SIGNATURE_LAYOUT,
  type ContractSignatureLayout,
  type SignatureBox,
} from "./contract-template-layout";
import type { ContractTemplateLocale } from "./contract-pdf";

function scaleToFit(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const ratio = Math.min(boxW / imgW, boxH / imgH);
  return { width: imgW * ratio, height: imgH * ratio };
}

async function drawPngInBox(
  doc: PDFDocument,
  page: PDFPage,
  pngBytes: Uint8Array,
  box: SignatureBox,
) {
  const image = await doc.embedPng(pngBytes);
  const { width, height } = scaleToFit(
    image.width,
    image.height,
    box.width,
    box.height,
  );
  const x = box.x + (box.width - width) / 2;
  const y = box.y + (box.height - height) / 2;
  page.drawImage(image, { x, y, width, height });
}

function rectFromAcroField(
  doc: PDFDocument,
  fieldName: string,
): SignatureBox | null {
  try {
    const form = doc.getForm();
    const field = form.getTextField(fieldName);
    const widgets = field.acroField.getWidgets();
    if (widgets.length === 0) return null;
    const rect = widgets[0]!.getRectangle();
    const page = widgets[0]!.P();
    const pages = doc.getPages();
    const pageIndex = pages.findIndex((p) => p.ref === page);
    return {
      pageIndex: pageIndex >= 0 ? pageIndex : 0,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  } catch {
    return null;
  }
}

function resolveStudentBox(
  doc: PDFDocument,
  layout: ContractSignatureLayout,
): SignatureBox {
  return (
    rectFromAcroField(doc, F.signatureStudent) ?? layout.student
  );
}

function resolveEmployerBox(
  doc: PDFDocument,
  layout: ContractSignatureLayout,
): SignatureBox {
  return (
    rectFromAcroField(doc, F.signatureEmployer) ?? layout.employer
  );
}

/**
 * Fills AcroForm fields, embeds signature PNGs, optionally flattens.
 */
export async function fillContractWithSignatures(input: {
  templateBytes: Uint8Array;
  fieldValues: ContractTemplateFieldValues;
  locale: ContractTemplateLocale;
  studentSignaturePng?: Uint8Array | null;
  employerSignaturePng?: Uint8Array | null;
  flatten?: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input.templateBytes);
  const form = doc.getForm();
  const layout = OFFICIAL_CONTRACT_SIGNATURE_LAYOUT[input.locale];

  for (const [name, value] of Object.entries(input.fieldValues)) {
    if (value == null || value === "") continue;
    if (name === F.signatureStudent || name === F.signatureEmployer) continue;
    try {
      form.getTextField(name).setText(value);
    } catch {
      // Field absent on template.
    }
  }

  try {
    form.updateFieldAppearances();
  } catch {
    // ignore
  }

  const pages = doc.getPages();

  if (input.studentSignaturePng) {
    const box = resolveStudentBox(doc, layout);
    const page = pages[box.pageIndex] ?? pages[pages.length - 1]!;
    await drawPngInBox(doc, page, input.studentSignaturePng, box);
  }

  if (input.employerSignaturePng) {
    const box = resolveEmployerBox(doc, layout);
    const page = pages[box.pageIndex] ?? pages[pages.length - 1]!;
    await drawPngInBox(doc, page, input.employerSignaturePng, box);
  }

  if (input.flatten) {
    form.flatten();
  }

  return doc.save();
}

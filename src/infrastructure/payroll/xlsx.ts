/**
 * Excel (.xlsx) rendering for payroll exports, isolated in its own module so
 * the heavy `exceljs` dependency is only loaded when a caller actually requests
 * the Excel format (the route dynamically imports this file). The CSV path has
 * no dependency on exceljs at all.
 */
import { Workbook } from "exceljs";
import {
  VARIANCE_HEADERS,
  varianceRowCells,
  type PayrollProvider,
  type PayrollRow,
  type StuVarianceRow,
} from "./providers";

/**
 * Builds a workbook with a "Payroll" sheet (the provider's wage-code table)
 * and, when present, a "STU variance" sheet. Returns the raw xlsx bytes.
 */
export async function renderPayrollXlsx(
  provider: PayrollProvider,
  rows: PayrollRow[],
  variance: StuVarianceRow[],
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = "Work Calendar";
  workbook.created = new Date(0);

  const sheet = workbook.addWorksheet("Payroll");
  sheet.addRow(provider.headers);
  for (const row of rows) {
    sheet.addRow(provider.format(row));
  }

  if (variance.length > 0) {
    const varianceSheet = workbook.addWorksheet("STU variance");
    varianceSheet.addRow([...VARIANCE_HEADERS]);
    for (const row of variance) {
      varianceSheet.addRow(varianceRowCells(row));
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

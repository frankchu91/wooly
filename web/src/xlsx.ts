import type { Worksheet } from "exceljs";

/**
 * The spreadsheet exports, built as real workbooks rather than CSV.
 *
 * A CSV is a snapshot: change the date you opened an account and every deadline on the
 * row is stale. The user works the sheet after downloading it, so the dates are
 * formulas off an "Opened on" cell, the status is a dropdown, and money and dates carry
 * number formats a spreadsheet can add and sort. ExcelJS is loaded on the click that
 * needs it, not with the page.
 */

export const MONEY_FORMAT = '"$"#,##0';
export const DATE_FORMAT = "yyyy-mm-dd";

/** The one `exceljs` import, deferred: the library is a good deal larger than the rest
 * of the app, and only a download needs it. */
export async function loadExcel() {
  const mod = await import("exceljs");
  return mod.default ?? mod;
}

export interface ColumnSpec {
  header: string;
  key: string;
  width: number;
  /** Excel number format for the column's body cells. */
  numFmt?: string;
  /** Wrap long text (requirements, notes) instead of running off the cell. */
  wrap?: boolean;
}

/** Column headers, widths and formats; the header row bold on a tinted band, frozen so
 * it stays put while the rows scroll. */
export function defineColumns(sheet: Worksheet, columns: ColumnSpec[]): void {
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
    style: {
      numFmt: column.numFmt,
      alignment: column.wrap ? { wrapText: true, vertical: "top" } : { vertical: "top" },
    },
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF3E8" } };
  header.alignment = { vertical: "middle" };
}

/** Row 2 is the totals row, above the data as on screen; the cells named here become
 * SUM formulas over the data rows below, so they follow every edit. */
export function addTotalsRow(
  sheet: Worksheet,
  label: string,
  sumColumns: string[],
  lastDataRow: number,
): void {
  const row = sheet.getRow(2);
  row.getCell(1).value = label;
  row.font = { bold: true };
  if (lastDataRow < 3) return;
  for (const column of sumColumns) {
    const letter = columnLetter(sheet, column);
    row.getCell(column).value = { formula: `SUM(${letter}3:${letter}${lastDataRow})` };
  }
}

/** Freeze the header and totals rows. */
export function freezeTop(sheet: Worksheet): void {
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

/** A dropdown on every data cell of a column, refusing anything not on the list. */
export function addListValidation(
  sheet: Worksheet,
  column: string,
  options: string[],
  lastDataRow: number,
): void {
  for (let rowNumber = 3; rowNumber <= lastDataRow; rowNumber += 1) {
    sheet.getCell(rowNumber, columnNumber(sheet, column)).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${options.join(",")}"`],
    };
  }
}

/** `date + days` as a formula, blank while the date cell is blank, so the deadline
 * follows the date the user types rather than freezing at export time. */
export function dateOffsetFormula(
  sheet: Worksheet,
  dateColumn: string,
  daysColumn: string,
  rowNumber: number,
): { formula: string } {
  const date = `${columnLetter(sheet, dateColumn)}${rowNumber}`;
  const days = `${columnLetter(sheet, daysColumn)}${rowNumber}`;
  return { formula: `IF(${date}="","",${date}+${days})` };
}

export function hyperlink(url: string, text: string) {
  return { text, hyperlink: url };
}

/** A `YYYY-MM-DD` string as the Date a spreadsheet stores, at local midnight so the day
 * does not shift for anyone west of UTC. */
export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function columnNumber(sheet: Worksheet, key: string): number {
  return sheet.getColumn(key).number;
}

function columnLetter(sheet: Worksheet, key: string): string {
  return sheet.getColumn(key).letter;
}

/**
 * Hands a finished workbook to the browser's downloader.
 *
 * The file is built here and never leaves the device on its way out of it, the same
 * promise the rest of the app makes about the data going in.
 */
export async function downloadWorkbook(
  filename: string,
  workbook: { xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array> } },
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** `woolly-plan-2026-09-14.xlsx`: dated, so a user who exports twice ends up with a
 * folder that sorts itself rather than `woolly-plan (3).xlsx`. */
export function datedFilename(stem: string, today: Date): string {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `woolly-${stem}-${year}-${month}-${day}.xlsx`;
}

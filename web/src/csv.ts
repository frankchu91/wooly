/**
 * Turning rows of strings into a file a spreadsheet opens correctly.
 *
 * Shared by the plan export and the ledger export, which are the same problem twice:
 * CSV is the only format every version of Excel, Numbers and Google Sheets opens by
 * double-click without an import wizard, and getting it right is entirely about the
 * three details below.
 */

/** A cell a spreadsheet would otherwise execute. Excel and Sheets treat a leading
 * `= + - @` (and the two control characters that can smuggle one in) as the start of a
 * formula, so a value beginning with one is prefixed with an apostrophe — the
 * spreadsheet then shows the text and runs nothing. */
function defuse(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One CSV field: quoted only when it has to be, with inner quotes doubled — the
 * escaping every spreadsheet agrees on. */
export function csvCell(value: string): string {
  const safe = defuse(value);
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** A number for the spreadsheet to add up, or an empty cell — never `0` standing in for
 * "nothing here", which would quietly drag a total or an average off. */
export const csvAmount = (value: number | null | undefined): string =>
  value == null ? "" : String(value);

const BOM = "\uFEFF";

/**
 * Rows to file text. It opens with a UTF-8 byte-order mark because Excel on Windows
 * otherwise reads a CSV as the local code page and mangles every non-ASCII character in
 * a bank name; and its lines end `\r\n`, which is what the CSV format specifies and what
 * older Excel builds need to see a line break inside a quoted cell.
 */
export function toCsv(rows: string[][]): string {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return `${BOM}${body}\r\n`;
}

/**
 * Hands a generated file to the browser's downloader.
 *
 * The file is built here and never leaves the device on its way out of it — the same
 * promise the rest of the app makes about the data going in. A viewer's sandbox can
 * block a script-driven save, so this is only ever reached from a real user click.
 */
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** `woolly-plan-2026-09-14.csv` — dated, so a user who exports twice ends up with a
 * folder that sorts itself rather than `woolly-plan (3).csv`. */
export function datedCsvFilename(stem: string, today: Date): string {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `woolly-${stem}-${year}-${month}-${day}.csv`;
}

import { format } from "date-fns";

import { hasPosted, receivedAmount } from "../../engine/conditions";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { ddDeadlineFor, requirementsProgress, safeCloseFor, sortForLedger } from "./trackerModel";

/**
 * The ledger as a spreadsheet file (CSV, which every version of Excel, Numbers and
 * Sheets opens by double-click).
 *
 * Two deliberate differences from the on-screen table: money is written as a bare
 * number and dates as `YYYY-MM-DD`, because a `$1,000` string and a `Sep 14, 2026`
 * string are text to a spreadsheet — you cannot sum or sort them. Everything else,
 * including the totals row sitting directly under the header, matches what the page
 * shows, so the file reads like the screen it came from.
 */

const { fields, statuses, ledger } = t.tracker;

export const LEDGER_CSV_HEADERS = [
  ledger.csv.bank,
  fields.offer,
  ledger.csv.applicant,
  fields.bonus,
  fields.received,
  fields.requirements,
  fields.opened,
  fields.ddBy,
  ledger.csv.receivedOn,
  fields.closeAfter,
  fields.stage,
  ledger.csv.notes,
];

/** A cell a spreadsheet would otherwise execute. Excel and Sheets treat a leading
 * `= + - @` (and the two control characters that can smuggle one in) as the start of a
 * formula, so a bank name or a note beginning with one is prefixed with an apostrophe —
 * the spreadsheet then shows the text and runs nothing. */
function defuse(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One CSV field: quoted only when it has to be, with inner quotes doubled — the
 * escaping every spreadsheet agrees on. */
function cell(value: string): string {
  const safe = defuse(value);
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** A number for the spreadsheet to add up, or an empty cell — never `0` standing in for
 * "nothing here", which would quietly drag an average down. */
const amount = (value: number | null): string => (value == null ? "" : String(value));

/**
 * The ledger's rows as plain strings: the header, the totals, then one row per tracked
 * item in the same order the table shows them. Every item is exported — the table's
 * "show closed" toggle hides rows on screen, but a file that silently dropped accounts
 * would be a worse record than the one it replaces.
 */
export function ledgerCsvRows(
  items: TrackedItem[],
  bonusesById: Record<string, Bonus>,
): string[][] {
  const rows = sortForLedger(items);

  const bonusTotal = rows.reduce(
    (total, item) => total + (bonusesById[item.bonusId]?.bonus_max ?? 0),
    0,
  );
  const receivedTotal = rows.reduce(
    (total, item) =>
      total + (hasPosted(item) ? receivedAmount(item, bonusesById[item.bonusId]) : 0),
    0,
  );

  const totals = [
    ledger.total,
    "",
    "",
    String(bonusTotal),
    String(receivedTotal),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];

  const body = rows.map((item) => {
    const bonus = bonusesById[item.bonusId];
    const progress = requirementsProgress(item, bonus);
    const safeClose = safeCloseFor(item, bonus);

    return [
      bonus?.bank ?? item.bonusId,
      bonus?.title ?? "",
      item.applicant ?? "",
      amount(bonus ? bonus.bonus_max : null),
      amount(hasPosted(item) ? receivedAmount(item, bonus) : null),
      progress.total > 0 ? `${progress.done}/${progress.total}` : "",
      item.dates.opened ?? "",
      ddDeadlineFor(item, bonus) ?? "",
      item.dates.received ?? "",
      safeClose?.date ?? "",
      statuses[item.status],
      item.notes ?? "",
    ];
  });

  return [LEDGER_CSV_HEADERS, totals, ...body];
}

const BOM = "\uFEFF";

/**
 * The file's text. It opens with a UTF-8 byte-order mark because Excel on Windows
 * otherwise reads a CSV as the local code page and mangles every non-ASCII character in
 * a bank name; and its lines end `\r\n`, which is what the CSV format specifies and
 * what older Excel builds need to see a line break inside a quoted note.
 */
export function ledgerCsv(items: TrackedItem[], bonusesById: Record<string, Bonus>): string {
  const body = ledgerCsvRows(items, bonusesById)
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  return `${BOM}${body}\r\n`;
}

/** `woolly-ledger-2026-09-14.csv` — dated, so a user who exports monthly ends up with a
 * folder that sorts itself rather than four copies of `woolly-ledger (3).csv`. */
export function ledgerCsvFilename(today: Date): string {
  return `woolly-ledger-${format(today, "yyyy-MM-dd")}.csv`;
}

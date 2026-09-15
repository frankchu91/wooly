import { csvAmount, datedCsvFilename, toCsv } from "../../csv";
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
      csvAmount(bonus?.bonus_max),
      csvAmount(hasPosted(item) ? receivedAmount(item, bonus) : null),
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

/**
 * The file's text — see `toCsv` for the byte-order mark and line endings Excel needs.
 */
export const ledgerCsv = (items: TrackedItem[], bonusesById: Record<string, Bonus>): string =>
  toCsv(ledgerCsvRows(items, bonusesById));

export const ledgerCsvFilename = (today: Date): string => datedCsvFilename("ledger", today);

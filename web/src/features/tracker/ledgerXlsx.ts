import type { Workbook } from "exceljs";

import { hasPosted, receivedAmount } from "../../engine/conditions";
import { DEFAULT_DD_DEADLINE_DAYS, DEFAULT_SAFE_CLOSE_DAYS } from "../../engine/scheduler";
import { STATUS_ORDER } from "../../engine/types";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import {
  DATE_FORMAT,
  MONEY_FORMAT,
  addListValidation,
  addTotalsRow,
  dateOffsetFormula,
  defineColumns,
  freezeTop,
  hyperlink,
  isoToDate,
  loadExcel,
} from "../../xlsx";
import { depositsNeeded } from "../conditions/visibleConditions";
import { requirementsProgress, sortForLedger } from "./trackerModel";

/**
 * The ledger as a workbook: one row per tracked account in the table's order, with the
 * totals directly under the header as on screen. "Opened on" is the date the user
 * recorded; the two deadlines are formulas off it, so correcting the date in the sheet
 * moves them. Stage is a dropdown of the tracker's five stages. Every account is
 * exported, closed ones included; a record that silently dropped accounts would be a
 * worse record than the one it replaces.
 */

const { fields, statuses, ledger } = t.tracker;

export const LEDGER_STAGE_OPTIONS = STATUS_ORDER.map((stage) => statuses[stage]);

export const LEDGER_COLUMNS = [
  { header: ledger.csv.bank, key: "bank", width: 22 },
  { header: fields.offer, key: "offer", width: 44 },
  { header: ledger.csv.applicant, key: "applicant", width: 10 },
  { header: fields.bonus, key: "bonus", width: 10, numFmt: MONEY_FORMAT },
  { header: fields.received, key: "received", width: 10, numFmt: MONEY_FORMAT },
  { header: ledger.csv.depositsNeeded, key: "depositsNeeded", width: 10 },
  { header: ledger.csv.depositsSent, key: "depositsSent", width: 10 },
  { header: ledger.csv.requirementsDone, key: "requirements", width: 12 },
  { header: ledger.csv.opened, key: "opened", width: 12, numFmt: DATE_FORMAT },
  { header: ledger.csv.ddDays, key: "ddDays", width: 10 },
  { header: fields.ddBy, key: "ddBy", width: 14, numFmt: DATE_FORMAT },
  { header: ledger.csv.holdDays, key: "holdDays", width: 10 },
  { header: fields.closeAfter, key: "closeAfter", width: 14, numFmt: DATE_FORMAT },
  { header: ledger.csv.receivedOn, key: "receivedOn", width: 12, numFmt: DATE_FORMAT },
  { header: fields.stage, key: "stage", width: 18 },
  { header: ledger.csv.notes, key: "notes", width: 40, wrap: true },
  { header: ledger.csv.link, key: "link", width: 40 },
];

/** A row's plain values, before the formula cells are laid over them. */
export function ledgerRow(item: TrackedItem, bonus: Bonus | undefined) {
  const progress = requirementsProgress(item, bonus);
  const needed = bonus ? depositsNeeded(bonus) : 0;
  return {
    bank: bonus?.bank ?? item.bonusId,
    offer: bonus?.title ?? "",
    applicant: item.applicant ?? "",
    bonus: bonus?.bonus_max ?? null,
    received: hasPosted(item) ? receivedAmount(item, bonus) : null,
    depositsNeeded: needed || null,
    depositsSent: item.depositsSent ?? 0,
    requirements: progress.total > 0 ? `${progress.done}/${progress.total}` : "",
    opened: item.dates.opened ? isoToDate(item.dates.opened) : null,
    // A no-DD offer has no deadline to compute; the days cell stays blank and so does
    // the formula's result.
    ddDays:
      bonus && bonus.dd.required === false
        ? null
        : (bonus?.dd.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS),
    holdDays: bonus ? (bonus.hold_days ?? bonus.etf?.days ?? DEFAULT_SAFE_CLOSE_DAYS) : null,
    receivedOn: item.dates.received ? isoToDate(item.dates.received) : null,
    stage: statuses[item.status],
    notes: item.notes ?? "",
    link: bonus?.doc_url ?? "",
  };
}

export async function buildLedgerWorkbook(
  items: TrackedItem[],
  bonusesById: Record<string, Bonus>,
): Promise<Workbook> {
  const Excel = await loadExcel();
  const workbook = new Excel.Workbook();
  const sheet = workbook.addWorksheet(t.ledger.title);
  defineColumns(sheet, LEDGER_COLUMNS);

  const rows = sortForLedger(items);
  const lastRow = 2 + rows.length;
  addTotalsRow(sheet, ledger.total, ["bonus", "received"], lastRow);

  rows.forEach((item, index) => {
    const rowNumber = 3 + index;
    const values = ledgerRow(item, bonusesById[item.bonusId]);
    const row = sheet.getRow(rowNumber);
    row.values = {
      ...values,
      link: values.link ? hyperlink(values.link, ledger.csv.linkText) : "",
    };
    if (values.ddDays !== null) {
      row.getCell("ddBy").value = dateOffsetFormula(sheet, "opened", "ddDays", rowNumber);
    }
    if (values.holdDays !== null) {
      row.getCell("closeAfter").value = dateOffsetFormula(sheet, "opened", "holdDays", rowNumber);
    }
    if (values.link) row.getCell("link").font = { color: { argb: "FF176549" }, underline: true };
  });

  addListValidation(sheet, "stage", LEDGER_STAGE_OPTIONS, lastRow);
  freezeTop(sheet);
  return workbook;
}

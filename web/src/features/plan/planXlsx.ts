import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Workbook } from "exceljs";

import type { Plan, PlanItem } from "../../engine/types";
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
import { depositsNeeded, splitConditions } from "../conditions/visibleConditions";
import { warningToText } from "./reasonText";

/**
 * The plan as a workbook the user can run the whole thing from.
 *
 * Every row carries an "Opened on" date, prefilled with the first of the month the plan
 * says to open in, and the two deadlines are formulas off it: change the date to the
 * day you actually opened and both move. The deadline lengths sit in their own columns
 * so the arithmetic is visible and editable. Status is a dropdown; "Deposits sent"
 * counts up against "Deposits needed". Requirements are the checklist the app shows.
 */

const { csv } = t.plan;

/** The dropdown a fresh plan's Status cells offer, in working order. */
export const PLAN_STATUS_OPTIONS = [
  csv.todo,
  t.tracker.statuses.opened,
  csv.ddSent,
  t.tracker.statuses.requirements_met,
  t.tracker.statuses.received,
  t.tracker.statuses.closed,
];

export const PLAN_COLUMNS = [
  { header: csv.month, key: "month", width: 10 },
  { header: csv.bank, key: "bank", width: 22 },
  { header: csv.offer, key: "offer", width: 44 },
  { header: csv.bonus, key: "bonus", width: 10, numFmt: MONEY_FORMAT },
  { header: csv.bonusMin, key: "bonusMin", width: 12, numFmt: MONEY_FORMAT },
  { header: csv.dd, key: "dd", width: 14, numFmt: MONEY_FORMAT },
  { header: csv.depositsNeeded, key: "depositsNeeded", width: 10 },
  { header: csv.depositsSent, key: "depositsSent", width: 10 },
  { header: csv.opened, key: "opened", width: 12, numFmt: DATE_FORMAT },
  { header: csv.ddDays, key: "ddDays", width: 10 },
  { header: csv.ddBy, key: "ddBy", width: 14, numFmt: DATE_FORMAT },
  { header: csv.holdDays, key: "holdDays", width: 10 },
  { header: csv.closeAfter, key: "closeAfter", width: 14, numFmt: DATE_FORMAT },
  { header: csv.status, key: "status", width: 18 },
  { header: csv.requirements, key: "requirements", width: 60, wrap: true },
  { header: csv.watchOut, key: "watchOut", width: 28, wrap: true },
  { header: csv.link, key: "link", width: 40 },
];

/** Everything the plan asks this account to receive, across however many months the
 * scheduler spread it over. */
const ddTotal = (item: PlanItem): number =>
  item.ddSchedule.reduce((total, entry) => total + entry.amount, 0);

/** The first day of a `YYYY-MM` month, as the ISO date the plan measures from. */
const monthStart = (month: string): string => `${month}-01`;

/** A row's plain values, before the formula cells are laid over them. Exported so tests
 * can check the numbers without opening a workbook. */
export function planRow(item: PlanItem, month: string) {
  const opened = monthStart(month);
  const dd = ddTotal(item);
  return {
    month,
    bank: item.bonus.bank,
    offer: item.bonus.title,
    bonus: item.bonus.bonus_max,
    bonusMin: item.bonus.bonus_min,
    dd: dd > 0 ? dd : null,
    depositsNeeded: depositsNeeded(item.bonus) || null,
    depositsSent: 0,
    opened: isoToDate(opened),
    // The lengths the plan used, read back off the dates it produced, so the sheet
    // reproduces the plan page exactly and then follows the user's edits.
    ddDays: differenceInCalendarDays(parseISO(item.ddDeadline), parseISO(opened)),
    holdDays: item.safeCloseDate
      ? differenceInCalendarDays(parseISO(item.safeCloseDate), parseISO(opened))
      : null,
    status: csv.todo,
    requirements: splitConditions(item.bonus)
      .checklist.map((condition) => condition.text)
      .join("\n"),
    watchOut: item.warnings.map(warningToText).join("; "),
    link: item.bonus.doc_url,
  };
}

export async function buildPlanWorkbook(plan: Plan): Promise<Workbook> {
  const Excel = await loadExcel();
  const workbook = new Excel.Workbook();
  const sheet = workbook.addWorksheet(t.plan.title);
  defineColumns(sheet, PLAN_COLUMNS);

  const items = plan.months.flatMap((month) =>
    month.items.map((item) => ({ item, month: month.month })),
  );
  const lastRow = 2 + items.length;
  addTotalsRow(sheet, csv.total, ["bonus", "bonusMin", "dd", "depositsSent"], lastRow);

  items.forEach(({ item, month }, index) => {
    const rowNumber = 3 + index;
    const values = planRow(item, month);
    const row = sheet.getRow(rowNumber);
    row.values = { ...values, link: hyperlink(values.link, csv.linkText) };
    row.getCell("ddBy").value = dateOffsetFormula(sheet, "opened", "ddDays", rowNumber);
    if (values.holdDays !== null) {
      row.getCell("closeAfter").value = dateOffsetFormula(sheet, "opened", "holdDays", rowNumber);
    }
    row.getCell("link").font = { color: { argb: "FF176549" }, underline: true };
  });

  addListValidation(sheet, "status", PLAN_STATUS_OPTIONS, lastRow);
  freezeTop(sheet);
  return workbook;
}

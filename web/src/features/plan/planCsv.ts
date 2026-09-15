import { csvAmount, toCsv } from "../../csv";
import type { Plan, PlanItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { warningToText } from "./reasonText";

/**
 * The plan as a spreadsheet file.
 *
 * This is the product's main output, so the file has to stand on its own: someone who
 * opens it three weeks later, without the site in front of them, should be able to work
 * the whole plan from it. That means every row carries the deadline it is racing, the
 * date the account is safe to close, and a link back to the offer — not just a bank name
 * and an amount.
 *
 * Money is written as a bare number and dates as `YYYY-MM-DD`, because "$1,000" and
 * "Sep 2026" are text a spreadsheet cannot sum or sort.
 */

const { csv } = t.plan;

export const PLAN_CSV_HEADERS = [
  csv.month,
  csv.bank,
  csv.offer,
  csv.bonus,
  csv.bonusMin,
  csv.dd,
  csv.ddBy,
  csv.closeAfter,
  csv.status,
  csv.watchOut,
  csv.link,
];

/** Everything the plan asks this account to receive, across however many months the
 * scheduler spread it over — the figure the user checks their payroll against. */
const ddTotal = (item: PlanItem): number =>
  item.ddSchedule.reduce((total, entry) => total + entry.amount, 0);

/**
 * The plan's rows as plain strings: the header, a totals row, then one row per account in
 * the order the plan opens them. Skipped offers are not in the file — the plan is the
 * list of things to do, and a spreadsheet of things not to do is a different document.
 */
export function planCsvRows(plan: Plan): string[][] {
  const items = plan.months.flatMap((month) =>
    month.items.map((item) => ({ item, month: month.month })),
  );

  const totals = [
    t.plan.csv.total,
    "",
    "",
    String(plan.totals.projected),
    String(plan.totals.projectedMin),
    String(items.reduce((total, { item }) => total + ddTotal(item), 0)),
    "",
    "",
    "",
    "",
    "",
  ];

  const body = items.map(({ item, month }) => [
    month,
    item.bonus.bank,
    item.bonus.title,
    csvAmount(item.bonus.bonus_max),
    csvAmount(item.bonus.bonus_min),
    csvAmount(ddTotal(item) || null),
    item.ddDeadline,
    item.safeCloseDate ?? "",
    // A fresh export has nothing done yet; the column is here so the file can be worked
    // in — tick a row off as you open it, the way the spreadsheet this replaces was used.
    csv.todo,
    item.warnings.map(warningToText).join("; "),
    item.bonus.doc_url,
  ]);

  return [PLAN_CSV_HEADERS, totals, ...body];
}

export const planCsv = (plan: Plan): string => toCsv(planCsvRows(plan));

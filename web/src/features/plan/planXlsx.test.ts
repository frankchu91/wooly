import type { Worksheet } from "exceljs";
import { describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import { buildPlan } from "../../engine/scheduler";
import { defaultProfile } from "../../engine/types";
import type { Plan, Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { PLAN_COLUMNS, PLAN_STATUS_OPTIONS, buildPlanWorkbook, planRow } from "./planXlsx";

function planFor(overrides: Partial<Profile> = {}): Plan {
  const profile: Profile = {
    ...defaultProfile("2026-09"),
    state: "MA",
    monthlyDD: 5000,
    horizonMonths: 12,
    ...overrides,
  };
  return buildPlan(fixture, profile, { today: new Date(2026, 8, 14) });
}

async function sheetFor(plan: Plan): Promise<Worksheet> {
  const workbook = await buildPlanWorkbook(plan);
  return workbook.getWorksheet(1) as Worksheet;
}

const formulaOf = (sheet: Worksheet, address: string): string | undefined =>
  (sheet.getCell(address).value as { formula?: string } | null)?.formula;

describe("planRow", () => {
  test("prefills Opened on with the first of the plan month and reads the day counts back off the plan's own dates", () => {
    const plan = planFor();
    const first = plan.months.find((month) => month.items.length > 0);
    const item = first?.items[0];
    if (!first || !item) throw new Error("fixture plan is empty");

    const row = planRow(item, first.month);

    expect(row.opened).toEqual(new Date(2026, 8, 1));
    expect(row.ddDays).toBeGreaterThan(0);
    expect(row.holdDays).toBeGreaterThan(0);
    expect(row.status).toBe(t.plan.csv.todo);
    expect(row.depositsSent).toBe(0);
    expect(row.link).toMatch(/^https?:\/\//);
  });

  test("a no-DD offer wants zero deposits, which is a blank cell", () => {
    const plan = planFor();
    const noDD = plan.months
      .flatMap((month) => month.items.map((item) => ({ item, month: month.month })))
      .find(({ item }) => item.bonus.dd.required === false);
    if (!noDD) return; // the fixture has none in this plan: nothing to check

    expect(planRow(noDD.item, noDD.month).depositsNeeded).toBeNull();
  });
});

describe("buildPlanWorkbook", () => {
  test("header, totals row, then one row per account", async () => {
    const plan = planFor();
    const sheet = await sheetFor(plan);

    expect(sheet.getRow(1).getCell(1).value).toBe(PLAN_COLUMNS[0].header);
    expect(sheet.getRow(2).getCell(1).value).toBe(t.plan.csv.total);
    expect(sheet.rowCount).toBe(2 + plan.totals.accounts);
  });

  test("the deadlines are formulas off Opened on, so editing the date moves them", async () => {
    const sheet = await sheetFor(planFor());
    const opened = sheet.getColumn("opened").letter;
    const ddDays = sheet.getColumn("ddDays").letter;
    const ddBy = sheet.getColumn("ddBy").letter;
    const closeAfter = sheet.getColumn("closeAfter").letter;

    expect(formulaOf(sheet, `${ddBy}3`)).toBe(`IF(${opened}3="","",${opened}3+${ddDays}3)`);
    expect(formulaOf(sheet, `${closeAfter}3`)).toContain(`${opened}3+`);
  });

  test("the totals are SUM formulas over the data rows", async () => {
    const plan = planFor();
    const sheet = await sheetFor(plan);
    const bonus = sheet.getColumn("bonus").letter;

    expect(formulaOf(sheet, `${bonus}2`)).toBe(
      `SUM(${bonus}3:${bonus}${2 + plan.totals.accounts})`,
    );
  });

  test("Status is a dropdown of the working stages", async () => {
    const sheet = await sheetFor(planFor());
    const status = sheet.getColumn("status").letter;

    const validation = sheet.getCell(`${status}3`).dataValidation;
    expect(validation.type).toBe("list");
    expect(validation.formulae[0]).toBe(`"${PLAN_STATUS_OPTIONS.join(",")}"`);
    expect(PLAN_STATUS_OPTIONS).toContain(t.plan.csv.ddSent);
  });

  test("money and dates carry number formats a spreadsheet can add and sort", async () => {
    const sheet = await sheetFor(planFor());

    expect(sheet.getColumn("bonus").numFmt).toBe('"$"#,##0');
    expect(sheet.getColumn("opened").numFmt).toBe("yyyy-mm-dd");
    expect(sheet.getCell(3, sheet.getColumn("opened").number).value).toBeInstanceOf(Date);
  });

  test("the link is a real hyperlink and the top two rows are frozen", async () => {
    const sheet = await sheetFor(planFor());
    const link = sheet.getCell(3, sheet.getColumn("link").number).value as {
      hyperlink?: string;
    };

    expect(link.hyperlink).toMatch(/^https?:\/\//);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });
  });
});

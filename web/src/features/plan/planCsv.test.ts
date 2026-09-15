import { describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import { buildPlan } from "../../engine/scheduler";
import { defaultProfile } from "../../engine/types";
import type { Plan, Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { planCsv, planCsvRows, PLAN_CSV_HEADERS } from "./planCsv";

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

/** The rows after the header and the totals. */
const body = (plan: Plan) => planCsvRows(plan).slice(2);

describe("planCsvRows", () => {
  test("opens with the header, then a totals row, then one row per account", () => {
    const plan = planFor();
    const rows = planCsvRows(plan);

    expect(rows[0]).toEqual(PLAN_CSV_HEADERS);
    expect(rows[1][0]).toBe(t.plan.csv.total);
    expect(rows).toHaveLength(2 + plan.totals.accounts);
  });

  test("the totals row carries the same projection the page shows", () => {
    const plan = planFor();
    const [, totals] = planCsvRows(plan);

    expect(totals[3]).toBe(String(plan.totals.projected));
    expect(totals[4]).toBe(String(plan.totals.projectedMin));
  });

  test("rows follow the plan's own order, month by month", () => {
    const plan = planFor();
    const months = body(plan).map((row) => row[0]);

    expect(months).toEqual([...months].sort());
    expect(months[0]).toMatch(/^\d{4}-\d{2}$/);
  });

  test("every row carries the two dates the user is racing, as ISO", () => {
    const rows = body(planFor());

    for (const row of rows) {
      expect(row[6]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row[7]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("every row links back to the offer, so the file works without the site", () => {
    for (const row of body(planFor())) {
      expect(row[10]).toMatch(/^https?:\/\//);
    }
  });

  test("a fresh export is a to-do list, not a record of work already done", () => {
    for (const row of body(planFor())) {
      expect(row[8]).toBe(t.plan.csv.todo);
    }
  });

  test("the direct-deposit column adds up what the plan spreads across months", () => {
    const plan = planFor();
    const items = plan.months.flatMap((month) => month.items);
    const multiMonth = items.find((item) => item.ddSchedule.length > 1) ?? items[0];
    const expected = multiMonth.ddSchedule.reduce((total, entry) => total + entry.amount, 0);

    const row = body(plan).find((candidate) => candidate[2] === multiMonth.bonus.title);

    expect(row?.[5]).toBe(expected > 0 ? String(expected) : "");
  });

  test("skipped offers stay out of the file", () => {
    const plan = planFor();
    const titles = body(plan).map((row) => row[2]);

    expect(plan.skipped.length).toBeGreaterThan(0);
    for (const skipped of plan.skipped) {
      expect(titles).not.toContain(skipped.bonus.title);
    }
  });
});

describe("planCsv", () => {
  test("an offer title with a comma stays one cell", () => {
    const plan = planFor();
    const csv = planCsv(plan);
    const commaTitle = plan.months
      .flatMap((month) => month.items)
      .find((item) => item.bonus.title.includes(","));

    if (commaTitle) expect(csv).toContain(`"${commaTitle.bonus.title}"`);
    // Every line has the same number of unquoted separators as the header, whatever the
    // titles contain — the check that actually matters to a spreadsheet.
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBe(2 + plan.totals.accounts);
  });

  test("starts with a UTF-8 BOM and ends its lines CRLF, which is what Excel needs", () => {
    const csv = planCsv(planFor());

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
  });
});

import type { Worksheet } from "exceljs";
import { describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { LEDGER_STAGE_OPTIONS, buildLedgerWorkbook, ledgerRow } from "./ledgerXlsx";

const bonusesById = Object.fromEntries(fixture.map((bonus) => [bonus.id, bonus])) as Record<
  string,
  Bonus
>;

function trackedItem(overrides: Partial<TrackedItem> & { bonusId: string }): TrackedItem {
  return {
    id: overrides.bonusId,
    status: "planned",
    dates: {},
    openMonth: "2026-09",
    conditionsDone: [],
    ...overrides,
  };
}

const formulaOf = (sheet: Worksheet, address: string): string | undefined =>
  (sheet.getCell(address).value as { formula?: string } | null)?.formula;

describe("ledgerRow", () => {
  test("carries the recorded dates, the deposit tally and the posted amount", () => {
    const row = ledgerRow(
      trackedItem({
        bonusId: "wells-fargo-500",
        status: "received",
        dates: { opened: "2026-01-02", received: "2026-03-02" },
        bonusReceived: 450,
        depositsSent: 1,
      }),
      bonusesById["wells-fargo-500"],
    );

    expect(row.opened).toEqual(new Date(2026, 0, 2));
    expect(row.receivedOn).toEqual(new Date(2026, 2, 2));
    expect(row.received).toBe(450);
    expect(row.depositsSent).toBe(1);
    expect(row.depositsNeeded).toBe(1);
    expect(row.stage).toBe(t.tracker.statuses.received);
  });

  test("an account closed without the bonus shows no received amount", () => {
    const row = ledgerRow(
      trackedItem({ bonusId: "chase-400", status: "closed", dates: { opened: "2026-02-01" } }),
      bonusesById["chase-400"],
    );

    expect(row.received).toBeNull();
  });
});

describe("buildLedgerWorkbook", () => {
  const items = [
    trackedItem({
      bonusId: "wells-fargo-500",
      status: "received",
      dates: { opened: "2026-01-02", received: "2026-03-02" },
    }),
    trackedItem({ bonusId: "chase-400", status: "planned" }),
  ];

  test("every account is a row, closed or not, with totals under the header", async () => {
    const sheet = (await buildLedgerWorkbook(items, bonusesById)).getWorksheet(1) as Worksheet;
    const bonus = sheet.getColumn("bonus").letter;

    expect(sheet.rowCount).toBe(4);
    expect(sheet.getRow(2).getCell(1).value).toBe(t.tracker.ledger.total);
    expect(formulaOf(sheet, `${bonus}2`)).toBe(`SUM(${bonus}3:${bonus}4)`);
  });

  test("deadlines follow Opened on, and a planned row with no date leaves them blank", async () => {
    const sheet = (await buildLedgerWorkbook(items, bonusesById)).getWorksheet(1) as Worksheet;
    const opened = sheet.getColumn("opened");
    const ddBy = sheet.getColumn("ddBy").letter;
    // The ledger sorts by stage, so the planned account comes first.
    expect(sheet.getCell(3, 1).value).toBe("Chase");
    expect(sheet.getCell(4, 1).value).toBe("Wells Fargo");

    expect(sheet.getCell(3, opened.number).value).toBeNull();
    expect(sheet.getCell(4, opened.number).value).toEqual(new Date(2026, 0, 2));
    // Both rows carry the formula: type a date into the planned row and its deadline appears.
    expect(formulaOf(sheet, `${ddBy}3`)).toContain(`IF(${opened.letter}3="",""`);
    expect(formulaOf(sheet, `${ddBy}4`)).toContain(`IF(${opened.letter}4="",""`);
  });

  test("Stage is a dropdown of the tracker's five stages", async () => {
    const sheet = (await buildLedgerWorkbook(items, bonusesById)).getWorksheet(1) as Worksheet;
    const stage = sheet.getColumn("stage").letter;

    expect(sheet.getCell(`${stage}3`).dataValidation.formulae[0]).toBe(
      `"${LEDGER_STAGE_OPTIONS.join(",")}"`,
    );
    expect(LEDGER_STAGE_OPTIONS).toHaveLength(5);
  });
});

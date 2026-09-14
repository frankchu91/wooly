import { describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { ledgerCsv, ledgerCsvFilename, ledgerCsvRows, LEDGER_CSV_HEADERS } from "./ledgerCsv";

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

/** The data rows, i.e. everything after the header and the totals. */
const body = (items: TrackedItem[]) => ledgerCsvRows(items, bonusesById).slice(2);

describe("ledgerCsvRows", () => {
  test("opens with the header and a totals row, then the items", () => {
    const rows = ledgerCsvRows(
      [
        trackedItem({ bonusId: "wells-fargo-500", status: "planned" }),
        trackedItem({ bonusId: "chase-400", status: "planned" }),
      ],
      bonusesById,
    );

    expect(rows[0]).toEqual(LEDGER_CSV_HEADERS);
    expect(rows[1][0]).toBe(t.tracker.ledger.total);
    expect(rows).toHaveLength(4);
  });

  test("totals add the headline bonuses, and only the money that actually posted", () => {
    const wf = bonusesById["wells-fargo-500"].bonus_max ?? 0;
    const chase = bonusesById["chase-400"].bonus_max ?? 0;

    const rows = ledgerCsvRows(
      [
        trackedItem({
          bonusId: "wells-fargo-500",
          status: "received",
          dates: { opened: "2026-01-02", received: "2026-03-02" },
        }),
        // Closed without the bonus ever arriving: it counts towards the headline column
        // and towards nothing else.
        trackedItem({ bonusId: "chase-400", status: "closed", dates: { opened: "2026-02-01" } }),
      ],
      bonusesById,
    );

    expect(rows[1][3]).toBe(String(wf + chase));
    expect(rows[1][4]).toBe(String(wf));
  });

  test("money is a bare number and dates stay ISO, so a spreadsheet can add and sort them", () => {
    const [row] = body([
      trackedItem({
        bonusId: "wells-fargo-500",
        status: "received",
        dates: { opened: "2026-01-02", received: "2026-03-02" },
        bonusReceived: 450,
      }),
    ]);

    expect(row[3]).toBe(String(bonusesById["wells-fargo-500"].bonus_max));
    expect(row[4]).toBe("450");
    expect(row[6]).toBe("2026-01-02");
    expect(row[8]).toBe("2026-03-02");
  });

  test("an amount that never posted is an empty cell, not a zero", () => {
    const [row] = body([trackedItem({ bonusId: "wells-fargo-500", status: "planned" })]);

    expect(row[4]).toBe("");
  });

  test("every tracked account is exported, closed ones included", () => {
    const rows = body([
      trackedItem({
        bonusId: "wells-fargo-500",
        status: "closed",
        dates: { opened: "2026-01-02" },
      }),
      trackedItem({ bonusId: "chase-400", status: "planned" }),
    ]);

    expect(rows).toHaveLength(2);
  });
});

describe("ledgerCsv", () => {
  test("a note with a comma, a quote and a newline survives the round trip", () => {
    const csv = ledgerCsv(
      [
        trackedItem({
          bonusId: "wells-fargo-500",
          notes: 'Called them, they said "wait"\nstill waiting',
        }),
      ],
      bonusesById,
    );

    expect(csv).toContain('"Called them, they said ""wait""\nstill waiting"');
  });

  test("a cell a spreadsheet would run as a formula is neutralised", () => {
    const csv = ledgerCsv(
      [trackedItem({ bonusId: "wells-fargo-500", notes: "=1+1" })],
      bonusesById,
    );

    expect(csv).toContain("'=1+1");
    expect(csv).not.toMatch(/,=1\+1/);
  });

  test("starts with a UTF-8 BOM and ends its lines CRLF, which is what Excel needs", () => {
    const csv = ledgerCsv([trackedItem({ bonusId: "wells-fargo-500" })], bonusesById);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
  });
});

test("the filename carries the export date", () => {
  expect(ledgerCsvFilename(new Date(2026, 8, 14))).toBe("woolly-ledger-2026-09-14.csv");
});

import { fixture } from "../data/fixture";
import {
  checklistFor,
  earliestCloseDate,
  hasPosted,
  ledgerTotals,
  receivedAmount,
} from "./conditions";
import type { Bonus, Condition, TrackedItem } from "./types";

const bonusById = (id: string): Bonus => {
  const found = fixture.find((b) => b.id === id);
  if (!found) throw new Error(`fixture missing ${id}`);
  return found;
};

const labels = {
  dd: (amount: number, days: number) => `Direct deposit of $${amount} within ${days} days`,
  ddUnknown: (days: number) => `Direct deposit required within ${days} days — amount not listed`,
  keepOpen: (days: number) => `Keep the account open for ${days} days`,
};

const item = (overrides: Partial<TrackedItem> & { bonusId: string }): TrackedItem => ({
  id: overrides.bonusId,
  status: "planned",
  dates: {},
  openMonth: "2026-09",
  conditionsDone: [],
  ...overrides,
});

describe("checklistFor", () => {
  test("synthesises a direct_deposit condition from `dd` when none exists", () => {
    // bmo-400: conditions: [], dd required with amount 4000 / 90 days, no etf.
    const checklist = checklistFor(bonusById("bmo-400"), labels);

    expect(checklist).toEqual([
      {
        id: "synth-dd",
        kind: "direct_deposit",
        text: "Direct deposit of $4000 within 90 days",
        amount: 4000,
        days: 90,
        count: null,
        source: "doc",
      },
    ]);
  });

  test("synthesises the unknown-amount text when dd.amount is null", () => {
    // chase-400 already carries a doc direct_deposit condition (amount null), so use
    // its dd shape directly on a bonus that otherwise has no conditions to isolate the
    // unknown-amount synthesis path.
    const bonus: Bonus = {
      ...bonusById("sofi-675"),
      conditions: [],
      dd: { required: true, amount: null, deadline_days: 45 },
    };

    const checklist = checklistFor(bonus, labels);

    expect(checklist).toEqual([
      {
        id: "synth-dd",
        kind: "direct_deposit",
        text: "Direct deposit required within 45 days — amount not listed",
        amount: null,
        days: 45,
        count: null,
        source: "doc",
      },
    ]);
  });

  test("does not synthesise a direct_deposit condition when dd.required is false", () => {
    // fourfront-400: dd.required is false, no etf, no conditions.
    const checklist = checklistFor(bonusById("fourfront-400"), labels);

    expect(checklist).toEqual([]);
  });

  test("synthesises a keep_open condition from etf.days when none exists", () => {
    // chase-400 has etf.days = 180 and one existing doc direct_deposit condition, so no
    // dd synthesis happens — only keep_open should be added, after the real condition.
    const checklist = checklistFor(bonusById("chase-400"), labels);

    expect(checklist).toEqual([
      {
        id: "chase-dd",
        kind: "direct_deposit",
        text: "Set up direct deposit and receive a qualifying direct deposit within 90 days of account opening.",
        amount: null,
        days: 90,
        count: null,
        source: "doc",
      },
      {
        id: "synth-keep",
        kind: "keep_open",
        text: "Keep the account open for 180 days",
        amount: null,
        days: 180,
        count: null,
        source: "doc",
      },
    ]);
  });

  test("real conditions are returned untouched, doc-sourced first, with no synthesis when both kinds are present", () => {
    // wells-fargo-500 already has a direct_deposit (doc), a new_customer (doc), and a
    // keep_open (bank) condition, plus a required dd and no etf — nothing to synthesise.
    const checklist = checklistFor(bonusById("wells-fargo-500"), labels);

    expect(checklist.map((c) => c.id)).toEqual(["wf-dd", "wf-new-customer", "wf-keep-open"]);
    expect(checklist.map((c) => c.source)).toEqual(["doc", "doc", "bank"]);
  });

  test("dedupes by id, keeping the doc-sourced copy when a doc and a bank condition share one", () => {
    const dupDoc: Condition = {
      id: "dup",
      kind: "deposit",
      text: "doc version",
      amount: 100,
      days: null,
      count: null,
      source: "doc",
    };
    const dupBank: Condition = { ...dupDoc, text: "bank version", source: "bank" };
    const bonus: Bonus = {
      ...bonusById("wells-fargo-500"),
      conditions: [dupBank, dupDoc],
      dd: { required: false, amount: null, deadline_days: null },
      etf: null,
    };

    const checklist = checklistFor(bonus, labels);

    expect(checklist).toEqual([dupDoc]);
  });
});

describe("earliestCloseDate", () => {
  test("prefers hold_days over etf.days and the 180-day default", () => {
    const bonus: Bonus = {
      ...bonusById("wells-fargo-500"),
      hold_days: 90,
      etf: { amount: 0, days: 365 },
    };
    expect(earliestCloseDate(bonus, "2026-09-01")).toBe("2026-11-30");
  });

  test("falls back to etf.days when hold_days is null", () => {
    const bonus: Bonus = {
      ...bonusById("wells-fargo-500"),
      hold_days: null,
      etf: { amount: 0, days: 60 },
    };
    expect(earliestCloseDate(bonus, "2026-09-01")).toBe("2026-10-31");
  });

  test("falls back to 180 days when neither hold_days nor etf.days is set", () => {
    const bonus: Bonus = { ...bonusById("wells-fargo-500"), hold_days: null, etf: null };
    expect(earliestCloseDate(bonus, "2026-09-01")).toBe("2027-02-28");
  });
});

describe("receivedAmount", () => {
  test("prefers item.bonusReceived over the bonus's bonus_max", () => {
    const bonus = bonusById("wells-fargo-500"); // bonus_max 500
    expect(receivedAmount(item({ bonusId: bonus.id, bonusReceived: 750 }), bonus)).toBe(750);
  });

  test("falls back to bonus_max when nothing was recorded", () => {
    const bonus = bonusById("wells-fargo-500");
    expect(receivedAmount(item({ bonusId: bonus.id }), bonus)).toBe(500);
  });

  test("returns 0 when the bonus itself is unavailable", () => {
    expect(receivedAmount(item({ bonusId: "gone" }), undefined)).toBe(0);
  });
});

describe("hasPosted", () => {
  test("a received item has posted", () => {
    expect(hasPosted(item({ bonusId: "sofi-675", status: "received" }))).toBe(true);
  });

  test("a closed item that passed through received has posted", () => {
    const closed = item({
      bonusId: "sofi-675",
      status: "closed",
      dates: { received: "2026-09-12", closed: "2027-03-30" },
    });
    expect(hasPosted(closed)).toBe(true);
  });

  test("a closed item with a recorded amount but no received date has posted", () => {
    expect(hasPosted(item({ bonusId: "sofi-675", status: "closed", bonusReceived: 675 }))).toBe(
      true,
    );
  });

  test("an account closed without the bonus ever arriving has not", () => {
    const closed = item({
      bonusId: "sofi-675",
      status: "closed",
      dates: { opened: "2026-09-04", closed: "2026-10-01" },
    });
    expect(hasPosted(closed)).toBe(false);
  });

  test("nothing before received has posted", () => {
    for (const status of ["planned", "opened", "requirements_met"] as const) {
      expect(hasPosted(item({ bonusId: "sofi-675", status }))).toBe(false);
    }
  });
});

describe("ledgerTotals", () => {
  test("sums earned/pending/planned by stage and tallies counts, preferring bonusReceived for earned", () => {
    const bonusesById = Object.fromEntries(fixture.map((b) => [b.id, b]));
    const items: TrackedItem[] = [
      item({ bonusId: "bmo-400", status: "planned" }), // 400
      item({ bonusId: "chase-400", status: "opened" }), // 400
      item({ bonusId: "us-bank-450", status: "requirements_met" }), // 450
      item({ bonusId: "wells-fargo-500", status: "received", bonusReceived: 600 }), // 600 (override)
      // Closed *after* being received: still earned, at bonus_max.
      item({ bonusId: "sofi-675", status: "closed", dates: { received: "2026-09-12" } }), // 675
    ];

    const totals = ledgerTotals(items, bonusesById);

    expect(totals).toEqual({
      earned: 1275,
      pending: 850,
      planned: 400,
      counts: { planned: 1, opened: 1, requirements_met: 1, received: 1, closed: 1, earned: 2 },
    });
  });

  // X1, the owner's question: "opened → closed" is an account that was given up on, not a
  // bonus that paid. It used to add its headline amount to Earned.
  test("an item that went opened → closed earns nothing and counts as no account", () => {
    const bonusesById = Object.fromEntries(fixture.map((b) => [b.id, b]));
    const abandoned = item({
      bonusId: "sofi-675",
      status: "closed",
      dates: { opened: "2026-09-04", closed: "2026-10-01" },
    });

    const totals = ledgerTotals([abandoned], bonusesById);

    expect(totals.earned).toBe(0);
    expect(totals.counts.earned).toBe(0);
    expect(totals.pending).toBe(0); // nor is it still on its way
    expect(totals.counts.closed).toBe(1); // it is still a closed account
  });

  test("an item that went received → closed keeps its amount", () => {
    const bonusesById = Object.fromEntries(fixture.map((b) => [b.id, b]));
    const paid = item({
      bonusId: "sofi-675",
      status: "closed",
      dates: { opened: "2026-09-04", received: "2026-10-01", closed: "2027-03-30" },
      bonusReceived: 675,
    });

    const totals = ledgerTotals([paid], bonusesById);

    expect(totals.earned).toBe(675);
    expect(totals.counts.earned).toBe(1);
  });

  test("an empty tracker produces zero totals and zero counts", () => {
    const bonusesById = Object.fromEntries(fixture.map((b) => [b.id, b]));
    expect(ledgerTotals([], bonusesById)).toEqual({
      earned: 0,
      pending: 0,
      planned: 0,
      counts: { planned: 0, opened: 0, requirements_met: 0, received: 0, closed: 0, earned: 0 },
    });
  });
});

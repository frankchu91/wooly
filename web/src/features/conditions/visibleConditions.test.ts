import { describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import type { Bonus, Condition } from "../../engine/types";
import {
  collapseParaphrases,
  MAX_CHECKLIST,
  MAX_NOTES,
  splitConditions,
  visibleConditions,
} from "./visibleConditions";

const base = fixture.find((b) => b.id === "wells-fargo-500") as Bonus;

function condition(overrides: Partial<Condition> & { id: string }): Condition {
  return {
    kind: "direct_deposit",
    text: "Receive $1,000 in qualifying direct deposits within 90 days",
    amount: null,
    days: null,
    count: null,
    source: "doc",
    ...overrides,
  };
}

/** A bonus carrying exactly these conditions, with every field that would make
 * `checklistFor` synthesise extra rows switched off. */
function bonusWith(conditions: Condition[]): Bonus {
  return { ...base, dd: { ...base.dd, required: false }, etf: null, conditions };
}

describe("splitConditions — what counts as a task", () => {
  test("kinds that name an action go on the checklist when they carry a figure", () => {
    const rows = [
      condition({ id: "dd", kind: "direct_deposit", amount: 1000, days: 90 }),
      condition({ id: "dep", kind: "deposit", text: "Deposit $300 in new funds", amount: 300 }),
      condition({ id: "bal", kind: "balance", text: "Average balance of $1,500", amount: 1500 }),
      condition({ id: "tx", kind: "transactions", text: "10 debit purchases", count: 10 }),
      condition({ id: "keep", kind: "keep_open", text: "Stay open 180 days", days: 180 }),
    ];

    expect(splitConditions(bonusWith(rows)).checklist.map((c) => c.id)).toEqual([
      "dd",
      "dep",
      "bal",
      "tx",
      "keep",
    ]);
  });

  test("a figureless row still counts when it opens with a requirement verb", () => {
    const rows = [
      condition({ id: "verb", text: "Set up a qualifying direct deposit from your employer" }),
      condition({ id: "prose", text: "Your bonus amount will be based on your deposits" }),
    ];
    const { checklist, notes } = splitConditions(bonusWith(rows));

    expect(checklist.map((c) => c.id)).toEqual(["verb"]);
    expect(notes.map((c) => c.id)).toEqual(["prose"]);
  });

  test("fee, new_customer and other rows are notes, however many figures they carry", () => {
    const rows = [
      condition({ id: "fee", kind: "fee", text: "The monthly fee is $15", amount: 15 }),
      condition({ id: "nc", kind: "new_customer", text: "New customers only" }),
      condition({ id: "other", kind: "other", text: "See the offer page", days: 30 }),
    ];
    const { checklist, notes } = splitConditions(bonusWith(rows));

    expect(checklist).toEqual([]);
    expect(notes.map((c) => c.id)).toEqual(["fee", "nc", "other"]);
  });
});

describe("splitConditions — paraphrase collapse", () => {
  test("a bank paraphrase agreeing on the amount collapses into the doc row", () => {
    const rows = [
      condition({ id: "doc-dd", amount: 1000, days: 90 }),
      condition({
        id: "bank-dd",
        text: "Make $1,000 or more in qualifying direct deposits",
        amount: 1000,
        source: "bank",
      }),
    ];

    expect(splitConditions(bonusWith(rows)).checklist.map((c) => c.id)).toEqual(["doc-dd"]);
  });

  test("agreeing on days alone is enough to be a paraphrase", () => {
    const rows = [
      condition({ id: "doc-dd", amount: 1000, days: 90 }),
      condition({ id: "bank-dd", amount: 500, days: 90, source: "bank" }),
    ];

    expect(splitConditions(bonusWith(rows)).checklist.map((c) => c.id)).toEqual(["doc-dd"]);
  });

  test("the row with more figures wins, in the earlier row's place", () => {
    const sparse = condition({ id: "sparse", amount: 1000 });
    const rich = condition({ id: "rich", amount: 1000, days: 90, count: 2, source: "bank" });
    const keep = condition({ id: "keep", kind: "keep_open", days: 180 });

    expect(collapseParaphrases([sparse, rich, keep]).map((c) => c.id)).toEqual(["rich", "keep"]);
  });

  test("on a tie the DoC row wins", () => {
    const bank = condition({ id: "bank", amount: 1000, source: "bank" });
    const doc = condition({ id: "doc", amount: 1000, source: "doc" });

    expect(collapseParaphrases([bank, doc]).map((c) => c.id)).toEqual(["doc"]);
    expect(collapseParaphrases([doc, bank]).map((c) => c.id)).toEqual(["doc"]);
  });

  test("different kinds never collapse, and figureless rows never do", () => {
    const dd = condition({ id: "dd", amount: 1000 });
    const deposit = condition({ id: "dep", kind: "deposit", text: "Deposit $1,000", amount: 1000 });
    const bare = condition({ id: "bare", text: "Keep the account open", kind: "keep_open" });
    const bareToo = condition({ id: "bare2", text: "Keep it open please", kind: "keep_open" });

    expect(collapseParaphrases([dd, deposit, bare, bareToo]).map((c) => c.id)).toEqual([
      "dd",
      "dep",
      "bare",
      "bare2",
    ]);
  });
});

describe("splitConditions — caps and ordering", () => {
  test("the checklist is capped, keeping DoC rows first", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      condition({ id: `doc-${i}`, kind: "deposit", text: `Deposit $${i}00`, amount: i * 100 + 7 }),
    ).concat(
      Array.from({ length: 4 }, (_, i) =>
        condition({
          id: `bank-${i}`,
          kind: "deposit",
          text: `Deposit $${i}0`,
          amount: i * 10 + 3,
          source: "bank",
        }),
      ),
    );
    const { checklist } = splitConditions(bonusWith(rows));

    expect(checklist).toHaveLength(MAX_CHECKLIST);
    expect(checklist.every((c) => c.source === "doc")).toBe(true);
  });

  test("notes are capped too", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      condition({ id: `note-${i}`, kind: "fee", text: `A fee note number ${i}` }),
    );

    expect(splitConditions(bonusWith(rows)).notes).toHaveLength(MAX_NOTES);
  });

  test("visibleConditions is the checklist followed by the notes", () => {
    const rows = [
      condition({ id: "fee", kind: "fee", text: "The monthly fee is $15", amount: 15 }),
      condition({ id: "dd", amount: 1000, days: 90 }),
    ];

    expect(visibleConditions(bonusWith(rows)).map((c) => c.id)).toEqual(["dd", "fee"]);
  });
});

describe("splitConditions — the Wells Fargo fixture", () => {
  test("splits the synthesised checklist from the new-customer note", () => {
    const { checklist, notes } = splitConditions(base);

    expect(checklist.map((c) => c.kind)).toEqual(["direct_deposit", "keep_open"]);
    expect(notes.map((c) => c.kind)).toEqual(["new_customer"]);
  });
});

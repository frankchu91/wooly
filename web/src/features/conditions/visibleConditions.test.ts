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
  test("kinds that name an action go on the checklist when they carry a day window, a count, or a verb", () => {
    const rows = [
      condition({ id: "dd", kind: "direct_deposit", amount: 1000, days: 90 }),
      condition({ id: "dep", kind: "deposit", text: "Deposit $300 in new funds", amount: 300 }),
      condition({
        id: "bal",
        kind: "balance",
        text: "Maintain a minimum average balance of $1,500",
        amount: 1500,
      }),
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

  test("a bare dollar figure with no day window, count, or verb is a note, not a task (E1)", () => {
    const rows = [
      condition({ id: "dd", kind: "direct_deposit", amount: 1000, days: 90 }),
      condition({
        id: "fig",
        kind: "balance",
        text: "$5,000 or more in qualifying deposit balances",
        amount: 5000,
      }),
    ];
    const { checklist, notes } = splitConditions(bonusWith(rows));

    expect(checklist.map((c) => c.id)).toEqual(["dd"]);
    expect(notes.map((c) => c.id)).toEqual(["fig"]);
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

  test('a sentence that opens with "Earn" is the reward\'s own headline, never a task (E1)', () => {
    const rows = [
      condition({
        id: "earn",
        kind: "transactions",
        text: "Earn $100 cash offer with qualifying debit or Zelle transactions",
        amount: 100,
        days: 60, // even carrying a day window, "Earn" still routes it to notes
      }),
    ];
    const { checklist, notes } = splitConditions(bonusWith(rows));

    expect(checklist).toEqual([]);
    expect(notes.map((c) => c.id)).toEqual(["earn"]);
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

  describe("keep_open without a day window (E3)", () => {
    test("stays on the checklist when it opens with a requirement verb", () => {
      const rows = [
        condition({ id: "keep", kind: "keep_open", text: "Keep the account open and active" }),
      ];
      expect(splitConditions(bonusWith(rows)).checklist.map((c) => c.id)).toEqual(["keep"]);
    });

    test('stays on the checklist when it contains "must", even mid-sentence', () => {
      const rows = [
        condition({
          id: "keep",
          kind: "keep_open",
          text: "The account must remain open until the bonus posts",
        }),
      ];
      expect(splitConditions(bonusWith(rows)).checklist.map((c) => c.id)).toEqual(["keep"]);
    });

    test("is a note otherwise", () => {
      const rows = [
        condition({
          id: "keep",
          kind: "keep_open",
          text: "The account stays enrolled in the offer",
        }),
      ];
      const { checklist, notes } = splitConditions(bonusWith(rows));
      expect(checklist).toEqual([]);
      expect(notes.map((c) => c.id)).toEqual(["keep"]);
    });
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

  test("agreeing on days is enough to be a paraphrase when one side names no amount", () => {
    const rows = [
      condition({ id: "doc-dd", amount: 1000, days: 90 }),
      condition({ id: "bank-dd", amount: null, days: 90, source: "bank" }),
    ];

    expect(splitConditions(bonusWith(rows)).checklist.map((c) => c.id)).toEqual(["doc-dd"]);
  });

  test("two different non-null amounts sharing a day window do not collapse (E2)", () => {
    // Two rows that genuinely disagree on the dollar figure but happen to share a day
    // window (e.g. a $500 reward figure vs. a $1,000 requirement figure, both parsed
    // with a 90-day window) are not the same requirement. Merging on the day window
    // alone would silently throw away a genuinely different figure.
    const rows = [
      condition({ id: "doc-dd", amount: 1000, days: 90 }),
      condition({ id: "bank-dd", amount: 500, days: 90, source: "bank" }),
    ];

    expect(splitConditions(bonusWith(rows)).checklist.map((c) => c.id)).toEqual([
      "doc-dd",
      "bank-dd",
    ]);
  });

  test("direct_deposit and deposit are one family, so they collapse into each other (E2)", () => {
    const rows = [
      condition({ id: "dd", kind: "direct_deposit", amount: 1000, days: 90 }),
      condition({
        id: "dep",
        kind: "deposit",
        text: "Deposit $1,000 or more in qualifying deposits within 90 days",
        amount: 1000,
        days: 90,
        source: "bank",
      }),
    ];

    expect(collapseParaphrases(rows).map((c) => c.id)).toEqual(["dd"]);
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

  test("a tie between two rows from the same kind of source keeps the shorter text", () => {
    const long = condition({
      id: "long",
      amount: 1000,
      text: "Receive $1,000 in direct deposits, a very long way of saying it",
    });
    const short = condition({ id: "short", amount: 1000, text: "DD $1,000" });

    expect(collapseParaphrases([long, short]).map((c) => c.id)).toEqual(["short"]);
    expect(collapseParaphrases([short, long]).map((c) => c.id)).toEqual(["short"]);
  });

  test("unrelated kinds never collapse, and figureless rows never do", () => {
    const bal = condition({ id: "bal", kind: "balance", amount: 1000 });
    const tx = condition({ id: "tx", kind: "transactions", amount: 1000 });
    const bare = condition({ id: "bare", text: "Keep the account open", kind: "keep_open" });
    const bareToo = condition({ id: "bare2", text: "Keep it open please", kind: "keep_open" });

    expect(collapseParaphrases([bal, tx, bare, bareToo]).map((c) => c.id)).toEqual([
      "bal",
      "tx",
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

// --- E4: real, regenerated `data/bonuses.json` rows (post round-2 F1–F3), built inline
// rather than read from the file, so this test doesn't depend on a scraper run. ---

describe("splitConditions — the real Wells Fargo condition list (E4/H1)", () => {
  // The bank's own page mangles a bulleted list into one sentence stream. Round 3's
  // H1 widened the scraper's reward-figure skip to look 6 words ahead instead of only
  // at the very next token, so `wf-dd-bank-1000` now carries the real $1,000 deposit
  // figure (not either of the two `$500` reward mentions that precede it) — matching
  // the doc row's $1,000/90 days, so E2's collapse correctly treats them as the same
  // requirement and only 1 row survives to the checklist.
  const wfRows: Condition[] = [
    condition({
      id: "wf-dd-doc",
      kind: "direct_deposit",
      amount: 1000,
      days: 90,
      text: "Direct deposit of $1000",
    }),
    condition({
      id: "wf-nc",
      kind: "new_customer",
      text: "To be eligible: Offer is for new consumer checking customers only and is available only to the primary owner of the new checking account.",
    }),
    condition({
      id: "wf-dep-doc-long",
      kind: "deposit",
      amount: 1000,
      days: 90,
      text: "To receive the $500 bonus: you must use your bonus offer code when opening a new Wells Fargo consumer checking account, which is subject to approval, by October 6, 2026 and receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening (the qualification period).",
    }),
    condition({
      id: "wf-dd-bank-1000",
      kind: "direct_deposit",
      amount: 1000,
      days: 90,
      source: "bank",
      text: "Get a $500 new checking customer bonus As a new Wells Fargo checking customer, enjoy a $500 bonus when you open a new Everyday Checking account and make $1,000 or more in qualifying direct deposits within 90 days of account opening.",
    }),
    condition({
      id: "wf-dep-bank-25",
      kind: "deposit",
      amount: 25,
      source: "bank",
      text: "$25 minimum opening deposit if opening in branch.",
    }),
    condition({
      id: "wf-dd-bank-verb",
      kind: "direct_deposit",
      amount: 1000,
      source: "bank",
      text: "Deposit Make $1,000 or more in qualifying direct deposits within the first 90 days of opening.",
    }),
    condition({
      id: "wf-dep-bank-long",
      kind: "deposit",
      amount: 1000,
      days: 90,
      source: "bank",
      text: "To receive the $500 bonus: you must use your bonus offer code when opening a new Wells Fargo consumer checking account, which is subject to approval, by October 6, 2026 and receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening (the qualification period).",
    }),
    condition({
      id: "wf-fee",
      kind: "fee",
      amount: 15,
      source: "bank",
      text: "The Wells Fargo Everyday Checking account monthly service fee is $15.",
    }),
    condition({
      id: "wf-dep-5000-a",
      kind: "deposit",
      amount: 5000,
      source: "bank",
      text: "$5,000 or more in qualifying deposit balances, investment balances, or both.",
    }),
    condition({
      id: "wf-dep-500-a",
      kind: "deposit",
      amount: 500,
      source: "bank",
      text: "$500 or more in total qualifying electronic deposits.",
    }),
    condition({
      id: "wf-dep-5000-or",
      kind: "deposit",
      amount: 5000,
      source: "bank",
      text: "OR $5,000 or more in qualifying deposit balances, investment balances, or both.",
    }),
    condition({
      id: "wf-dep-500-or",
      kind: "deposit",
      amount: 500,
      source: "bank",
      text: "OR $500 or more in total qualifying electronic deposits.",
    }),
  ];

  test("1 checklist row survives (doc and bank now agree on $1,000/90 days); the fee-waiver bullets and the $25/new-customer lines are notes", () => {
    const { checklist, notes } = splitConditions(bonusWith(wfRows));

    expect(checklist.map((c) => c.id)).toEqual(["wf-dd-doc"]);
    // Capped at MAX_NOTES=6: wf-dep-500-or (the 7th note) is dropped.
    expect(notes.map((c) => c.id)).toEqual([
      "wf-nc",
      "wf-dep-bank-25",
      "wf-fee",
      "wf-dep-5000-a",
      "wf-dep-500-a",
      "wf-dep-5000-or",
    ]);
  });
});

describe("splitConditions — a Bank of America-like condition list (E4)", () => {
  const boaRows: Condition[] = [
    condition({
      id: "boa-dd-doc-2000",
      kind: "direct_deposit",
      amount: 2000,
      days: 90,
      text: "Direct deposit of $2000",
    }),
    condition({
      // F1 (scraper): "ninety (90) days" now parses to days: 90.
      id: "boa-dd-doc-paren",
      kind: "direct_deposit",
      days: 90,
      text: 'Set up and receive Qualifying Direct Deposits into that eligible personal checking account within ninety (90) days of account opening ("Deposit Period").',
    }),
    condition({
      id: "boa-dd-definition",
      kind: "direct_deposit",
      text: 'A "Qualifying Direct Deposit" is a direct deposit of regular monthly income, such as your salary, pension, or Social Security benefits.',
    }),
    condition({
      id: "boa-nc",
      kind: "new_customer",
      source: "bank",
      text: "Only new checking customers can take advantage of this offer.",
    }),
    condition({
      id: "boa-dd-bank",
      kind: "direct_deposit",
      days: 90,
      source: "bank",
      text: 'Set up and receive Qualifying Direct Deposits into your new account within 90 days of account opening ("Deposit Period").',
    }),
    condition({
      // F2 (scraper) strips the "® 1" footnote before this ever reaches count parsing;
      // E1 sends it to notes anyway because it opens with "Earn" — the $100 offer's own
      // headline, not a task.
      id: "boa-tx-earn",
      kind: "transactions",
      amount: 100,
      source: "bank",
      text: "Earn $100 cash offer with qualifying debit or Zelle transactions.",
    }),
    condition({
      // F2 + F3 (scraper): the footnote digits after "Zelle" and "transactions" are
      // gone and the "or Zelle" join no longer defeats the count — count: 20, not 1.
      id: "boa-tx-make",
      kind: "transactions",
      days: 60,
      count: 20,
      source: "bank",
      text: "Make at least 20 qualifying debit card or Zelle transactions from your new account within 60 days of account opening.",
    }),
  ];

  test("checklist is the DD (family-collapsed to one row) plus the transaction count; notes hold the definition, new-customer line and the Earn headline", () => {
    const { checklist, notes } = splitConditions(bonusWith(boaRows));

    expect(checklist.map((c) => c.id)).toEqual(["boa-dd-doc-2000", "boa-tx-make"]);
    expect(notes.map((c) => c.id)).toEqual(["boa-dd-definition", "boa-nc", "boa-tx-earn"]);
  });
});

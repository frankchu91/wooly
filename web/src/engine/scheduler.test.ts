import {
  buildPlan,
  monthAdd,
  monthStartDate,
  NO_DD_CAP_PER_MONTH,
  UNLIMITED_SPLITS,
  DEFAULT_DD_DEADLINE_DAYS,
  DEFAULT_SAFE_CLOSE_DAYS,
} from "./scheduler";
import { defaultProfile } from "./types";
import type { Bonus, Profile } from "./types";
import { fixture } from "../data/fixture";

// Built from local components (not `new Date("2026-09-13")`, which is UTC midnight) so
// this matches how date-fns `parseISO` interprets date-only strings (local midnight) for
// every timezone, including ones west of UTC.
const today = new Date(2026, 8, 13);
const startMonth = "2026-09";

// Minimal, fully-specified Bonus for synthetic test fixtures — every test that needs a
// bespoke bonus overrides only the fields relevant to that scenario.
const makeBonus = (overrides: Partial<Bonus> & { id: string; bank: string }): Bonus => ({
  title: `${overrides.bank} bonus`,
  section: "checking",
  summary: "",
  doc_url: "https://example.com",
  offer_url: null,
  bonus_min: 100,
  bonus_max: 100,
  availability: { nationwide: true, states: [] },
  dd: { required: true, amount: null, deadline_days: 60 },
  pull: "soft",
  chexsystems: null,
  cc_funding: null,
  monthly_fee: null,
  etf: null,
  household_limit: null,
  expiration: null,
  anti_churn_months: null,
  additional_requirements: null,
  enriched: true,
  enriched_at: "2026-09-13",
  post_modified: null,
  last_seen: "2026-09-13",
  ...overrides,
});

describe("constants", () => {
  it("match spec §4.4", () => {
    expect(NO_DD_CAP_PER_MONTH).toBe(3);
    expect(UNLIMITED_SPLITS).toBe(6);
    expect(DEFAULT_DD_DEADLINE_DAYS).toBe(60);
    expect(DEFAULT_SAFE_CLOSE_DAYS).toBe(180);
  });
});

describe("monthStartDate", () => {
  it("appends -01 to a YYYY-MM month", () => {
    expect(monthStartDate("2026-09")).toBe("2026-09-01");
  });
});

describe("monthAdd", () => {
  it("adds n months, staying within YYYY-MM", () => {
    expect(monthAdd("2026-09", 0)).toBe("2026-09");
    expect(monthAdd("2026-09", 1)).toBe("2026-10");
    expect(monthAdd("2026-09", 4)).toBe("2027-01");
  });
});

describe("buildPlan — capacity overflow", () => {
  it("skips a DD amount too large for the horizon, and spreads a smaller one across later months", () => {
    const profile: Profile = { ...defaultProfile(startMonth), monthlyDD: 1000, maxSplits: 6 };
    const plan = buildPlan(fixture, profile, { today });

    const sofi = plan.skipped.find((s) => s.bonus.id === "sofi-675");
    expect(sofi?.reasons).toContain("dd_too_large");

    const items = plan.months.flatMap((m) => m.items);
    const wells = items.find((i) => i.bonus.id === "wells-fargo-500");
    expect(wells?.openMonth).toBe("2026-09");

    const usBank = items.find((i) => i.bonus.id === "us-bank-450");
    expect(usBank).toBeDefined();
    // Month 1's 1000/mo capacity is already claimed by wells-fargo-500, so us-bank-450's
    // $2000 DD requirement lands in the two months after it opens.
    expect(usBank!.ddSchedule.every((d) => d.month !== "2026-09")).toBe(true);
    expect(usBank!.ddSchedule.reduce((s, d) => s + d.amount, 0)).toBe(2000);
  });
});

describe("buildPlan — splits limit", () => {
  it("never places two DD-required items in the same month when maxSplits is 1", () => {
    const profile: Profile = { ...defaultProfile(startMonth), maxSplits: 1 };
    const plan = buildPlan(fixture, profile, { today });

    for (const month of plan.months) {
      const ddItems = month.items.filter((i) => i.bonus.dd.required !== false);
      expect(ddItems.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildPlan — no-DD cap", () => {
  it("opens at most NO_DD_CAP_PER_MONTH no-DD bonuses in the same month", () => {
    const banks = ["Bank A", "Bank B", "Bank C", "Bank D", "Bank E"];
    const noDdBonuses = banks.map((bank, i) =>
      makeBonus({
        id: `no-dd-${i}`,
        bank,
        bonus_max: 100 + i,
        dd: { required: false, amount: null, deadline_days: null },
      }),
    );
    const profile = defaultProfile(startMonth);
    const plan = buildPlan(noDdBonuses, profile, { today });

    for (const month of plan.months) {
      expect(month.items.length).toBeLessThanOrEqual(NO_DD_CAP_PER_MONTH);
    }
    const placed = plan.months.flatMap((m) => m.items);
    expect(placed).toHaveLength(5);
    const firstMonth = plan.months[0];
    const secondMonth = plan.months[1];
    expect(firstMonth.items).toHaveLength(3);
    expect(secondMonth.items).toHaveLength(2);
    // No-DD bonuses never consume a payroll-split slot.
    expect(firstMonth.slotsUsed).toBe(0);
    expect(secondMonth.slotsUsed).toBe(0);
  });
});

describe("buildPlan — one per bank", () => {
  it("places at most one bonus per bank, even with two eligible candidates", () => {
    const chaseA = makeBonus({
      id: "chase-a",
      bank: "Chase",
      bonus_max: 300,
      dd: { required: true, amount: 500, deadline_days: 60 },
    });
    const chaseB = makeBonus({
      id: "chase-b",
      bank: "Chase",
      bonus_max: 900,
      dd: { required: true, amount: 500, deadline_days: 60 },
    });
    const profile = defaultProfile(startMonth);
    const plan = buildPlan([chaseA, chaseB], profile, { today });

    const items = plan.months.flatMap((m) => m.items);
    const chaseItems = items.filter((i) => i.bonus.bank === "Chase");
    expect(chaseItems).toHaveLength(1);
    // Higher-scoring chase-b (larger bonus_max, same DD/time cost) wins the slot.
    expect(chaseItems[0].bonus.id).toBe("chase-b");
  });
});

describe("buildPlan — deadline spanning two months", () => {
  it("splits a DD requirement across months per monthly DD capacity", () => {
    const b = makeBonus({
      id: "split-dd",
      bank: "Split Bank",
      bonus_max: 500,
      dd: { required: true, amount: 1500, deadline_days: 60 },
    });
    const profile: Profile = { ...defaultProfile(startMonth), monthlyDD: 1000 };
    const plan = buildPlan([b], profile, { today });

    const items = plan.months.flatMap((m) => m.items);
    const item = items.find((i) => i.bonus.id === "split-dd");
    expect(item?.ddSchedule).toEqual([
      { month: "2026-09", amount: 1000 },
      { month: "2026-10", amount: 500 },
    ]);
  });
});

describe("buildPlan — no-DD and DD bonuses share a month even with maxSplits 1", () => {
  it("a no-DD bonus doesn't consume the DD bonus's only slot", () => {
    const noDd = makeBonus({
      id: "no-dd-solo",
      bank: "No DD Bank",
      bonus_max: 200,
      dd: { required: false, amount: null, deadline_days: null },
    });
    const dd = makeBonus({
      id: "dd-solo",
      bank: "DD Bank",
      bonus_max: 300,
      dd: { required: true, amount: 500, deadline_days: 60 },
    });
    const profile: Profile = { ...defaultProfile(startMonth), maxSplits: 1, monthlyDD: 5000 };
    const plan = buildPlan([noDd, dd], profile, { today });

    const items = plan.months.flatMap((m) => m.items);
    const noDdItem = items.find((i) => i.bonus.id === "no-dd-solo");
    const ddItem = items.find((i) => i.bonus.id === "dd-solo");
    expect(noDdItem?.openMonth).toBe("2026-09");
    expect(ddItem?.openMonth).toBe("2026-09");
    expect(plan.months[0].slotsUsed).toBe(1);
  });
});

describe("buildPlan — MA state and skip reasons", () => {
  it("places the MA-available bonus and records reasons for skipped ones", () => {
    const profile: Profile = { ...defaultProfile(startMonth), state: "MA" };
    const plan = buildPlan(fixture, profile, { today });

    const items = plan.months.flatMap((m) => m.items);
    expect(items.some((i) => i.bonus.id === "eastern-750")).toBe(true);

    const expired = plan.skipped.find((s) => s.bonus.id === "expired-100");
    expect(expired?.reasons).toContain("expired");

    const fourfront = plan.skipped.find((s) => s.bonus.id === "fourfront-400");
    expect(fourfront?.reasons).toContain("not_in_state");
  });
});

describe("buildPlan — skippedIds", () => {
  it("records user_skipped and excludes the bonus from placement", () => {
    const profile = defaultProfile(startMonth);
    const plan = buildPlan(fixture, profile, { today, skippedIds: ["wells-fargo-500"] });

    const skipped = plan.skipped.find((s) => s.bonus.id === "wells-fargo-500");
    expect(skipped?.reasons).toEqual(["user_skipped"]);

    const items = plan.months.flatMap((m) => m.items);
    expect(items.some((i) => i.bonus.id === "wells-fargo-500")).toBe(false);
  });
});

describe("buildPlan — totals", () => {
  it("sums projected bonus_max for placed items and averages ddUsed over the horizon", () => {
    const profile = defaultProfile(startMonth);
    const plan = buildPlan(fixture, profile, { today });

    const items = plan.months.flatMap((m) => m.items);
    const expectedProjected = items.reduce((s, i) => s + (i.bonus.bonus_max ?? 0), 0);
    expect(plan.totals.projected).toBe(expectedProjected);
    expect(plan.totals.accounts).toBe(items.length);

    const expectedAvg = plan.months.reduce((s, m) => s + m.ddUsed, 0) / plan.months.length;
    expect(plan.totals.avgDDUsed).toBeCloseTo(expectedAvg);
    expect(plan.totals.avgDDUsed).toBeGreaterThan(0);
  });
});

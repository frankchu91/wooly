import { evaluate, normalizeBankName, DEFAULT_ANTI_CHURN_MONTHS } from "./eligibility";
import { defaultProfile } from "./types";
import type { Bonus, Profile } from "./types";
import { fixture } from "../data/fixture";

// Built from local components (not `new Date("2026-09-13")`, which is UTC midnight) so
// this matches how date-fns `parseISO` interprets date-only strings (local midnight) for
// every timezone, including ones west of UTC.
const today = new Date(2026, 8, 13);

const bonus = (id: string): Bonus => {
  const found = fixture.find((b) => b.id === id);
  if (!found) throw new Error(`fixture missing ${id}`);
  return found;
};

const maProfile = (): Profile => ({ ...defaultProfile("2026-09"), state: "MA" });

describe("normalizeBankName", () => {
  it("lowercases and strips non-alphanumerics", () => {
    expect(normalizeBankName("U.S. Bank")).toBe("usbank");
    expect(normalizeBankName("US Bank")).toBe("usbank");
    expect(normalizeBankName("4Front Credit Union")).toBe("4frontcreditunion");
  });
});

describe("DEFAULT_ANTI_CHURN_MONTHS", () => {
  it("is 24", () => {
    expect(DEFAULT_ANTI_CHURN_MONTHS).toBe(24);
  });
});

describe("evaluate — reasons", () => {
  it("no_bonus_amount: bonus_max null", () => {
    const b: Bonus = { ...bonus("wells-fargo-500"), bonus_max: null };
    const result = evaluate(b, maProfile(), today);
    expect(result.reasons).toContain("no_bonus_amount");
    expect(result.eligible).toBe(false);
  });

  it("expired: expiration before today", () => {
    const result = evaluate(bonus("expired-100"), maProfile(), today);
    expect(result.reasons).toContain("expired");
    expect(result.eligible).toBe(false);
  });

  it("expired: expiration equal to today's date is NOT expired (expires at end of day)", () => {
    const b: Bonus = { ...bonus("wells-fargo-500"), expiration: "2026-09-13" };
    const result = evaluate(b, maProfile(), today);
    expect(result.reasons).not.toContain("expired");
  });

  it("not_in_state: MI user is not in eastern-750's state list", () => {
    const profile = { ...maProfile(), state: "MI" };
    const result = evaluate(bonus("eastern-750"), profile, today);
    expect(result.reasons).toContain("not_in_state");
    expect(result.eligible).toBe(false);
  });

  it("MA user sees eastern-750 as eligible", () => {
    const result = evaluate(bonus("eastern-750"), maProfile(), today);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("unknown_availability: not nationwide and no states listed", () => {
    const b: Bonus = {
      ...bonus("wells-fargo-500"),
      availability: { nationwide: false, states: [] },
    };
    const result = evaluate(b, maProfile(), today);
    expect(result.reasons).toContain("unknown_availability");
    expect(result.eligible).toBe(false);
  });

  it("anti_churn: Wells Fargo history within the 12-month window sets antiChurnUntil", () => {
    const profile = {
      ...maProfile(),
      history: [{ bank: "Wells Fargo", lastBonusAt: "2026-01", accountOpen: false }],
    };
    const result = evaluate(bonus("wells-fargo-500"), profile, today);
    expect(result.reasons).toContain("anti_churn");
    expect(result.antiChurnUntil).toBe("2027-01");
    expect(result.eligible).toBe(false);
  });

  it("anti_churn: Chase history from 2023-01 has elapsed the 24-month window and is eligible", () => {
    const profile = {
      ...maProfile(),
      history: [{ bank: "chase", lastBonusAt: "2023-01", accountOpen: false }],
    };
    const result = evaluate(bonus("chase-400"), profile, today);
    expect(result.reasons).not.toContain("anti_churn");
    expect(result.eligible).toBe(true);
  });

  it("account_open: history entry for the bank has accountOpen true (bank name normalized)", () => {
    const profile = {
      ...maProfile(),
      history: [{ bank: "U.S. Bank", accountOpen: true }],
    };
    const result = evaluate(bonus("us-bank-450"), profile, today);
    expect(result.reasons).toContain("account_open");
    expect(result.eligible).toBe(false);
  });

  it("hard_pull: avoidHardPull profile rejects fourfront-400 for an MI user", () => {
    const profile = { ...maProfile(), state: "MI" };
    expect(profile.prefs.avoidHardPull).toBe(true);
    const result = evaluate(bonus("fourfront-400"), profile, today);
    expect(result.reasons).toContain("hard_pull");
    expect(result.reasons).not.toContain("not_in_state");
    expect(result.eligible).toBe(false);
  });

  it("chex_sensitive: avoidChexSensitive profile rejects a bank flagged sensitive in ChexSystems", () => {
    const b: Bonus = { ...bonus("wells-fargo-500"), chexsystems: "Yes, sensitive" };
    const profile = {
      ...maProfile(),
      prefs: { ...maProfile().prefs, avoidChexSensitive: true },
    };
    const result = evaluate(b, profile, today);
    expect(result.reasons).toContain("chex_sensitive");
    expect(result.eligible).toBe(false);
  });

  it("section_excluded: savings section excluded when includeSavings is false", () => {
    const profile = {
      ...maProfile(),
      prefs: { ...maProfile().prefs, includeSavings: false },
    };
    const result = evaluate(bonus("sofi-675"), profile, today);
    expect(result.reasons).toContain("section_excluded");
    expect(result.eligible).toBe(false);
  });

  it("section_excluded: business section excluded when includeBusiness is false (default)", () => {
    const b: Bonus = { ...bonus("wells-fargo-500"), section: "business" };
    const profile = maProfile();
    expect(profile.prefs.includeBusiness).toBe(false);
    const result = evaluate(b, profile, today);
    expect(result.reasons).toContain("section_excluded");
    expect(result.eligible).toBe(false);
  });

  it("dd_too_large: monthlyDD of 1000 is too small for bmo-400's requirement", () => {
    const profile = { ...maProfile(), monthlyDD: 1000 };
    const result = evaluate(bonus("bmo-400"), profile, today);
    expect(result.reasons).toContain("dd_too_large");
    expect(result.eligible).toBe(false);
  });
});

describe("evaluate — warnings", () => {
  it("not_enriched: bmo-400 is not yet enriched", () => {
    const result = evaluate(bonus("bmo-400"), maProfile(), today);
    expect(result.warnings).toContain("not_enriched");
  });

  it("dd_unknown: chase-400 requires DD but has no known amount", () => {
    const result = evaluate(bonus("chase-400"), maProfile(), today);
    expect(result.warnings).toContain("dd_unknown");
  });

  it("expires_soon: expiration within 30 days of today", () => {
    const b: Bonus = { ...bonus("us-bank-450"), expiration: "2026-09-20" };
    const result = evaluate(b, maProfile(), today);
    expect(result.warnings).toContain("expires_soon");
  });

  it("expires_soon: present at exactly the 30-day boundary", () => {
    const b: Bonus = { ...bonus("us-bank-450"), expiration: "2026-10-13" };
    const result = evaluate(b, maProfile(), today);
    expect(result.warnings).toContain("expires_soon");
  });

  it("expires_soon: absent one day past the 30-day boundary (31 days out)", () => {
    const b: Bonus = { ...bonus("us-bank-450"), expiration: "2026-10-14" };
    const result = evaluate(b, maProfile(), today);
    expect(result.warnings).not.toContain("expires_soon");
  });

  it("expires_soon is suppressed when the bonus is already expired", () => {
    const result = evaluate(bonus("expired-100"), maProfile(), today);
    expect(result.warnings).not.toContain("expires_soon");
  });

  it("has_etf: bonus carries an early termination fee amount above zero", () => {
    const b: Bonus = { ...bonus("wells-fargo-500"), etf: { amount: 20, days: 30 } };
    const result = evaluate(b, maProfile(), today);
    expect(result.warnings).toContain("has_etf");
  });

  it("has_etf is not set when etf amount is zero", () => {
    const result = evaluate(bonus("chase-400"), maProfile(), today);
    expect(result.warnings).not.toContain("has_etf");
  });
});

describe("evaluate — purity", () => {
  it("does not mutate the bonus or profile inputs", () => {
    const b = bonus("wells-fargo-500");
    const profile = maProfile();
    const bSnapshot = JSON.stringify(b);
    const profileSnapshot = JSON.stringify(profile);
    evaluate(b, profile, today);
    expect(JSON.stringify(b)).toBe(bSnapshot);
    expect(JSON.stringify(profile)).toBe(profileSnapshot);
  });

  it("is deterministic for the same inputs", () => {
    const b = bonus("sofi-675");
    const profile = maProfile();
    const r1 = evaluate(b, profile, today);
    const r2 = evaluate(b, profile, today);
    expect(r1).toEqual(r2);
  });
});

import { score, holdMonths, ddCost, compareByScore } from "./scoring";
import type { Bonus } from "./types";
import { fixture } from "../data/fixture";

const bonus = (id: string): Bonus => {
  const found = fixture.find((b) => b.id === id);
  if (!found) throw new Error(`fixture missing ${id}`);
  return found;
};

describe("holdMonths", () => {
  it("is 6 for a bonus with etf null (defaults to a 180-day hold)", () => {
    // wells-fargo-500 has etf: null -> ceil((180 ?? ...)/30) = ceil(180/30) = 6
    expect(holdMonths(bonus("wells-fargo-500"))).toBe(6);
  });

  it("uses etf.days when present", () => {
    // chase-400 has etf: { amount: 0, days: 180 } -> ceil(180/30) = 6
    expect(holdMonths(bonus("chase-400"))).toBe(6);
  });
});

describe("ddCost", () => {
  it("is 0 when dd.required is false", () => {
    // fourfront-400 has dd: { required: false, amount: null, deadline_days: null }
    expect(ddCost(bonus("fourfront-400"))).toBe(0);
  });

  it("is 500 when dd is required but amount is null (unknown DD amount)", () => {
    // chase-400 has dd: { required: true, amount: null, deadline_days: 90 } -> amount ?? 500 = 500
    expect(ddCost(bonus("chase-400"))).toBe(500);
  });

  it("is the DD amount when dd is required and amount is known", () => {
    // wells-fargo-500 has dd: { required: true, amount: 1000, deadline_days: 90 }
    expect(ddCost(bonus("wells-fargo-500"))).toBe(1000);
  });
});

describe("score", () => {
  it("scores a no-DD bonus higher than an otherwise identical bonus requiring the same DD amount", () => {
    const base = bonus("wells-fargo-500");
    // withDD is the fixture bonus unchanged: dd = { required: true, amount: 1000, deadline_days: 90 },
    // monthly_fee = { amount: 15, avoidable: true }, etf = null, bonus_max = 500.
    const withDD: Bonus = { ...base };
    // noDD is the same bonus but dd.required flips to false (same amount: 1000, same deadline_days).
    const noDD: Bonus = { ...base, dd: { ...base.dd, required: false } };

    // Shared arithmetic (identical for both since only dd.required differs):
    //   holdMonths = ceil((etf?.days ?? 180) / 30) = ceil(180 / 30) = 6
    //   fee = monthly_fee.avoidable is true, so fee = 0 for both
    //   net = bonus_max - fee = 500 - 0 = 500
    //   timeCost = max(etf?.days ?? 0, dd.deadline_days ?? 60) / 30 = max(0, 90) / 30 = 3
    //
    // withDD: ddCost = dd.amount (required, amount known) = 1000
    //   score = 500 / (1 + 1000/1000) / (1 + 3/6) = 500 / 2 / 1.5 = 166.6666...
    //
    // noDD: ddCost = 0 (required === false)
    //   score = 500 / (1 + 0/1000) / (1 + 3/6) = 500 / 1 / 1.5 = 333.3333...
    expect(score(withDD)).toBeCloseTo(166.666667, 5);
    expect(score(noDD)).toBeCloseTo(333.333333, 5);
    expect(score(noDD)).toBeGreaterThan(score(withDD));
  });

  it("lowers the score when a monthly fee is unavoidable vs. the same bonus with an avoidable fee", () => {
    const base = bonus("wells-fargo-500");
    const shared: Bonus = { ...base, etf: { amount: 0, days: 180 } };
    const unavoidable: Bonus = { ...shared, monthly_fee: { amount: 15, avoidable: false } };
    const avoidable: Bonus = { ...shared, monthly_fee: { amount: 15, avoidable: true } };

    // Shared arithmetic:
    //   holdMonths = ceil(180 / 30) = 6
    //   ddCost = dd.amount (required, known) = 1000
    //   timeCost = max(etf.days=180, dd.deadline_days=90) / 30 = 180 / 30 = 6
    //
    // unavoidable: fee = 15 * holdMonths = 15 * 6 = 90
    //   net = 500 - 90 = 410
    //   score = 410 / (1 + 1000/1000) / (1 + 6/6) = 410 / 2 / 2 = 102.5
    //
    // avoidable: fee = 0 (avoidable !== false)
    //   net = 500 - 0 = 500
    //   score = 500 / 2 / 2 = 125
    expect(score(unavoidable)).toBeCloseTo(102.5, 5);
    expect(score(avoidable)).toBeCloseTo(125, 5);
    expect(score(unavoidable)).toBeLessThan(score(avoidable));
  });
});

describe("compareByScore", () => {
  it("orders fourfront-400 (no DD) ahead of chase-400 (DD required, unknown amount) on the fixture", () => {
    // fourfront-400: bonus_max=400, dd={required:false,...}, etf=null, monthly_fee=null
    //   holdMonths = ceil(180/30) = 6; ddCost = 0 (required false); fee = 0
    //   net = 400; timeCost = max(0, dd.deadline_days ?? 60 = 60) / 30 = 2
    //   score = 400 / (1+0/1000) / (1+2/6) = 400 / 1 / 1.333333 = 300
    //
    // chase-400: bonus_max=400, dd={required:true,amount:null,deadline_days:90}, etf={amount:0,days:180}
    //   holdMonths = ceil(180/30) = 6; ddCost = amount ?? 500 = 500; fee = 0 (monthly_fee null)
    //   net = 400; timeCost = max(180, 90) / 30 = 6
    //   score = 400 / (1+500/1000) / (1+6/6) = 400 / 1.5 / 2 = 133.333333
    const sorted = [...fixture].sort(compareByScore);
    const ids = sorted.map((b) => b.id);
    expect(ids.indexOf("fourfront-400")).toBeLessThan(ids.indexOf("chase-400"));
    expect(score(bonus("fourfront-400"))).toBeCloseTo(300, 5);
    expect(score(bonus("chase-400"))).toBeCloseTo(133.333333, 5);
  });

  it("sorts equal-score, equal-bonus_max bonuses by bank ascending, deterministically", () => {
    const base = bonus("wells-fargo-500");
    const zeta: Bonus = { ...base, id: "zeta-500", bank: "Zeta Bank" };
    const alpha: Bonus = { ...base, id: "alpha-500", bank: "Alpha Bank" };
    // score(zeta) === score(alpha) and bonus_max is identical (both copy base), so
    // compareByScore falls through to a.bank.localeCompare(b.bank), putting "Alpha Bank"
    // before "Zeta Bank".
    expect(score(zeta)).toBeCloseTo(score(alpha), 10);

    const firstSort = [zeta, alpha].sort(compareByScore).map((b) => b.id);
    const secondSort = [zeta, alpha].sort(compareByScore).map((b) => b.id);
    expect(firstSort).toEqual(["alpha-500", "zeta-500"]);
    expect(secondSort).toEqual(firstSort);
  });
});

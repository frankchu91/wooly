import type { Bonus } from "./types";

// Effective hold period (in months) implied by the account's early-termination-fee
// window, rounded up to whole months. Bonuses without an ETF window default to a
// conservative 180-day (6-month) hold.
export const holdMonths = (b: Bonus): number => Math.ceil((b.etf?.days ?? 180) / 30);

// The DD amount assumed for a bonus that requires a direct deposit but doesn't say how
// much. Lives here (rather than in the scheduler) so scoring and scheduling make the
// same assumption: an unenriched offer never looks free, and it consumes a plausible
// slice of the month's payroll capacity instead of nothing.
export const ASSUMED_DD_AMOUNT = 500;

// The direct-deposit dollar amount the bonus effectively requires. No DD requirement
// costs nothing; a required DD with an unknown amount is treated as `ASSUMED_DD_AMOUNT`
// so unenriched/incomplete data doesn't score as free.
export const ddCost = (b: Bonus): number =>
  b.dd.required === false ? 0 : (b.dd.amount ?? ASSUMED_DD_AMOUNT);

// Net expected value of a bonus, discounted by the DD burden it imposes and the time
// it ties up an account for, per spec §4.3. `bonus_min` is used in preference to
// `bonus_max` so a tiered "up to $7,000" offer is ranked on the amount a typical user
// will actually see, not its headline.
export function score(b: Bonus): number {
  const fee =
    b.monthly_fee && b.monthly_fee.avoidable === false ? b.monthly_fee.amount * holdMonths(b) : 0;
  const net = (b.bonus_min ?? b.bonus_max ?? 0) - fee;
  const timeCost = Math.max(b.etf?.days ?? 0, b.dd.deadline_days ?? 60) / 30;
  return net / (1 + ddCost(b) / 1000) / (1 + timeCost / 6);
}

// Ranks bonuses best-first: highest score, then highest bonus_max, then bank name
// ascending — the tie-breakers make the ordering total and deterministic.
export const compareByScore = (a: Bonus, b: Bonus): number =>
  score(b) - score(a) || (b.bonus_max ?? 0) - (a.bonus_max ?? 0) || a.bank.localeCompare(b.bank);

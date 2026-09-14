import { addDays, addMonths, format, parseISO } from "date-fns";
import { evaluate, normalizeBankName } from "./eligibility";
import { ASSUMED_DD_AMOUNT, compareByScore } from "./scoring";
import type { Bonus, Plan, PlanItem, PlanMonth, Profile, Warning } from "./types";

// Per spec §4.4. A no-DD bonus never competes for a payroll-split slot (it has nothing
// to split), so it is capped independently: at most this many no-DD accounts may open
// in the same calendar month.
export const NO_DD_CAP_PER_MONTH = 3;
// When the profile treats an ACH push as a qualifying direct deposit, payroll-split
// capacity is effectively not the bottleneck — this large placeholder stands in for
// "unlimited" splits per month so DD bonuses are only limited by monthly DD capacity.
export const UNLIMITED_SPLITS = 6;
// Fallback DD deadline (days) used when a bonus doesn't specify one.
export const DEFAULT_DD_DEADLINE_DAYS = 60;
// Fallback safe-close hold (days) used when a bonus has no ETF window, and the floor
// applied even when a bonus does have one.
export const DEFAULT_SAFE_CLOSE_DAYS = 180;

/** Adds `n` calendar months to a `YYYY-MM` month string, returning `YYYY-MM`. */
export const monthAdd = (month: string, n: number): string =>
  format(addMonths(parseISO(monthStartDate(month)), n), "yyyy-MM");

/** The ISO date (`YYYY-MM-01`) of the first day of a `YYYY-MM` month string. */
export const monthStartDate = (month: string): string => `${month}-01`;

// Scheduling-only bookkeeping (how many no-DD accounts have opened this month) that
// doesn't belong on the public `PlanMonth` shape returned to callers.
interface WorkingMonth extends PlanMonth {
  noDD: number;
}

/**
 * Greedily assigns eligible bonuses to months across the profile's horizon.
 *
 * Bonuses are evaluated for eligibility, ranked best-first by `compareByScore`, then
 * placed one at a time into the earliest month whose window has room: DD-required
 * bonuses consume one payroll-split slot in every month of their DD window and must
 * fit within remaining monthly DD capacity; no-DD bonuses consume no slot and are
 * instead capped at `NO_DD_CAP_PER_MONTH` per month. At most one bonus per bank is
 * ever placed, regardless of how many candidates from that bank are eligible.
 */
export function buildPlan(
  bonuses: Bonus[],
  profile: Profile,
  { today, skippedIds = [] }: { today: Date; skippedIds?: string[] },
): Plan {
  const months: WorkingMonth[] = Array.from({ length: profile.horizonMonths }, (_, i) => ({
    month: monthAdd(profile.startMonth, i),
    items: [],
    ddUsed: 0,
    slotsUsed: 0,
    noDD: 0,
  }));
  const slots = profile.achPushCountsAsDD ? UNLIMITED_SPLITS : profile.maxSplits;
  const skipped: Plan["skipped"] = [];
  const candidates: Bonus[] = [];
  // `evaluate` is called once per bonus; its warnings are reused on the PlanItem
  // instead of re-evaluating the same bonus a second time.
  const warningsById = new Map<string, Warning[]>();

  for (const b of bonuses) {
    if (skippedIds.includes(b.id)) {
      skipped.push({ bonus: b, reasons: ["user_skipped"] });
      continue;
    }
    const ev = evaluate(b, profile, today);
    if (ev.eligible) {
      candidates.push(b);
      warningsById.set(b.id, ev.warnings);
    } else {
      skipped.push({ bonus: b, reasons: ev.reasons, antiChurnUntil: ev.antiChurnUntil });
    }
  }

  candidates.sort(compareByScore);
  const usedBanks = new Set<string>();

  for (const b of candidates) {
    const bankKey = normalizeBankName(b.bank);
    if (usedBanks.has(bankKey)) continue;

    const needsDD = b.dd.required !== false;
    // A required-but-unknown DD amount costs `ASSUMED_DD_AMOUNT` here exactly as it does
    // in `score`/`ddCost`, so such a bonus consumes real capacity instead of looking
    // free and being front-loaded. The card's `dd_unknown` warning says it's a guess.
    const amount = needsDD ? (b.dd.amount ?? ASSUMED_DD_AMOUNT) : 0;
    // No-DD bonuses occupy a single month; DD bonuses span the months implied by
    // their deadline.
    const span = needsDD
      ? Math.max(1, Math.ceil((b.dd.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS) / 30))
      : 1;

    let placed = false;
    // Set when a window start month is ruled out only because the offer expires before
    // that month begins — it tells the "didn't fit" branch below that expiration, not
    // capacity, is what cut the search short.
    let cutOffByExpiration = false;
    for (let m = 0; m < months.length; m++) {
      const window = months.slice(m, m + span);
      if (window.length < span) break;
      // Opening an account in a month that starts after the offer has expired is not a
      // plan, it's a dead end — those months aren't candidates at all.
      if (b.expiration && monthStartDate(months[m].month) > b.expiration) {
        cutOffByExpiration = true;
        continue;
      }
      if (!needsDD && months[m].noDD >= NO_DD_CAP_PER_MONTH) continue;
      // Only DD bonuses compete for payroll-split slots.
      if (needsDD && window.some((w) => w.slotsUsed >= slots)) continue;
      const free = window.reduce((s, w) => s + (profile.monthlyDD - w.ddUsed), 0);
      if (amount > free) continue;

      // Allocate greedily month by month within the window. A payroll-split slot is
      // consumed only in the months that actually carry some of this bonus's DD — once
      // the requirement is met the split is free again, so the rest of the window can
      // host the next bonus.
      let remaining = amount;
      const ddSchedule: { month: string; amount: number }[] = [];
      for (const w of window) {
        const take = Math.min(remaining, profile.monthlyDD - w.ddUsed);
        if (take > 0) {
          w.ddUsed += take;
          ddSchedule.push({ month: w.month, amount: take });
          remaining -= take;
          if (needsDD) w.slotsUsed += 1;
        }
      }
      if (!needsDD) months[m].noDD += 1;

      const open = parseISO(monthStartDate(months[m].month));
      const item: PlanItem = {
        bonus: b,
        openMonth: months[m].month,
        ddSchedule,
        ddDeadline: format(
          addDays(open, b.dd.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS),
          "yyyy-MM-dd",
        ),
        safeCloseDate: format(
          addDays(open, Math.max(b.etf?.days ?? DEFAULT_SAFE_CLOSE_DAYS, DEFAULT_SAFE_CLOSE_DAYS)),
          "yyyy-MM-dd",
        ),
        warnings: warningsById.get(b.id) ?? [],
      };
      months[m].items.push(item);
      usedBanks.add(bankKey);
      placed = true;
      break;
    }

    // An eligible candidate whose window search exhausts the horizon without ever
    // fitting is recorded as skipped instead of silently vanishing from the plan. Its
    // bank is deliberately left unclaimed so a later, differently-shaped bonus from the
    // same bank still gets a chance.
    if (!placed) {
      skipped.push({ bonus: b, reasons: [cutOffByExpiration ? "expires_first" : "no_capacity"] });
    }
  }

  const items = months.flatMap((m) => m.items);
  const projected = items.reduce((s, i) => s + (i.bonus.bonus_max ?? 0), 0);
  // The conservative half of the headline: a tiered offer contributes the amount a
  // typical user actually clears, not its "up to" figure.
  const projectedMin = items.reduce((s, i) => s + (i.bonus.bonus_min ?? i.bonus.bonus_max ?? 0), 0);
  const avgDDUsed = months.length ? months.reduce((s, m) => s + m.ddUsed, 0) / months.length : 0;

  return {
    months: months.map((m) => ({
      month: m.month,
      items: m.items,
      ddUsed: m.ddUsed,
      slotsUsed: m.slotsUsed,
    })),
    skipped,
    totals: { projected, projectedMin, accounts: items.length, avgDDUsed },
  };
}

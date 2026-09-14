import { addDays, format, parseISO } from "date-fns";

import { DEFAULT_DD_DEADLINE_DAYS, DEFAULT_SAFE_CLOSE_DAYS } from "./scheduler";
import type { Bonus, Condition, TrackedItem, TrackStatus } from "./types";

const SYNTH_DD_ID = "synth-dd";
const SYNTH_KEEP_OPEN_ID = "synth-keep";

/** The English text for a synthesised condition. The engine has no copy of its own
 * (§ engine pure), so the caller — the UI, reading from `t.conditions.synth` — supplies
 * these. */
export interface ConditionLabels {
  dd(amount: number, days: number): string;
  ddUnknown(days: number): string;
  keepOpen(days: number): string;
}

/**
 * The checklist shown for a bonus: its recorded `conditions` (doc-sourced first, then
 * bank-sourced, deduped by `id`) plus synthesised entries for requirements the
 * structured fields imply but no condition sentence was extracted for:
 * - a `direct_deposit` condition from `dd`, when `dd.required !== false` and no
 *   `direct_deposit` condition already exists (id `synth-dd`);
 * - a `keep_open` condition from `etf.days`, when set and no `keep_open` condition
 *   already exists (id `synth-keep`).
 */
export function checklistFor(bonus: Bonus, labels: ConditionLabels): Condition[] {
  const ordered = [
    ...bonus.conditions.filter((c) => c.source === "doc"),
    ...bonus.conditions.filter((c) => c.source === "bank"),
  ];
  const seen = new Set<string>();
  const checklist: Condition[] = [];
  for (const condition of ordered) {
    if (seen.has(condition.id)) continue;
    seen.add(condition.id);
    checklist.push(condition);
  }

  if (!checklist.some((c) => c.kind === "direct_deposit") && bonus.dd.required !== false) {
    const days = bonus.dd.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS;
    const amount = bonus.dd.amount;
    checklist.push({
      id: SYNTH_DD_ID,
      kind: "direct_deposit",
      text: amount != null ? labels.dd(amount, days) : labels.ddUnknown(days),
      amount,
      days,
      count: null,
      source: "doc",
    });
  }

  if (!checklist.some((c) => c.kind === "keep_open") && bonus.etf?.days) {
    checklist.push({
      id: SYNTH_KEEP_OPEN_ID,
      kind: "keep_open",
      text: labels.keepOpen(bonus.etf.days),
      amount: null,
      days: bonus.etf.days,
      count: null,
      source: "doc",
    });
  }

  return checklist;
}

/** The earliest date it's safe to close the account: `opened + (hold_days ?? etf.days ??
 * 180)`. Uses `parseISO`/`addDays`/`format` so a date-only ISO string (local midnight)
 * doesn't shift a day the way `new Date(openedISO)` (UTC midnight) would. */
export function earliestCloseDate(bonus: Bonus, openedISO: string): string {
  const days = bonus.hold_days ?? bonus.etf?.days ?? DEFAULT_SAFE_CLOSE_DAYS;
  return format(addDays(parseISO(openedISO), days), "yyyy-MM-dd");
}

/**
 * Whether this item's bonus has actually landed in the user's account.
 *
 * `received` says so outright. `closed` does not: an account closed from `planned` or
 * `opened` — the offer fell through, the user changed their mind, the bonus never posted —
 * is closed without ever having paid, and counting it as earned inflates the one number on
 * the tracker the user is keeping score with. A closed item counts only when it carries
 * evidence of the money: a `received` date it passed through, or an amount the user typed.
 */
export function hasPosted(item: TrackedItem): boolean {
  if (item.status === "received") return true;
  return item.status === "closed" && (item.dates.received != null || item.bonusReceived != null);
}

/** What a tracked item actually paid: the user's recorded amount if they entered one,
 * else the bonus's headline `bonus_max`, else 0 when the bonus itself is unavailable
 * (e.g. dropped out of the dataset). */
export function receivedAmount(item: TrackedItem, bonus: Bonus | undefined): number {
  return item.bonusReceived ?? bonus?.bonus_max ?? 0;
}

export interface LedgerTotals {
  earned: number;
  pending: number;
  planned: number;
  /** Per-stage tallies, plus `earned`: how many accounts actually paid (`hasPosted`),
   * which is what the "N accounts" line under the Earned figure counts. It is not a stage
   * — a closed account that never paid is still a closed account, just not an earning
   * one — so it sits alongside the five rather than replacing any of them. */
  counts: Record<TrackStatus, number> & { earned: number };
}

/**
 * Ledger totals across every tracked item, for the tracker's summary card:
 * - `earned` sums the items whose bonus actually posted (`hasPosted`) using each item's
 *   real `receivedAmount`; a closed item with nothing to show for it adds $0;
 * - `pending` sums `opened` + `requirements_met` items using the bonus's `bonus_max`
 *   (nothing has posted yet, so there's no real amount to prefer);
 * - `planned` sums `planned` items, likewise by `bonus_max`;
 * - `counts` tallies items per stage, plus the number that posted.
 *
 * `bonusesById` is a lookup rather than an array so a large tracker doesn't re-scan the
 * full bonus list once per item.
 */
export function ledgerTotals(
  items: TrackedItem[],
  bonusesById: Record<string, Bonus>,
): LedgerTotals {
  const counts = {
    planned: 0,
    opened: 0,
    requirements_met: 0,
    received: 0,
    closed: 0,
    earned: 0,
  };
  let earned = 0;
  let pending = 0;
  let planned = 0;

  for (const item of items) {
    counts[item.status] += 1;
    const bonus = bonusesById[item.bonusId];
    if (hasPosted(item)) {
      counts.earned += 1;
      earned += receivedAmount(item, bonus);
      continue;
    }
    switch (item.status) {
      case "opened":
      case "requirements_met":
        pending += bonus?.bonus_max ?? 0;
        break;
      case "planned":
        planned += bonus?.bonus_max ?? 0;
        break;
      // A closed item that never paid adds nothing anywhere: it is not money in hand, and
      // it is certainly not still on its way.
      default:
        break;
    }
  }

  return { earned, pending, planned, counts };
}

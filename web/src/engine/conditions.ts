import { addDays, format, parseISO } from "date-fns";

import { DEFAULT_DD_DEADLINE_DAYS } from "./scheduler";
import type { Bonus, Condition } from "./types";
// Type-only: erased by `verbatimModuleSyntax` at compile time, so this introduces no
// runtime dependency on the state layer (or its persistence/localStorage side effects)
// — the engine stays pure. `TrackedItem`/`TrackStatus` are the store's tracking domain
// types; `ledgerTotals`/`receivedAmount` just need their shape.
import type { TrackedItem, TrackStatus } from "../state/store";

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
  const days = bonus.hold_days ?? bonus.etf?.days ?? 180;
  return format(addDays(parseISO(openedISO), days), "yyyy-MM-dd");
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
  counts: Record<TrackStatus, number>;
}

/**
 * Ledger totals across every tracked item, for the tracker's summary card:
 * - `earned` sums `received` + `closed` items using each item's real `receivedAmount`;
 * - `pending` sums `opened` + `requirements_met` items using the bonus's `bonus_max`
 *   (nothing has posted yet, so there's no real amount to prefer);
 * - `planned` sums `planned` items, likewise by `bonus_max`;
 * - `counts` tallies items per stage.
 *
 * `bonusesById` is a lookup rather than an array so a large tracker doesn't re-scan the
 * full bonus list once per item.
 */
export function ledgerTotals(
  items: TrackedItem[],
  bonusesById: Record<string, Bonus>,
): LedgerTotals {
  const counts: Record<TrackStatus, number> = {
    planned: 0,
    opened: 0,
    requirements_met: 0,
    received: 0,
    closed: 0,
  };
  let earned = 0;
  let pending = 0;
  let planned = 0;

  for (const item of items) {
    counts[item.status] += 1;
    const bonus = bonusesById[item.bonusId];
    switch (item.status) {
      case "received":
      case "closed":
        earned += receivedAmount(item, bonus);
        break;
      case "opened":
      case "requirements_met":
        pending += bonus?.bonus_max ?? 0;
        break;
      case "planned":
        planned += bonus?.bonus_max ?? 0;
        break;
    }
  }

  return { earned, pending, planned, counts };
}

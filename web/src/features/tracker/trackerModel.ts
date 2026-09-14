import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import { earliestCloseDate } from "../../engine/conditions";
import { DEFAULT_DD_DEADLINE_DAYS } from "../../engine/scheduler";
import { STATUS_ORDER } from "../../engine/types";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { dateLabel, monthLabel } from "../../ui";
import { splitConditions } from "../conditions/visibleConditions";

/** A DD deadline this close needs to shout — it's the one date on the tracker the user
 * can still miss by doing nothing. */
export const DD_WARNING_DAYS = 14;

/** A `Date` as the `YYYY-MM-DD` the store records, read in local time — `toISOString`
 * would shift the day for anyone west of UTC. */
export function toISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** How many of a bonus's requirements the user has ticked off, out of how many there are.
 * Counts against `splitConditions`'s checklist — not the raw `bonus.conditions`, and not
 * the notes — so the denominator always matches the boxes the drawer actually renders.
 * Ids in `conditionsDone` that are no longer on the checklist (a condition the scraper
 * has since dropped or reworded) are ignored rather than counted. */
export function requirementsProgress(
  item: TrackedItem,
  bonus: Bonus | undefined,
): { done: number; total: number } {
  if (!bonus) return { done: 0, total: 0 };
  const { checklist } = splitConditions(bonus);
  const done = new Set(item.conditionsDone);
  return {
    done: checklist.filter((condition) => done.has(condition.id)).length,
    total: checklist.length,
  };
}

/** The date the direct deposit has to land by: the open date plus the offer's deadline
 * (or the scheduler's default when it doesn't state one). `null` when the account isn't
 * open yet, or when the offer needs no direct deposit at all — an invented deadline is
 * worse than none. */
export function ddDeadlineFor(item: TrackedItem, bonus: Bonus | undefined): string | null {
  const opened = item.dates.opened;
  if (!opened) return null;
  if (bonus && bonus.dd.required === false) return null;
  const days = bonus?.dd.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS;
  return format(addDays(parseISO(opened), days), "yyyy-MM-dd");
}

/** True when the item is open and its direct-deposit deadline is inside the warning
 * window (or already past) — drives the coral treatment on the ledger's requirements
 * chip and on the pipeline card's context line. */
export function ddDeadlineIsUrgent(
  item: TrackedItem,
  bonus: Bonus | undefined,
  today: Date,
): boolean {
  if (item.status !== "opened") return false;
  const deadline = ddDeadlineFor(item, bonus);
  if (!deadline) return false;
  return differenceInCalendarDays(parseISO(deadline), today) < DD_WARNING_DAYS;
}

/** The earliest date it's safe to close, plus the rule that produced it — the drawer
 * shows both, so the user can see *why* the date is what it is. `null` when the account
 * isn't open yet (the window is measured from the open date). */
export function safeCloseFor(
  item: TrackedItem,
  bonus: Bonus | undefined,
): { date: string; reason: string } | null {
  const opened = item.dates.opened;
  if (!opened || !bonus) return null;
  const reason =
    bonus.hold_days != null
      ? t.tracker.safeClose.reason.keepOpen(bonus.hold_days)
      : bonus.etf?.days != null
        ? t.tracker.safeClose.reason.etf(bonus.etf.days)
        : t.tracker.safeClose.reason.default;
  return { date: earliestCloseDate(bonus, opened), reason };
}

export type ContextTone = "muted" | "warn";

export interface StageContext {
  text: string;
  tone: ContextTone;
}

/**
 * The single line of context a pipeline card shows under its amount, chosen by stage
 * (spec §4.3): what the user is waiting for right now, and whether it's urgent.
 *
 * `tone` is `"warn"` only where the user can still lose money by doing nothing — a DD
 * deadline inside the warning window or already past.
 */
export function stageContextLine(
  item: TrackedItem,
  bonus: Bonus | undefined,
  today: Date,
): StageContext {
  switch (item.status) {
    case "planned":
      return {
        text: item.openMonth
          ? t.tracker.plannedFor(monthLabel(item.openMonth))
          : t.tracker.statuses.planned,
        tone: "muted",
      };

    case "opened": {
      const deadline = ddDeadlineFor(item, bonus);
      if (deadline) {
        const daysLeft = differenceInCalendarDays(parseISO(deadline), today);
        if (daysLeft < 0) return { text: t.tracker.overdue, tone: "warn" };
        return {
          text: `${t.tracker.fields.ddBy} ${dateLabel(deadline)} · ${t.tracker.daysLeft(daysLeft)}`,
          tone: daysLeft < DD_WARNING_DAYS ? "warn" : "muted",
        };
      }
      // A no-DD offer (or one opened without a recorded date) has no deadline to show,
      // so the line falls back to the fact it does have.
      return {
        text: item.dates.opened
          ? t.tracker.openedOn(dateLabel(item.dates.opened))
          : t.tracker.statuses.opened,
        tone: "muted",
      };
    }

    case "requirements_met":
      return { text: t.tracker.waitingForBonus, tone: "muted" };

    case "received": {
      const safeClose = safeCloseFor(item, bonus);
      if (safeClose) {
        const daysLeft = differenceInCalendarDays(parseISO(safeClose.date), today);
        if (daysLeft <= 0) return { text: t.tracker.safeToCloseNow, tone: "muted" };
        return {
          text: `${t.tracker.fields.closeAfter} ${dateLabel(safeClose.date)} · ${t.tracker.ledger.daysUntilClose(daysLeft)}`,
          tone: "muted",
        };
      }
      return {
        text: item.dates.received
          ? t.tracker.receivedOn(dateLabel(item.dates.received))
          : t.tracker.statuses.received,
        tone: "muted",
      };
    }

    case "closed":
      return {
        text: item.dates.closed
          ? t.tracker.closedOn(dateLabel(item.dates.closed))
          : t.tracker.statuses.closed,
        tone: "muted",
      };
  }
}

/** The ledger's row order: by stage (pipeline order), then by when the account opened —
 * falling back to the month it's planned for, so a planned row still sorts sensibly
 * against its neighbours. Returns a new array; the caller's list is untouched. */
export function sortForLedger(items: TrackedItem[]): TrackedItem[] {
  return [...items].sort((a, b) => {
    const byStage = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (byStage !== 0) return byStage;
    // `YYYY-MM-DD` and `YYYY-MM` both sort correctly as plain strings, and a month
    // sorts just before any day within it — which is the order a reader expects.
    const aKey = a.dates.opened ?? a.openMonth;
    const bKey = b.dates.opened ?? b.openMonth;
    return aKey.localeCompare(bKey);
  });
}

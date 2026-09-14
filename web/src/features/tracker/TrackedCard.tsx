import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { useState } from "react";

import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { STATUS_ORDER, useStore } from "../../state/store";
import type { TrackedItem, TrackStatus } from "../../state/store";
import { Badge, BankAvatar, Button, Card, MoneyText, cn, dateLabel, monthLabel } from "../../ui";

// Fallbacks for when the tracked bonus itself doesn't specify these — matches the
// defaults used by the plan scheduler (`engine/scheduler.ts`).
const DEFAULT_DD_DEADLINE_DAYS = 60;
const DEFAULT_SAFE_CLOSE_DAYS = 180;
const DAYS_LEFT_WARNING_THRESHOLD = 14;

const todayISO = () => format(new Date(), "yyyy-MM-dd");

export interface TrackedCardProps {
  item: TrackedItem;
  /** The bonus this item refers to, or `undefined` if it's since dropped out of the
   * dataset (e.g. expired). The card still renders — with the bonus id as its title
   * and no money value — rather than crashing. */
  bonus: Bonus | undefined;
}

/** A single tracked bonus within `TrackerPage`. Always an `<li>` — its parent group
 * renders a `<ul>` of these. */
export function TrackedCard({ item, bonus }: TrackedCardProps) {
  const advance = useStore((state) => state.advance);
  const untrack = useStore((state) => state.untrack);
  const [advancing, setAdvancing] = useState(false);
  const [date, setDate] = useState(todayISO);

  const currentIndex = STATUS_ORDER.indexOf(item.status);
  const nextStatus: TrackStatus | undefined = STATUS_ORDER[currentIndex + 1];

  // A no-DD bonus has no direct-deposit deadline, so it gets neither the date line nor
  // the countdown badge — an invented deadline is worse than none.
  const needsDD = bonus == null || bonus.dd.required !== false;
  const opened = item.dates.opened;
  const ddDeadlineISO =
    opened && needsDD
      ? format(
          addDays(parseISO(opened), bonus?.dd?.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS),
          "yyyy-MM-dd",
        )
      : null;
  const safeCloseISO = opened
    ? format(
        addDays(
          parseISO(opened),
          Math.max(bonus?.etf?.days ?? DEFAULT_SAFE_CLOSE_DAYS, DEFAULT_SAFE_CLOSE_DAYS),
        ),
        "yyyy-MM-dd",
      )
    : null;

  const daysLeft = ddDeadlineISO
    ? differenceInCalendarDays(parseISO(ddDeadlineISO), new Date())
    : null;
  const showDeadlineBadge = item.status === "opened" && daysLeft !== null;

  function openAdvanceForm() {
    setDate(todayISO());
    setAdvancing(true);
  }

  function confirmAdvance() {
    advance(item.id, date);
    setAdvancing(false);
  }

  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <BankAvatar name={bonus?.bank ?? item.bonusId} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-heading text-sm font-semibold text-ink">
            {bonus?.title ?? item.bonusId}
          </h3>
          {bonus ? (
            <MoneyText
              value={bonus.bonus_max}
              range={[bonus.bonus_min, bonus.bonus_max]}
              size="md"
            />
          ) : null}
          {item.status === "planned" && item.openMonth ? (
            <p className="text-xs text-muted">{t.tracker.plannedFor(monthLabel(item.openMonth))}</p>
          ) : null}
        </div>
      </div>

      <ol aria-label={t.tracker.progress} className="flex items-center gap-1.5">
        {STATUS_ORDER.map((status, index) => (
          <li
            key={status}
            aria-current={status === item.status ? "step" : undefined}
            className="flex items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                index <= currentIndex ? "bg-primary" : "bg-mint",
              )}
            />
            <span className="sr-only">{t.tracker.statuses[status]}</span>
          </li>
        ))}
      </ol>

      {ddDeadlineISO || safeCloseISO ? (
        <div className="flex flex-col gap-0.5 text-xs text-muted">
          {ddDeadlineISO ? (
            <p>
              {t.plan.ddBy} {dateLabel(ddDeadlineISO)}
            </p>
          ) : null}
          {safeCloseISO ? (
            <p>
              {t.plan.safeClose} {dateLabel(safeCloseISO)}
            </p>
          ) : null}
        </div>
      ) : null}

      {showDeadlineBadge && daysLeft !== null ? (
        <div>
          <Badge tone={daysLeft < DAYS_LEFT_WARNING_THRESHOLD ? "coral" : "neutral"}>
            {daysLeft < 0 ? t.tracker.overdue : t.tracker.daysLeft(daysLeft)}
          </Badge>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {item.status !== "closed" && nextStatus ? (
          advancing ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-label={t.tracker.dateFor(t.tracker.statuses[nextStatus])}
                className="rounded-control border border-mint bg-surface px-2 py-1.5 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
              <Button onClick={confirmAdvance}>{t.common.save}</Button>
              <Button variant="ghost" onClick={() => setAdvancing(false)}>
                {t.common.cancel}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={openAdvanceForm}>
              {t.tracker.advance}
            </Button>
          )
        ) : null}

        <Button variant="ghost" onClick={() => untrack(item.id)}>
          {t.tracker.untrack}
        </Button>

        {bonus ? (
          <a
            href={bonus.doc_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t.bonuses.openDoc}
          </a>
        ) : null}
      </div>
    </Card>
  );
}

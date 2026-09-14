import { Lock } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useState } from "react";

import { hasPosted, receivedAmount } from "../../engine/conditions";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { Badge, BankAvatar, Card, Toggle, cn, dateLabel, money } from "../../ui";
import {
  ddDeadlineFor,
  ddDeadlineIsUrgent,
  requirementsProgress,
  safeCloseFor,
  sortForLedger,
} from "./trackerModel";

export interface LedgerTableProps {
  items: TrackedItem[];
  bonusesById: Record<string, Bonus>;
  today: Date;
  onSelect: (id: string) => void;
}

const HEADER_CLASS =
  "whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
const CELL_CLASS = "whitespace-nowrap px-3 py-3 align-middle text-sm text-ink";

/** The em dash used wherever a cell has nothing to show yet. */
const EMPTY = t.bonuses.unknown;

/**
 * The spreadsheet view of the tracker (spec §4.3.2): one compact row per tracked offer,
 * ordered by stage then open date. The table is the only thing on the page allowed to
 * scroll sideways, and it does so inside its own container — the page body never does.
 *
 * The offer name in each row is a real button that opens the item drawer, which is where
 * every edit actually happens; the row itself is clickable too, for the mouse. The table
 * stays a table in the accessibility tree — a grid of rows pretending to be buttons is a
 * worse way to read a spreadsheet than the spreadsheet.
 */
export function LedgerTable({ items, bonusesById, today, onSelect }: LedgerTableProps) {
  const [showClosed, setShowClosed] = useState(true);

  const rows = sortForLedger(items).filter((item) => showClosed || item.status !== "closed");

  // P2: the two columns worth adding up, over the rows actually on screen — a total that
  // counted hidden rows would not match the column above it. "Received" counts only what
  // posted (X1), so it is the same money the Earned card reports.
  const bonusTotal = rows.reduce(
    (total, item) => total + (bonusesById[item.bonusId]?.bonus_max ?? 0),
    0,
  );
  const receivedTotal = rows.reduce(
    (total, item) =>
      total + (hasPosted(item) ? receivedAmount(item, bonusesById[item.bonusId]) : 0),
    0,
  );

  return (
    <section aria-labelledby="ledger-table-heading">
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="ledger-table-heading" className="font-heading text-lg font-semibold text-ink">
              {t.tracker.ledger.title}
            </h2>
            <Badge tone="neutral">{t.tracker.ledger.rows(rows.length)}</Badge>
          </div>
          <Toggle
            checked={showClosed}
            onChange={setShowClosed}
            label={t.tracker.ledger.showClosed}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-y border-mint bg-cream">
                {/* The offer name stays put while the rest of the table scrolls
                 * sideways on a narrow screen — a row of dates with no name attached
                 * says nothing. */}
                <th scope="col" className={cn(HEADER_CLASS, "sticky left-0 z-10 bg-cream")}>
                  {t.tracker.fields.offer}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {t.tracker.fields.bonus}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {t.tracker.fields.requirements}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {t.tracker.fields.opened}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {t.tracker.fields.ddBy}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {t.tracker.fields.received}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {t.tracker.fields.closeAfter}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {t.tracker.fields.stage}
                </th>
              </tr>

              {/* The totals sit under the column names rather than at the foot of the
               * table: the question they answer ("what has all this come to?") is the one
               * the reader arrives with, and a long ledger would bury it below the fold. */}
              {rows.length > 0 ? (
                <tr className="border-b border-mint bg-cream font-semibold">
                  <th
                    scope="row"
                    className={cn(
                      CELL_CLASS,
                      "sticky left-0 z-10 bg-cream text-left font-semibold",
                    )}
                  >
                    {t.tracker.ledger.total}
                  </th>
                  <td className={cn(CELL_CLASS, "tabular-nums")}>{money(bonusTotal)}</td>
                  <td className={CELL_CLASS} />
                  <td className={CELL_CLASS} />
                  <td className={CELL_CLASS} />
                  <td className={cn(CELL_CLASS, "tabular-nums")}>{money(receivedTotal)}</td>
                  <td className={CELL_CLASS} />
                  <td className={CELL_CLASS} />
                </tr>
              ) : null}
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted">
                    {t.tracker.ledger.noRows}
                  </td>
                </tr>
              ) : null}

              {rows.map((item) => {
                const bonus = bonusesById[item.bonusId];
                const title = bonus?.title ?? item.bonusId;
                const progress = requirementsProgress(item, bonus);
                const urgent = ddDeadlineIsUrgent(item, bonus, today);
                const ddDeadline = ddDeadlineFor(item, bonus);
                const safeClose = safeCloseFor(item, bonus);
                const daysUntilClose = safeClose
                  ? differenceInCalendarDays(parseISO(safeClose.date), today)
                  : null;
                const posted = hasPosted(item);
                // P3: once the money is in (or the account is shut) the DD deadline is
                // history — it stays on the row as a record, but it stops asking for
                // anything, so it stops looking like the rest of the live dates.
                const deadlinePast = item.status === "received" || item.status === "closed";

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="group cursor-pointer border-b border-mint/60 transition-colors duration-200 ease-out last:border-b-0 hover:bg-mint/40"
                  >
                    <td
                      className={cn(
                        CELL_CLASS,
                        "sticky left-0 z-10 min-w-[230px] whitespace-normal bg-surface transition-colors duration-200 ease-out group-hover:bg-mint/40",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={t.tracker.ledger.rowLabel(title)}
                        // The row behind this button opens the same drawer, so without
                        // this the click runs `onSelect` twice for one press.
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(item.id);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-control text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <BankAvatar name={bonus?.bank ?? item.bonusId} size={28} />
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-semibold text-ink">
                              {bonus?.bank ?? item.bonusId}
                            </span>
                            {item.applicant ? (
                              <span className="shrink-0">
                                <Badge tone="neutral">{item.applicant}</Badge>
                              </span>
                            ) : null}
                          </span>
                          {/* For a missing offer the id is already the name above, so the
                           * second line says what happened instead of repeating it. */}
                          <span className="line-clamp-1 text-xs text-muted">
                            {bonus ? title : t.tracker.ledger.missingOffer}
                          </span>
                        </span>
                      </button>
                    </td>

                    <td className={cn(CELL_CLASS, "tabular-nums")}>
                      {bonus ? money(bonus.bonus_max) : EMPTY}
                    </td>

                    <td className={CELL_CLASS}>
                      {progress.total > 0 ? (
                        <Badge tone={urgent ? "coral" : "neutral"}>
                          {t.tracker.ledger.requirements(progress.done, progress.total)}
                        </Badge>
                      ) : (
                        <span className="text-muted">{EMPTY}</span>
                      )}
                    </td>

                    <td className={CELL_CLASS}>
                      {item.dates.opened ? (
                        dateLabel(item.dates.opened)
                      ) : (
                        <span className="text-muted">{EMPTY}</span>
                      )}
                    </td>

                    <td
                      className={cn(
                        CELL_CLASS,
                        urgent && "text-coral-dark",
                        deadlinePast && "text-muted",
                      )}
                    >
                      {ddDeadline ? (
                        dateLabel(ddDeadline)
                      ) : (
                        <span className="text-muted">{EMPTY}</span>
                      )}
                    </td>

                    <td className={CELL_CLASS}>
                      {posted ? (
                        <div>
                          <p>
                            {item.dates.received ? (
                              dateLabel(item.dates.received)
                            ) : (
                              <span className="text-muted">{EMPTY}</span>
                            )}
                          </p>
                          {bonus ? (
                            <p className="text-xs tabular-nums text-muted">
                              {money(receivedAmount(item, bonus))}
                            </p>
                          ) : null}
                        </div>
                      ) : item.status === "closed" ? (
                        // Closed without the bonus ever arriving: an em dash here would
                        // read as "not yet", which this row will never be. Allowed to
                        // wrap — held on one line it widens the whole column by half
                        // again and pushes the Stage badge off the end of the card.
                        <span className="block max-w-[8rem] whitespace-normal text-muted">
                          {t.tracker.ledger.closedNoBonus}
                        </span>
                      ) : (
                        <span className="text-muted">{EMPTY}</span>
                      )}
                    </td>

                    <td className={CELL_CLASS}>
                      {safeClose ? (
                        <div className="flex items-center gap-1.5">
                          {/* The lock only means something while the money is on the
                           * line — once the account is closed the countdown is history. */}
                          {item.status === "received" ? (
                            <Lock size={13} className="shrink-0 text-muted" aria-hidden="true" />
                          ) : null}
                          <span>{dateLabel(safeClose.date)}</span>
                          {item.status === "received" &&
                          daysUntilClose !== null &&
                          daysUntilClose > 0 ? (
                            <span className="text-xs text-muted">
                              {t.tracker.ledger.daysUntilClose(daysUntilClose)}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted">{EMPTY}</span>
                      )}
                    </td>

                    <td className={CELL_CLASS}>
                      <Badge tone={item.status === "closed" ? "neutral" : "mint"}>
                        {t.tracker.statuses[item.status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

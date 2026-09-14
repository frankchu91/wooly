import { Lock } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { receivedAmount } from "../../engine/conditions";
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
 * Each row is a button in the accessibility tree (click or Enter/Space) that opens the
 * item drawer, which is where every edit actually happens; the table itself is read-only.
 */
export function LedgerTable({ items, bonusesById, today, onSelect }: LedgerTableProps) {
  const [showClosed, setShowClosed] = useState(true);

  const rows = sortForLedger(items).filter((item) => showClosed || item.status !== "closed");

  function handleRowKeyDown(event: ReactKeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Space would otherwise scroll the page out from under the row the user just picked.
    event.preventDefault();
    onSelect(id);
  }

  return (
    <section aria-labelledby="ledger-table-heading">
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h2 id="ledger-table-heading" className="font-heading text-lg font-semibold text-ink">
            {t.tracker.ledger.title}
          </h2>
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
                <th scope="col" className={HEADER_CLASS}>
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
                const isEarned = item.status === "received" || item.status === "closed";

                return (
                  <tr
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={t.tracker.ledger.rowLabel(title)}
                    onClick={() => onSelect(item.id)}
                    onKeyDown={(event) => handleRowKeyDown(event, item.id)}
                    className="cursor-pointer border-b border-mint/60 transition-colors duration-200 ease-out last:border-b-0 hover:bg-mint/40 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <td className={cn(CELL_CLASS, "min-w-[230px] whitespace-normal")}>
                      <div className="flex items-center gap-2.5">
                        <BankAvatar name={bonus?.bank ?? item.bonusId} size={28} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {bonus?.bank ?? item.bonusId}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted">{title}</p>
                        </div>
                      </div>
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

                    <td className={cn(CELL_CLASS, urgent && "text-coral-dark")}>
                      {ddDeadline ? (
                        dateLabel(ddDeadline)
                      ) : (
                        <span className="text-muted">{EMPTY}</span>
                      )}
                    </td>

                    <td className={CELL_CLASS}>
                      {item.dates.received || (isEarned && bonus) ? (
                        <div>
                          <p>
                            {item.dates.received ? (
                              dateLabel(item.dates.received)
                            ) : (
                              <span className="text-muted">{EMPTY}</span>
                            )}
                          </p>
                          {isEarned && bonus ? (
                            <p className="text-xs tabular-nums text-muted">
                              {money(receivedAmount(item, bonus))}
                            </p>
                          ) : null}
                        </div>
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

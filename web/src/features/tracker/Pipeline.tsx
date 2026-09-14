import { receivedAmount } from "../../engine/conditions";
import { STATUS_ORDER } from "../../engine/types";
import type { Bonus, TrackedItem, TrackStatus } from "../../engine/types";
import { t } from "../../i18n/en";
import { Badge, money } from "../../ui";
import { PipelineCard } from "./PipelineCard";

export interface PipelineProps {
  items: TrackedItem[];
  bonusesById: Record<string, Bonus>;
  today: Date;
  onSelect: (id: string) => void;
  /** Called after a card's menu removes an item, so the page can drop a `?item=` that
   * now points at nothing. */
  onUntrack?: (id: string) => void;
}

const columnHeadingId = (stage: TrackStatus) => `pipeline-column-${stage}`;

// A received or closed bonus paid what it paid, so its column sums the real amount; the
// earlier stages have nothing to show but the headline they're chasing.
const isEarned = (status: TrackStatus) => status === "received" || status === "closed";

/**
 * The kanban view of the tracker (spec §4.3.3): the five stages side by side, so the
 * whole pipeline is visible at once.
 *
 * From `xl` up it is a five-column grid, so a desktop reader sees every stage without
 * scrolling — the point of a pipeline is the shape of the whole thing. Below that the
 * columns keep their comfortable width and the row scrolls sideways inside its own
 * container, which never makes the page itself scroll horizontally.
 */
export function Pipeline({ items, bonusesById, today, onSelect, onUntrack }: PipelineProps) {
  return (
    <section aria-labelledby="pipeline-heading">
      <h2 id="pipeline-heading" className="mb-3 font-heading text-lg font-semibold text-ink">
        {t.tracker.pipeline.title}
      </h2>

      <ol className="flex gap-4 overflow-x-auto snap-x pb-2 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {STATUS_ORDER.map((stage) => {
          const columnItems = items.filter((item) => item.status === stage);
          const sum = columnItems.reduce((total, item) => {
            const bonus = bonusesById[item.bonusId];
            return (
              total + (isEarned(stage) ? receivedAmount(item, bonus) : (bonus?.bonus_max ?? 0))
            );
          }, 0);

          return (
            <li
              key={stage}
              aria-labelledby={columnHeadingId(stage)}
              className="snap-start min-w-[260px] flex-1 md:min-w-[280px] xl:min-w-0"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3
                  id={columnHeadingId(stage)}
                  className="font-heading text-sm font-semibold text-ink"
                >
                  {t.tracker.statuses[stage]}
                </h3>
                <Badge tone="neutral">{columnItems.length}</Badge>
                {/* Kept beside its own heading rather than pushed to the column's right
                 * edge, where it would sit against the *next* column's title and read as
                 * if it belonged to that one. */}
                <span className="text-sm tabular-nums text-muted">{money(sum)}</span>
              </div>

              {columnItems.length === 0 ? (
                <p className="rounded-card border border-dashed border-mint px-3 py-6 text-center text-xs text-muted">
                  {t.tracker.pipeline.empty[stage]}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {columnItems.map((item) => (
                    <PipelineCard
                      key={item.id}
                      item={item}
                      bonus={bonusesById[item.bonusId]}
                      today={today}
                      onSelect={onSelect}
                      onUntrack={onUntrack}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

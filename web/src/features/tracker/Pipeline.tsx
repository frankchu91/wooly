import {
  DndContext,
  closestCorners,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useState } from "react";
import type { ReactNode } from "react";

import { earliestCloseDate, hasPosted, receivedAmount } from "../../engine/conditions";
import { STATUS_ORDER } from "../../engine/types";
import type { Bonus, TrackedItem, TrackStatus } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Badge, BankAvatar, Card, MoneyText, cn, money, toast } from "../../ui";
import { PipelineCard } from "./PipelineCard";
import { toISO } from "./trackerModel";

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

// A bonus that posted paid what it paid, so those columns sum the real amount; the
// earlier stages have nothing to show but the headline they're chasing. A closed account
// that never paid adds nothing to its column's sum, though it still sits in the column and
// counts towards its tally — it is a real account, just not a real payout (X1).
const isEarnedStage = (status: TrackStatus) => status === "received" || status === "closed";

const asStage = (value: unknown): TrackStatus | null =>
  STATUS_ORDER.find((stage) => stage === value) ?? null;

/** Everything `handlePipelineDrop` needs from the outside world, so the decision itself
 * stays a pure function a test can call without a DOM or a drag. */
export interface PipelineDropDeps {
  items: TrackedItem[];
  bonusesById: Record<string, Bonus>;
  /** Today as `YYYY-MM-DD` — the date the move is recorded against. */
  todayISO: string;
  setStatus: (id: string, status: TrackStatus, dateISO: string) => void;
  /** Asks the card to confirm rather than applying the move: closing an account before
   * its hold window is up can claw the bonus back. */
  onConfirmEarlyClose: (id: string) => void;
  notify: (message: string) => void;
}

/**
 * What a drop means. Dropping a card back on its own column, or anywhere that isn't a
 * column, is a no-op; a drop onto Closed inside the hold window opens the same warning
 * the "Move to…" menu does; anything else moves the item and says so.
 */
export function handlePipelineDrop(event: DragEndEvent, deps: PipelineDropDeps): void {
  const { active, over } = event;
  if (!over) return;

  const stage = asStage(over.id);
  if (!stage) return;

  const item = deps.items.find((candidate) => candidate.id === active.id);
  if (!item || item.status === stage) return;

  // Only a card that records an open date can have a hold window to be inside of; one
  // without a date has nothing to warn about and moves straight away.
  const opened = item.dates.opened;
  const bonus = deps.bonusesById[item.bonusId];
  if (
    stage === "closed" &&
    opened !== undefined &&
    bonus !== undefined &&
    deps.todayISO < earliestCloseDate(bonus, opened)
  ) {
    deps.onConfirmEarlyClose(item.id);
    return;
  }

  deps.setStatus(item.id, stage, deps.todayISO);
  deps.notify(t.tracker.pipeline.moved(t.tracker.statuses[stage]));
}

interface PipelineColumnProps {
  stage: TrackStatus;
  count: number;
  sum: number;
  children: ReactNode;
}

/** One stage's column, and the drop target for it. Stays an `<li>` — the row of stages is
 * an ordered list, and dnd-kit only ever needs the node, not a wrapper of its own. */
function PipelineColumn({ stage, count, sum, children }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <li
      ref={setNodeRef}
      aria-labelledby={columnHeadingId(stage)}
      className={cn(
        "snap-start min-w-[260px] flex-1 rounded-card transition-colors duration-200 ease-out md:min-w-[280px] xl:min-w-0",
        // `ring-inset` so the highlight costs the column no width — the five stages are
        // already tight at 1280 and a padded drop zone would wrap every heading.
        isOver && "bg-mint/30 ring-2 ring-inset ring-primary/40",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id={columnHeadingId(stage)} className="font-heading text-sm font-semibold text-ink">
          {t.tracker.statuses[stage]}
        </h3>
        <Badge tone="neutral">{count}</Badge>
        {/* Kept beside its own heading rather than pushed to the column's right
         * edge, where it would sit against the *next* column's title and read as
         * if it belonged to that one. */}
        <span className="text-sm tabular-nums text-muted">{money(sum)}</span>
      </div>
      {children}
    </li>
  );
}

/**
 * The kanban view of the tracker (spec §4.3.3): the five stages side by side, so the
 * whole pipeline is visible at once.
 *
 * From `xl` up it is a five-column grid, so a desktop reader sees every stage without
 * scrolling — the point of a pipeline is the shape of the whole thing. Below that the
 * columns keep their comfortable width and the row scrolls sideways inside its own
 * container, which never makes the page itself scroll horizontally.
 *
 * Cards move between stages by dragging their grip handle, which works from the keyboard
 * too (focus the handle, Space, arrows, Space).
 */
export function Pipeline({ items, bonusesById, today, onSelect, onUntrack }: PipelineProps) {
  const setStatus = useStore((state) => state.setStatus);
  const [activeId, setActiveId] = useState<string | null>(null);
  // `token` rather than a plain id: dropping the same card on Closed twice in a row must
  // reopen the warning, and an unchanged id would tell the card nothing had happened.
  const [confirmClose, setConfirmClose] = useState<{
    id: string;
    dateISO: string;
    token: number;
  } | null>(null);

  const sensors = useSensors(
    // 6px of travel before a drag starts, so a press that was meant as a click on the
    // card behind the handle still reads as one.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const activeItem = activeId ? (items.find((item) => item.id === activeId) ?? null) : null;
  const activeBonus = activeItem ? bonusesById[activeItem.bonusId] : undefined;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const todayISO = toISO(today);
    handlePipelineDrop(event, {
      items,
      bonusesById,
      todayISO,
      setStatus,
      onConfirmEarlyClose: (id) =>
        setConfirmClose((previous) => ({
          id,
          dateISO: todayISO,
          token: (previous?.token ?? 0) + 1,
        })),
      notify: toast,
    });
  }

  return (
    <section aria-labelledby="pipeline-heading">
      <h2 id="pipeline-heading" className="mb-3 font-heading text-lg font-semibold text-ink">
        {t.tracker.pipeline.title}
      </h2>

      <DndContext
        sensors={sensors}
        // Kanban columns, not a sortable list: whichever stage is nearest wins, so a drop
        // that lands just past the bottom of a short column still means that column.
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <ol className="flex gap-4 overflow-x-auto snap-x pb-2 xl:grid xl:grid-cols-5 xl:overflow-visible">
          {STATUS_ORDER.map((stage) => {
            const columnItems = items.filter((item) => item.status === stage);
            const sum = columnItems.reduce((total, item) => {
              const bonus = bonusesById[item.bonusId];
              if (isEarnedStage(stage)) {
                return total + (hasPosted(item) ? receivedAmount(item, bonus) : 0);
              }
              return total + (bonus?.bonus_max ?? 0);
            }, 0);

            return (
              <PipelineColumn key={stage} stage={stage} count={columnItems.length} sum={sum}>
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
                        requestMove={
                          confirmClose?.id === item.id
                            ? {
                                stage: "closed",
                                dateISO: confirmClose.dateISO,
                                token: confirmClose.token,
                              }
                            : null
                        }
                      />
                    ))}
                  </ul>
                )}
              </PipelineColumn>
            );
          })}
        </ol>

        <DragOverlay>
          {activeItem ? (
            <Card className="flex items-center gap-2.5 p-3 shadow-card">
              <BankAvatar name={activeBonus?.bank ?? activeItem.bonusId} size={24} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 font-heading text-sm font-semibold text-ink">
                  {activeBonus?.title ?? activeItem.bonusId}
                </span>
                {activeBonus ? <MoneyText value={activeBonus.bonus_max} size="sm" /> : null}
              </span>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

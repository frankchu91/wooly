import type { DragEndEvent } from "@dnd-kit/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { fixture } from "../../data/fixture";
import { earliestCloseDate } from "../../engine/conditions";
import type { Bonus, TrackedItem, TrackStatus } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { dateLabel } from "../../ui";
import { PipelineCard } from "./PipelineCard";
import { Pipeline, handlePipelineDrop } from "./Pipeline";
import type { PipelineDropDeps } from "./Pipeline";

const bonusesById = Object.fromEntries(fixture.map((bonus) => [bonus.id, bonus])) as Record<
  string,
  Bonus
>;
const initialState = useStore.getState();
const today = new Date(2026, 8, 14);
const TODAY_ISO = "2026-09-14";

function trackedItem(overrides: Partial<TrackedItem> & { bonusId: string }): TrackedItem {
  return {
    id: overrides.bonusId,
    status: "planned",
    dates: {},
    openMonth: "2026-09",
    conditionsDone: [],
    ...overrides,
  };
}

/** A `DragEndEvent` with only the two fields `handlePipelineDrop` reads. */
function dropEvent(activeId: string, overId: TrackStatus | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

/** `handlePipelineDrop`'s three outputs as spies, so each test can say which of them a
 * drop was supposed to reach. */
function deps(items: TrackedItem[]) {
  const setStatus = vi.fn<PipelineDropDeps["setStatus"]>();
  const onConfirmEarlyClose = vi.fn<PipelineDropDeps["onConfirmEarlyClose"]>();
  const notify = vi.fn<PipelineDropDeps["notify"]>();
  return { items, bonusesById, todayISO: TODAY_ISO, setStatus, onConfirmEarlyClose, notify };
}

beforeEach(() => {
  useStore.setState(initialState, true);
});

describe("handlePipelineDrop", () => {
  test("dropping a card on another column records the move against today", () => {
    const d = deps([trackedItem({ bonusId: "wells-fargo-500", status: "opened" })]);

    handlePipelineDrop(dropEvent("wells-fargo-500", "received"), d);

    expect(d.setStatus).toHaveBeenCalledWith("wells-fargo-500", "received", TODAY_ISO);
    expect(d.notify).toHaveBeenCalledWith(t.tracker.pipeline.moved(t.tracker.statuses.received));
    expect(d.onConfirmEarlyClose).not.toHaveBeenCalled();
  });

  test("dropping a card back on its own column does nothing", () => {
    const d = deps([trackedItem({ bonusId: "wells-fargo-500", status: "opened" })]);

    handlePipelineDrop(dropEvent("wells-fargo-500", "opened"), d);

    expect(d.setStatus).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
  });

  test("a drop outside every column does nothing", () => {
    const d = deps([trackedItem({ bonusId: "wells-fargo-500", status: "opened" })]);

    handlePipelineDrop(dropEvent("wells-fargo-500", null), d);

    expect(d.setStatus).not.toHaveBeenCalled();
  });

  test("closing inside the hold window asks for confirmation instead of moving", () => {
    // wells-fargo-500 carries `hold_days: 180`, so an account opened ten days ago is
    // nowhere near safe to close.
    const d = deps([
      trackedItem({
        bonusId: "wells-fargo-500",
        status: "opened",
        dates: { opened: "2026-09-04" },
      }),
    ]);

    handlePipelineDrop(dropEvent("wells-fargo-500", "closed"), d);

    expect(d.onConfirmEarlyClose).toHaveBeenCalledWith("wells-fargo-500");
    expect(d.setStatus).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
  });

  test("closing once the hold window is up moves straight away", () => {
    const d = deps([
      trackedItem({
        bonusId: "wells-fargo-500",
        status: "received",
        dates: { opened: "2025-01-01", received: "2025-03-01" },
      }),
    ]);

    handlePipelineDrop(dropEvent("wells-fargo-500", "closed"), d);

    expect(d.setStatus).toHaveBeenCalledWith("wells-fargo-500", "closed", TODAY_ISO);
  });

  test("a card with no open date has no hold window to warn about", () => {
    const d = deps([trackedItem({ bonusId: "wells-fargo-500", status: "planned" })]);

    handlePipelineDrop(dropEvent("wells-fargo-500", "closed"), d);

    expect(d.onConfirmEarlyClose).not.toHaveBeenCalled();
    expect(d.setStatus).toHaveBeenCalledWith("wells-fargo-500", "closed", TODAY_ISO);
  });
});

describe("Pipeline drag surface", () => {
  function renderPipeline() {
    return render(
      <Pipeline
        items={[
          trackedItem({
            bonusId: "wells-fargo-500",
            status: "opened",
            dates: { opened: "2026-09-04" },
          }),
          trackedItem({ bonusId: "chase-400", status: "planned" }),
        ]}
        bonusesById={bonusesById}
        today={today}
        onSelect={vi.fn()}
      />,
    );
  }

  test("every card carries a labelled drag handle", () => {
    renderPipeline();

    expect(screen.getAllByRole("button", { name: t.tracker.pipeline.dragHandle })).toHaveLength(2);
  });

  test("the columns stay an ordered list of stages", () => {
    const { container } = renderPipeline();

    const columns = container.querySelectorAll("ol > li");
    expect(columns).toHaveLength(5);
    expect(within(columns[1] as HTMLElement).getByRole("heading", { level: 3 })).toHaveTextContent(
      t.tracker.statuses.opened,
    );
  });

  /** The card used to drag only from its grip, which is a drag most people never find:
   * they grab the card, nothing moves, and the feature may as well not exist. Pressing
   * anywhere on the card that isn't one of its controls has to pick it up. */
  test("pressing the card body and moving picks the card up", () => {
    const { container } = renderPipeline();
    const card = within(container.querySelectorAll("ol > li")[1] as HTMLElement).getByRole(
      "listitem",
    );

    fireEvent.mouseDown(card, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 0, clientY: 24 });

    expect(card.className).toContain("opacity-40");

    fireEvent.mouseUp(document);
  });

  /** …and the controls on the card are still controls: a press that lands on one of them
   * must reach it instead of starting a drag. */
  test("the menu, the Next button and the date form never start a drag", () => {
    const { container } = renderPipeline();
    const card = within(container.querySelectorAll("ol > li")[1] as HTMLElement).getByRole(
      "listitem",
    );
    const menuTrigger = within(card).getByRole("button", { name: t.plan.moreActions });

    fireEvent.mouseDown(menuTrigger, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 0, clientY: 24 });

    expect(card.className).not.toContain("opacity-40");

    fireEvent.mouseUp(document);
    expect(
      within(card).getByRole("button", { name: t.tracker.next }).closest("[data-no-drag]"),
    ).not.toBeNull();
  });
});

describe("PipelineCard — a move the pipeline asked it to confirm", () => {
  const item = trackedItem({
    bonusId: "wells-fargo-500",
    status: "opened",
    dates: { opened: "2026-09-04" },
  });

  test("opens the close-early warning rather than moving on its own", () => {
    const { rerender } = render(
      <ul>
        <PipelineCard
          item={item}
          bonus={bonusesById["wells-fargo-500"]}
          today={today}
          onSelect={vi.fn()}
          requestMove={null}
        />
      </ul>,
    );

    expect(screen.queryByText(/may forfeit the bonus/)).not.toBeInTheDocument();

    rerender(
      <ul>
        <PipelineCard
          item={item}
          bonus={bonusesById["wells-fargo-500"]}
          today={today}
          onSelect={vi.fn()}
          requestMove={{ stage: "closed", dateISO: "2026-09-14", token: 1 }}
        />
      </ul>,
    );

    expect(
      screen.getByText(
        t.tracker.closeEarly(
          dateLabel(earliestCloseDate(bonusesById["wells-fargo-500"], "2026-09-04")),
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.tracker.closeAnyway })).toBeInTheDocument();
    // Nothing has moved: the store still has the card where it was.
    expect(useStore.getState().tracker).toEqual([]);
  });
});

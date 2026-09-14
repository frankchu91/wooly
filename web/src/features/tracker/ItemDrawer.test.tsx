import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fixture } from "../../data/fixture";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { dateLabel } from "../../ui";
import { ItemDrawer } from "./ItemDrawer";

const initialState = useStore.getState();
const today = new Date(2026, 8, 14);
const bonusById = (id: string): Bonus => fixture.find((b) => b.id === id) as Bonus;

function trackedItem(overrides: Partial<TrackedItem> = {}): TrackedItem {
  return {
    id: "wells-fargo-500",
    bonusId: "wells-fargo-500",
    status: "opened",
    dates: { opened: "2026-09-04" },
    openMonth: "2026-09",
    conditionsDone: [],
    ...overrides,
  };
}

/** Renders the drawer against whatever the store currently holds for `item.id`, so a
 * store action taken in a test is reflected on the next render — the real page passes
 * the live item down the same way. */
function renderDrawer(seed: TrackedItem, bonusId = seed.bonusId) {
  useStore.setState({ tracker: [seed] });
  const onClose = vi.fn();

  function Harness() {
    const item = useStore((state) => state.tracker.find((i) => i.id === seed.id) ?? null);
    return (
      <ItemDrawer
        item={item}
        bonus={fixture.find((b) => b.id === bonusId)}
        open={item != null}
        onClose={onClose}
        today={today}
      />
    );
  }

  return { onClose, ...render(<Harness />) };
}

const storedItem = (id = "wells-fargo-500") => useStore.getState().tracker.find((i) => i.id === id);

beforeEach(() => {
  useStore.setState(initialState, true);
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(today);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ItemDrawer — conditions", () => {
  test("ticking a condition records it on the tracked item", async () => {
    const user = userEvent.setup({ delay: null });
    renderDrawer(trackedItem());

    await user.click(
      screen.getByLabelText(/Receive \$1,000 or more in qualifying direct deposits/),
    );

    expect(storedItem()?.conditionsDone).toEqual(["wf-dd"]);

    await user.click(
      screen.getByLabelText(/Receive \$1,000 or more in qualifying direct deposits/),
    );
    expect(storedItem()?.conditionsDone).toEqual([]);
  });

  test("ticked conditions come back checked", () => {
    renderDrawer(trackedItem({ conditionsDone: ["wf-dd"] }));

    const checkbox = screen.getByLabelText(/Receive \$1,000 or more in qualifying direct deposits/);
    expect(checkbox).toBeChecked();
  });

  test("finishing every condition on an opened item offers to mark requirements done", async () => {
    const user = userEvent.setup({ delay: null });
    renderDrawer(trackedItem({ conditionsDone: ["wf-dd", "wf-new-customer"] }));

    expect(
      screen.queryByRole("button", { name: t.tracker.markRequirementsDone }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/Keep the account open for at least 180 days/));
    await user.click(screen.getByRole("button", { name: t.tracker.markRequirementsDone }));

    expect(storedItem()?.status).toBe("requirements_met");
    expect(storedItem()?.dates.requirements_met).toBe("2026-09-14");
  });

  test("a non-actionable condition is a note, not a checkbox", () => {
    renderDrawer(trackedItem());

    // "Offer is for new consumer checking customers only." is a fact about the offer.
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText(t.conditions.alsoNote(1))).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /new consumer checking customers/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/new consumer checking customers/)).toBeInTheDocument();
  });

  test("the button is not offered for an item that has already moved on", () => {
    renderDrawer(
      trackedItem({
        status: "received",
        conditionsDone: ["wf-dd", "wf-new-customer", "wf-keep-open"],
      }),
    );

    expect(
      screen.queryByRole("button", { name: t.tracker.markRequirementsDone }),
    ).not.toBeInTheDocument();
  });
});

describe("ItemDrawer — dates", () => {
  test("shows one input per stage reached, and the planned month read-only", () => {
    renderDrawer(
      trackedItem({
        status: "received",
        dates: { opened: "2026-09-04", requirements_met: "2026-09-10", received: "2026-09-12" },
      }),
    );

    const dates = screen.getByRole("heading", { name: t.tracker.dates }).closest("section");
    expect(dates).not.toBeNull();
    expect(within(dates as HTMLElement).getByText("Sep 2026")).toBeInTheDocument();
    // The planned month is a fact from the plan, not an editable date.
    expect(within(dates as HTMLElement).queryByLabelText(t.tracker.plannedMonth)).toBeNull();

    expect(screen.getByLabelText(t.tracker.statuses.opened)).toHaveValue("2026-09-04");
    expect(screen.getByLabelText(t.tracker.statuses.requirements_met)).toHaveValue("2026-09-10");
    expect(screen.getByLabelText(t.tracker.statuses.received)).toHaveValue("2026-09-12");
    // Nothing for a stage the item hasn't reached.
    expect(screen.queryByLabelText(t.tracker.statuses.closed)).not.toBeInTheDocument();
  });

  test("correcting an earlier stage's date leaves the item where it is", () => {
    renderDrawer(
      trackedItem({ status: "received", dates: { opened: "2026-09-04", received: "2026-09-12" } }),
    );

    fireEvent.change(screen.getByLabelText(t.tracker.statuses.opened), {
      target: { value: "2026-09-02" },
    });

    expect(storedItem()?.dates.opened).toBe("2026-09-02");
    expect(storedItem()?.status).toBe("received");
    expect(storedItem()?.dates.received).toBe("2026-09-12");
  });

  test("editing the current stage's date goes through setStatus", () => {
    renderDrawer(trackedItem({ status: "opened", dates: { opened: "2026-09-04" } }));

    fireEvent.change(screen.getByLabelText(t.tracker.statuses.opened), {
      target: { value: "2026-09-06" },
    });

    expect(storedItem()?.status).toBe("opened");
    expect(storedItem()?.dates.opened).toBe("2026-09-06");
  });
});

describe("ItemDrawer — bonus received", () => {
  test("blurring the amount records it; clearing it removes the override", async () => {
    const user = userEvent.setup({ delay: null });
    renderDrawer(trackedItem({ status: "received", dates: { received: "2026-09-12" } }));

    const input = screen.getByLabelText(t.tracker.amount);
    // The headline amount is offered as a placeholder, not written unasked.
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute("placeholder", "500");

    await user.type(input, "475");
    await user.tab();
    expect(storedItem()?.bonusReceived).toBe(475);

    // Saving reseeds the field from the store, so it has to be looked up again.
    const reseeded = screen.getByLabelText(t.tracker.amount);
    expect(reseeded).toHaveValue(475);

    await user.clear(reseeded);
    await user.tab();
    expect("bonusReceived" in (storedItem() as object)).toBe(false);
  });
});

describe("ItemDrawer — earliest safe close", () => {
  test("shows the date and the rule behind it", () => {
    renderDrawer(trackedItem());

    expect(screen.getByText(t.tracker.safeClose.line(dateLabel("2027-03-03")))).toBeInTheDocument();
    expect(screen.getByText(t.tracker.safeClose.reason.keepOpen(180))).toBeInTheDocument();
  });

  test("asks for an open date when there isn't one", () => {
    renderDrawer(trackedItem({ status: "planned", dates: {} }));

    expect(screen.getByText(t.tracker.safeClose.needsOpened)).toBeInTheDocument();
  });
});

describe("ItemDrawer — notes", () => {
  test("autosaves on blur, not on every keystroke", async () => {
    const user = userEvent.setup({ delay: null });
    renderDrawer(trackedItem());

    const notes = screen.getByLabelText(t.tracker.notes);
    await user.type(notes, "Rep said it posts on the 3rd");
    expect(storedItem()?.notes).toBeUndefined();

    await user.tab();
    expect(storedItem()?.notes).toBe("Rep said it posts on the 3rd");
  });

  test("existing notes are shown when the drawer opens", () => {
    renderDrawer(trackedItem({ notes: "Called support" }));
    expect(screen.getByLabelText(t.tracker.notes)).toHaveValue("Called support");
  });
});

describe("ItemDrawer — links and removal", () => {
  test("links to Doctor of Credit, and to the bank page when its terms were readable", () => {
    renderDrawer(trackedItem());

    expect(screen.getByRole("link", { name: t.bonuses.openDoc })).toHaveAttribute(
      "href",
      bonusById("wells-fargo-500").doc_url,
    );
    expect(screen.getByRole("link", { name: t.bonuses.terms.bankPage })).toHaveAttribute(
      "href",
      "https://example.test/wf-offer",
    );
  });

  test("no bank-page link when the offer page was never read", () => {
    renderDrawer(trackedItem({ id: "chase-400", bonusId: "chase-400" }), "chase-400");

    expect(screen.queryByRole("link", { name: t.bonuses.terms.bankPage })).not.toBeInTheDocument();
  });

  test("Remove untracks the item and closes the drawer", async () => {
    const user = userEvent.setup({ delay: null });
    const { onClose } = renderDrawer(trackedItem());

    await user.click(screen.getByRole("button", { name: t.tracker.untrack }));

    expect(useStore.getState().tracker).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });
});

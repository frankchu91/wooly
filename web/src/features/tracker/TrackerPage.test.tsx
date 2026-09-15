import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { earliestCloseDate } from "../../engine/conditions";
import type { Bonus, TrackedItem } from "../../engine/types";
import { defaultProfile, STATUS_ORDER } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { dateLabel, money } from "../../ui";
import { TrackerPage } from "./TrackerPage";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();
// Matches how `parseISO` reads date-only strings (local midnight) rather than
// `new Date("2026-09-14")`'s UTC midnight — keeps date maths stable across timezones.
const today = new Date(2026, 8, 14);

const bonusById = (id: string): Bonus => fixture.find((b) => b.id === id) as Bonus;

/** Exposes the router's query string, so a test can assert that `?item=` was dropped. */
function SearchProbe() {
  return <span data-testid="search">{useLocation().search}</span>;
}

function renderTrackerPage(entry = "/tracker") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DataContext.Provider value={dataset}>
        <Routes>
          <Route
            path="/tracker"
            element={
              <>
                <TrackerPage />
                <SearchProbe />
              </>
            }
          />
          <Route path="/plan" element={<div>plan placeholder</div>} />
          <Route path="/start" element={<div>start placeholder</div>} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  );
}

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

/** One item in every stage, so a single `useStore.setState` covers the whole page. */
function seedAllStages() {
  useStore.setState({
    tracker: [
      trackedItem({ bonusId: "bmo-400", status: "planned", openMonth: "2026-10" }),
      trackedItem({
        bonusId: "wells-fargo-500",
        status: "opened",
        dates: { opened: "2026-09-04" },
      }),
      trackedItem({
        bonusId: "chase-400",
        status: "requirements_met",
        dates: { opened: "2026-08-01", requirements_met: "2026-09-01" },
      }),
      trackedItem({
        bonusId: "us-bank-450",
        status: "received",
        dates: { opened: "2026-07-01", received: "2026-09-10" },
        bonusReceived: 475,
      }),
      trackedItem({
        bonusId: "eastern-750",
        status: "closed",
        // Closed *after* the bonus posted — the ordinary end of a tracked offer, and the
        // only kind of closed row that counts as earned (X1).
        dates: { opened: "2026-01-05", received: "2026-07-20", closed: "2026-08-01" },
      }),
    ],
  });
}

/** The pipeline column for one stage, found by its heading. */
function column(stage: keyof typeof t.tracker.statuses): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name: t.tracker.statuses[stage] });
  return heading.closest("li") as HTMLElement;
}

beforeEach(() => {
  useStore.setState(initialState, true);
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(today);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TrackerPage — ledger totals", () => {
  test("sums earned, pending and planned with a count of accounts each", () => {
    seedAllStages();
    renderTrackerPage();

    const totals = screen.getByRole("region", { name: t.tracker.ledger.totals });

    // Earned prefers the amount the user actually recorded (475) over us-bank's
    // headline 450, then adds closed eastern-750's 750.
    expect(within(totals).getByText(money(1225))).toBeInTheDocument();
    expect(within(totals).getByText(money(900))).toBeInTheDocument(); // 500 + 400 in flight
    expect(within(totals).getByText(money(400))).toBeInTheDocument(); // bmo-400 planned

    expect(within(totals).getAllByText(t.tracker.ledger.accounts(2))).toHaveLength(2);
    expect(within(totals).getByText(t.tracker.ledger.accounts(1))).toBeInTheDocument();
  });

  // X1, the owner's question. Both of these sit in the Closed column; only one of them is
  // money the user actually has.
  test("a closed account that never paid is not earned, in the totals or the columns", () => {
    useStore.setState({
      tracker: [
        trackedItem({
          bonusId: "eastern-750",
          status: "closed",
          dates: { opened: "2026-01-05", closed: "2026-02-01" },
        }),
        trackedItem({
          bonusId: "us-bank-450",
          status: "closed",
          dates: { opened: "2026-01-05", received: "2026-03-01", closed: "2026-08-01" },
        }),
      ],
    });
    renderTrackerPage();

    const totals = screen.getByRole("region", { name: t.tracker.ledger.totals });
    expect(within(totals).getByText(money(450))).toBeInTheDocument(); // not 1200
    expect(within(totals).getByText(t.tracker.ledger.accounts(1))).toBeInTheDocument();

    // Both rows are still in the Closed column; its sum (the figure beside the count in
    // the column heading, not the amount on a card) is only the one that paid.
    const closed = column("closed");
    expect(within(closed).getByText("2")).toBeInTheDocument();
    expect(
      within(closed)
        .getAllByText(money(450))
        .some((el) => el.classList.contains("text-muted")),
    ).toBe(true);
  });
});

describe("TrackerPage — pipeline", () => {
  test("every column is labelled by its own heading", () => {
    seedAllStages();
    renderTrackerPage();

    for (const stage of STATUS_ORDER) {
      const heading = screen.getByRole("heading", { level: 3, name: t.tracker.statuses[stage] });
      expect(column(stage)).toHaveAttribute("aria-labelledby", heading.id);
      expect(heading.id).not.toBe("");
    }
  });

  test("renders all five columns with their counts, even the empty ones", () => {
    useStore.setState({
      tracker: [
        trackedItem({ bonusId: "bmo-400", status: "planned" }),
        trackedItem({ bonusId: "sofi-675", status: "planned" }),
        trackedItem({ bonusId: "wells-fargo-500", status: "opened" }),
      ],
    });
    renderTrackerPage();

    expect(within(column("planned")).getByText("2")).toBeInTheDocument();
    expect(within(column("opened")).getByText("1")).toBeInTheDocument();

    for (const stage of ["requirements_met", "received", "closed"] as const) {
      expect(within(column(stage)).getByText("0")).toBeInTheDocument();
      expect(within(column(stage)).getByText(t.tracker.pipeline.empty[stage])).toBeInTheDocument();
    }

    // Column sums: planned holds bmo-400 + sofi-675.
    expect(within(column("planned")).getByText(money(1075))).toBeInTheDocument();
  });

  test("“Move to… → Bonus received” records the date the user picks", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("opened")).getByRole("listitem");
    await user.click(within(card).getByRole("button", { name: t.plan.moreActions }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.menu.moveTo }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.statuses.received }));

    fireEvent.change(within(card).getByLabelText(t.tracker.dateFor(t.tracker.statuses.received)), {
      target: { value: "2026-09-12" },
    });
    await user.click(within(card).getByRole("button", { name: t.common.save }));

    const item = useStore.getState().tracker.find((i) => i.id === "wells-fargo-500");
    expect(item?.status).toBe("received");
    expect(item?.dates.received).toBe("2026-09-12");
  });

  test("“Next” advances to the following stage", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("planned")).getByRole("listitem");
    await user.click(within(card).getByRole("button", { name: t.tracker.next }));

    fireEvent.change(within(card).getByLabelText(t.tracker.dateFor(t.tracker.statuses.opened)), {
      target: { value: "2026-09-14" },
    });
    await user.click(within(card).getByRole("button", { name: t.common.save }));

    const item = useStore.getState().tracker.find((i) => i.id === "bmo-400");
    expect(item?.status).toBe("opened");
    expect(item?.dates.opened).toBe("2026-09-14");
  });

  test("closing before the hold window is up warns first", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("opened")).getByRole("listitem");
    await user.click(within(card).getByRole("button", { name: t.plan.moreActions }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.menu.moveTo }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.statuses.closed }));

    // wells-fargo-500 holds for 180 days and was opened 10 days ago.
    const safeClose = earliestCloseDate(bonusById("wells-fargo-500"), "2026-09-04");
    expect(within(card).getByText(t.tracker.closeEarly(dateLabel(safeClose)))).toBeInTheDocument();

    // The save button stops pretending this is routine…
    expect(within(card).queryByRole("button", { name: t.common.save })).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: t.tracker.closeAnyway }));

    // …but it still goes through — the warning informs, it doesn't block.
    expect(useStore.getState().tracker.find((i) => i.id === "wells-fargo-500")?.status).toBe(
      "closed",
    );
  });

  test("no close-early warning once the hold window has passed", async () => {
    const user = userEvent.setup({ delay: null });
    useStore.setState({
      tracker: [
        trackedItem({
          bonusId: "wells-fargo-500",
          status: "received",
          dates: { opened: "2025-01-05", received: "2025-03-01" },
        }),
      ],
    });
    renderTrackerPage();

    const card = within(column("received")).getByRole("listitem");
    await user.click(within(card).getByRole("button", { name: t.plan.moreActions }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.menu.moveTo }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.statuses.closed }));

    expect(within(card).queryByText(/may forfeit the bonus/)).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: t.common.save })).toBeInTheDocument();
  });

  // X12: the date-confirm form has padding and a warning line that are part of no control;
  // a click there used to fall through to the card and open the drawer over the form.
  test("clicking inside the date-confirm form doesn't open the drawer over it", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("opened")).getByRole("listitem");
    await user.click(within(card).getByRole("button", { name: t.plan.moreActions }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.menu.moveTo }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.statuses.closed }));

    const safeClose = earliestCloseDate(bonusById("wells-fargo-500"), "2026-09-04");
    await user.click(within(card).getByText(t.tracker.closeEarly(dateLabel(safeClose))));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      within(card).getByLabelText(t.tracker.dateFor(t.tracker.statuses.closed)),
    ).toBeInTheDocument();
  });

  test("the kebab menu closes on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("planned")).getByRole("listitem");
    const trigger = within(card).getByRole("button", { name: t.plan.moreActions });
    await user.click(trigger);
    expect(within(card).getByRole("menuitem", { name: t.tracker.menu.details })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(within(card).getByRole("menuitem", { name: t.tracker.menu.moveTo })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(within(card).queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  // P1: the household column from the owner's spreadsheet.
  test("an applicant shows as a badge on the pipeline card", () => {
    useStore.setState({
      tracker: [
        trackedItem({
          bonusId: "wells-fargo-500",
          status: "opened",
          dates: { opened: "2026-09-04" },
          applicant: "partner",
        }),
      ],
    });
    renderTrackerPage();

    expect(within(column("opened")).getByText("partner")).toBeInTheDocument();
  });

  test("clicking a card's body — not just its title — opens the drawer", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("requirements_met")).getByRole("listitem");
    await user.click(within(card).getByText(t.tracker.waitingForBonus));

    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Chase $400 Checking Bonus",
      }),
    ).toBeInTheDocument();
  });

  test("“Remove” untracks the item", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("closed")).getByRole("listitem");
    await user.click(within(card).getByRole("button", { name: t.plan.moreActions }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.untrack }));

    expect(useStore.getState().tracker.map((i) => i.id)).not.toContain("eastern-750");
  });
});

describe("TrackerPage — drawer selection", () => {
  test("?item= opens that item's drawer straight away", () => {
    seedAllStages();
    renderTrackerPage("/tracker?item=us-bank-450");

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "US Bank $450 Checking Bonus" }),
    ).toBeInTheDocument();
  });

  test("clicking a pipeline card opens its drawer", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    const card = within(column("opened")).getByRole("listitem");
    await user.click(within(card).getByText("Wells Fargo $500 Checking Bonus"));

    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Wells Fargo $500 Checking Bonus",
      }),
    ).toBeInTheDocument();
  });

  test("removing the open item from a pipeline card closes the drawer and clears ?item=", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage("/tracker?item=eastern-750");

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const card = within(column("closed")).getByRole("listitem");
    await user.click(within(card).getByRole("button", { name: t.plan.moreActions }));
    await user.click(within(card).getByRole("menuitem", { name: t.tracker.untrack }));

    expect(useStore.getState().tracker.map((i) => i.id)).not.toContain("eastern-750");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  test("an unknown ?item= leaves the drawer closed", () => {
    seedAllStages();
    renderTrackerPage("/tracker?item=nope");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("TrackerPage — empty state", () => {
  test("links to /plan when a profile exists", () => {
    useStore.setState({ profile: { ...defaultProfile("2026-09"), state: "MA" }, tracker: [] });
    renderTrackerPage();

    expect(screen.getByText(t.tracker.empty.h)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.tracker.empty.cta })).toHaveAttribute(
      "href",
      "/plan",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("links to /start when there is no profile", () => {
    useStore.setState({ profile: null, tracker: [] });
    renderTrackerPage();

    expect(screen.getByRole("link", { name: t.tracker.empty.cta })).toHaveAttribute(
      "href",
      "/start",
    );
  });

  /** The working screen is for the accounts you have, not for a product that does not
   * exist yet. The promise lives on the About page, if anywhere. */
  test("carries no 'coming soon' banner", () => {
    seedAllStages();
    renderTrackerPage();

    expect(screen.queryByText(t.tracker.pro)).not.toBeInTheDocument();
  });
});

describe("TrackerPage — the ledger lives elsewhere", () => {
  test("the spreadsheet is not on this page, and a quiet link leads to it", () => {
    seedAllStages();
    renderTrackerPage();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.tracker.seeLedger })).toHaveAttribute(
      "href",
      "/ledger",
    );
  });
});

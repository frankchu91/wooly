import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { earliestCloseDate } from "../../engine/conditions";
import type { Bonus, TrackedItem } from "../../engine/types";
import { defaultProfile } from "../../engine/types";
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

function renderTrackerPage(entry = "/tracker") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DataContext.Provider value={dataset}>
        <Routes>
          <Route path="/tracker" element={<TrackerPage />} />
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
        dates: { opened: "2026-01-05", closed: "2026-08-01" },
      }),
    ],
  });
}

/** The pipeline column for one stage, found by its heading. */
function column(stage: keyof typeof t.tracker.statuses): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name: t.tracker.statuses[stage] });
  return heading.closest("li") as HTMLElement;
}

/** The ledger table's rows, in rendered order. They are exposed as buttons (each opens
 * the item drawer), so they're found by their row label rather than by the row role. */
function ledgerRows(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /^Open / });
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
});

describe("TrackerPage — ledger table", () => {
  test("renders one row per tracked item, ordered by stage then open date", () => {
    seedAllStages();
    renderTrackerPage();

    expect(ledgerRows().map((row) => row.getAttribute("aria-label"))).toEqual([
      t.tracker.ledger.rowLabel("BMO $400 Checking Bonus"),
      t.tracker.ledger.rowLabel("Wells Fargo $500 Checking Bonus"),
      t.tracker.ledger.rowLabel("Chase $400 Checking Bonus"),
      t.tracker.ledger.rowLabel("US Bank $450 Checking Bonus"),
      t.tracker.ledger.rowLabel("Eastern Bank $750 Checking Bonus"),
    ]);
  });

  test("shows the column headers the spreadsheet needs", () => {
    seedAllStages();
    renderTrackerPage();

    const table = screen.getByRole("table");
    for (const header of Object.values(t.tracker.fields)) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
  });

  test("turning off “Show closed” hides the closed row", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderTrackerPage();

    expect(ledgerRows()).toHaveLength(5);

    await user.click(screen.getByRole("switch", { name: t.tracker.ledger.showClosed }));

    const labels = ledgerRows().map((row) => row.getAttribute("aria-label"));
    expect(labels).toHaveLength(4);
    expect(labels).not.toContain(t.tracker.ledger.rowLabel("Eastern Bank $750 Checking Bonus"));
  });

  test("an item whose bonus has left the dataset still gets a row, with no money", () => {
    useStore.setState({ tracker: [trackedItem({ bonusId: "gone-forever", status: "opened" })] });
    renderTrackerPage();

    const row = screen.getByRole("button", { name: t.tracker.ledger.rowLabel("gone-forever") });
    expect(within(row).getAllByText(t.bonuses.unknown).length).toBeGreaterThan(0);
    expect(within(row).queryByText(/^\$/)).not.toBeInTheDocument();
  });

  test("pressing Enter on a row opens that item's drawer", async () => {
    seedAllStages();
    renderTrackerPage();

    const row = screen.getByRole("button", {
      name: t.tracker.ledger.rowLabel("Wells Fargo $500 Checking Bonus"),
    });
    row.focus();
    await userEvent.setup({ delay: null }).keyboard("{Enter}");

    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Wells Fargo $500 Checking Bonus",
      }),
    ).toBeInTheDocument();
  });
});

describe("TrackerPage — pipeline", () => {
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

  test("links to /start when there is no profile, and still shows the Pro banner", () => {
    useStore.setState({ profile: null, tracker: [] });
    renderTrackerPage();

    expect(screen.getByRole("link", { name: t.tracker.empty.cta })).toHaveAttribute(
      "href",
      "/start",
    );
    expect(screen.getByText(t.tracker.pro)).toBeInTheDocument();
  });
});

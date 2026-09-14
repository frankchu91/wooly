import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import type { TrackedItem } from "../../engine/types";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { money } from "../../ui";
import { LedgerPage } from "./LedgerPage";
import { LedgerTable } from "./LedgerTable";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();
// Matches how `parseISO` reads date-only strings (local midnight) rather than
// `new Date("2026-09-14")`'s UTC midnight — keeps date maths stable across timezones.
const today = new Date(2026, 8, 14);

/** Exposes the router's query string, so a test can assert what `?item=` holds. */
function SearchProbe() {
  return <span data-testid="search">{useLocation().search}</span>;
}

function renderLedgerPage(entry = "/ledger") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DataContext.Provider value={dataset}>
        <Routes>
          <Route
            path="/ledger"
            element={
              <>
                <LedgerPage />
                <SearchProbe />
              </>
            }
          />
          <Route path="/tracker" element={<div>tracker placeholder</div>} />
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

/** The offer-name button in each ledger row, in rendered order — the keyboard route into
 * the item drawer, and the thing that carries the row's label. */
function ledgerRows(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /^Open / });
}

/** The `<tr>` around one ledger row's offer-name button. */
function ledgerRow(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: t.tracker.ledger.rowLabel(title) });
  return button.closest("tr") as HTMLElement;
}

/** The totals row, found by its label rather than its position, so a test says what it
 * means and the row can move again without rewriting them. */
function totalsRow(): HTMLElement {
  return screen.getByText(t.tracker.ledger.total).closest("tr") as HTMLElement;
}

beforeEach(() => {
  useStore.setState(initialState, true);
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(today);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LedgerPage — totals", () => {
  test("sums earned, pending and planned with a count of accounts each", () => {
    seedAllStages();
    renderLedgerPage();

    const totals = screen.getByRole("region", { name: t.tracker.ledger.totals });

    // Earned prefers the amount the user actually recorded (475) over us-bank's
    // headline 450, then adds closed eastern-750's 750.
    expect(within(totals).getByText(money(1225))).toBeInTheDocument();
    expect(within(totals).getByText(money(900))).toBeInTheDocument(); // 500 + 400 in flight
    expect(within(totals).getByText(money(400))).toBeInTheDocument(); // bmo-400 planned

    expect(within(totals).getAllByText(t.tracker.ledger.accounts(2))).toHaveLength(2);
    expect(within(totals).getByText(t.tracker.ledger.accounts(1))).toBeInTheDocument();
  });

  // X1: a closed account that never paid is not money the user has, and the row says so
  // rather than showing a figure that never posted or an em dash that reads as "not yet".
  test("a closed account that never paid is not earned", () => {
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
    renderLedgerPage();

    const totals = screen.getByRole("region", { name: t.tracker.ledger.totals });
    expect(within(totals).getByText(money(450))).toBeInTheDocument(); // not 1200

    const row = ledgerRow("Eastern Bank $750 Checking Bonus");
    expect(within(row).getByText(t.tracker.ledger.closedNoBonus)).toBeInTheDocument();
  });
});

describe("LedgerPage — ledger table", () => {
  test("renders one row per tracked item, ordered by stage then open date", () => {
    seedAllStages();
    renderLedgerPage();

    expect(ledgerRows().map((row) => row.getAttribute("aria-label"))).toEqual([
      t.tracker.ledger.rowLabel("BMO $400 Checking Bonus"),
      t.tracker.ledger.rowLabel("Wells Fargo $500 Checking Bonus"),
      t.tracker.ledger.rowLabel("Chase $400 Checking Bonus"),
      t.tracker.ledger.rowLabel("US Bank $450 Checking Bonus"),
      t.tracker.ledger.rowLabel("Eastern Bank $750 Checking Bonus"),
    ]);
  });

  test("the header counts the rows on screen", () => {
    seedAllStages();
    renderLedgerPage();

    expect(screen.getByText(t.tracker.ledger.rows(5))).toBeInTheDocument();
  });

  test("shows the column headers the spreadsheet needs", () => {
    seedAllStages();
    renderLedgerPage();

    const table = screen.getByRole("table");
    for (const header of Object.values(t.tracker.fields)) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
  });

  test("turning off “Show closed” hides the closed row", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderLedgerPage();

    expect(ledgerRows()).toHaveLength(5);

    await user.click(screen.getByRole("switch", { name: t.tracker.ledger.showClosed }));

    const labels = ledgerRows().map((row) => row.getAttribute("aria-label"));
    expect(labels).toHaveLength(4);
    expect(labels).not.toContain(t.tracker.ledger.rowLabel("Eastern Bank $750 Checking Bonus"));
  });

  test("an item whose bonus has left the dataset names the id once and says why", () => {
    useStore.setState({ tracker: [trackedItem({ bonusId: "gone-forever", status: "opened" })] });
    renderLedgerPage();

    const row = ledgerRow("gone-forever");
    expect(within(row).getAllByText("gone-forever")).toHaveLength(1);
    expect(within(row).getByText(t.tracker.ledger.missingOffer)).toBeInTheDocument();
    expect(within(row).getAllByText(t.bonuses.unknown).length).toBeGreaterThan(0);
    expect(within(row).queryByText(/^\$/)).not.toBeInTheDocument();
  });

  test("the rows stay rows — only the offer name is a button", () => {
    seedAllStages();
    renderLedgerPage();

    const row = ledgerRow("Wells Fargo $500 Checking Bonus");
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");
    expect(within(row).getAllByRole("button")).toHaveLength(1);
  });

  // P2: the spreadsheet this replaces ended in a totals row; this one leads with it, so
  // the sum is the first thing read rather than the last thing scrolled to.
  test("a totals row adds up the bonus column and the money that actually posted", () => {
    seedAllStages();
    renderLedgerPage();

    // 400 + 500 + 400 + 450 + 750 headline; 475 (recorded) + 750 (closed after paying).
    expect(within(totalsRow()).getByText(money(2500))).toBeInTheDocument();
    expect(within(totalsRow()).getByText(money(1225))).toBeInTheDocument();
  });

  test("the totals sit above the rows they add up", () => {
    seedAllStages();
    renderLedgerPage();

    const table = screen.getByRole("table");
    const rows: HTMLElement[] = Array.from(table.querySelectorAll("tr"));
    const firstOffer = ledgerRow("Wells Fargo $500 Checking Bonus");
    expect(rows.indexOf(totalsRow())).toBeLessThan(rows.indexOf(firstOffer));
    expect(table.querySelector("tfoot")).toBeNull();
  });

  test("the totals row follows “Show closed”, so it always matches the rows below it", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderLedgerPage();

    await user.click(screen.getByRole("switch", { name: t.tracker.ledger.showClosed }));

    expect(within(totalsRow()).getByText(money(1750))).toBeInTheDocument(); // 2500 - 750
    expect(within(totalsRow()).getByText(money(475))).toBeInTheDocument(); // 1225 - 750
  });

  // P3: the DD deadline stops asking anything once the money is in.
  test("the DD deadline is muted once the bonus has been received", () => {
    seedAllStages();
    renderLedgerPage();

    const live = ledgerRow("Wells Fargo $500 Checking Bonus").querySelectorAll("td")[4];
    const past = ledgerRow("US Bank $450 Checking Bonus").querySelectorAll("td")[4];
    expect(live.className).not.toContain("text-muted");
    expect(past.className).toContain("text-muted");
  });

  // P1: the household column from the owner's spreadsheet.
  test("an applicant shows as a badge on the row", () => {
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
    renderLedgerPage();

    expect(
      within(ledgerRow("Wells Fargo $500 Checking Bonus")).getByText("partner"),
    ).toBeInTheDocument();
  });

  test("clicking the offer name selects the row once, not twice", () => {
    // X12: the row behind the button opens the same drawer, so without
    // `stopPropagation` one press runs `onSelect` twice.
    const onSelect = vi.fn();
    const bonusesById = Object.fromEntries(fixture.map((b) => [b.id, b]));
    render(
      <LedgerTable
        items={[trackedItem({ bonusId: "wells-fargo-500", status: "opened" })]}
        bonusesById={bonusesById}
        today={today}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: t.tracker.ledger.rowLabel("Wells Fargo $500 Checking Bonus"),
      }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("wells-fargo-500");
  });
});

describe("LedgerPage — drawer", () => {
  test("clicking a row opens that item's drawer and records it in ?item=", async () => {
    const user = userEvent.setup({ delay: null });
    seedAllStages();
    renderLedgerPage();

    await user.click(
      screen.getByRole("button", {
        name: t.tracker.ledger.rowLabel("Wells Fargo $500 Checking Bonus"),
      }),
    );

    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Wells Fargo $500 Checking Bonus",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("search").textContent).toBe("?item=wells-fargo-500");
  });

  test("?item= opens that item's drawer straight away", () => {
    seedAllStages();
    renderLedgerPage("/ledger?item=us-bank-450");

    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "US Bank $450 Checking Bonus",
      }),
    ).toBeInTheDocument();
  });

  test("tabbing to the offer name and pressing Enter opens that item's drawer", async () => {
    seedAllStages();
    renderLedgerPage();

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

describe("LedgerPage — empty state and links", () => {
  test("links to /plan when a profile exists, and shows no table", () => {
    useStore.setState({ profile: { ...defaultProfile("2026-09"), state: "MA" }, tracker: [] });
    renderLedgerPage();

    expect(screen.getByText(t.tracker.empty.h)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.tracker.empty.cta })).toHaveAttribute(
      "href",
      "/plan",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("links to /start when there is no profile", () => {
    useStore.setState({ profile: null, tracker: [] });
    renderLedgerPage();

    expect(screen.getByRole("link", { name: t.tracker.empty.cta })).toHaveAttribute(
      "href",
      "/start",
    );
  });

  test("a quiet link leads back to the pipeline", () => {
    seedAllStages();
    renderLedgerPage();

    expect(screen.getByRole("link", { name: t.ledger.seePipeline })).toHaveAttribute(
      "href",
      "/tracker",
    );
  });

  describe("the spreadsheet download", () => {
    test("saves a dated .csv built in the browser", async () => {
      const createObjectURL = vi.fn(() => "blob:ledger");
      const revokeObjectURL = vi.fn();
      // jsdom implements neither, and the click must not actually navigate.
      vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => undefined);

      seedAllStages();
      renderLedgerPage();
      await userEvent.click(screen.getByRole("button", { name: t.ledger.download }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const [blob] = createObjectURL.mock.calls[0] as unknown as [Blob];
      expect(blob.type).toContain("text/csv");
      expect(await blob.text()).toContain(t.tracker.ledger.total);
      expect(click.mock.instances[0]).toHaveProperty("download", "woolly-ledger-2026-09-14.csv");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:ledger");

      click.mockRestore();
      vi.unstubAllGlobals();
    });

    test("is not offered when there is nothing to export", () => {
      useStore.setState({ profile: defaultProfile("2026-09"), tracker: [] });
      renderLedgerPage();

      expect(screen.queryByRole("button", { name: t.ledger.download })).not.toBeInTheDocument();
    });
  });
});

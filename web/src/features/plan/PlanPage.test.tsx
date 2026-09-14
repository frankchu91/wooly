import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { buildPlan } from "../../engine";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { money } from "../../ui";
import { PlanPage } from "./PlanPage";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();
// Matches how `parseISO` interprets date-only strings (local midnight) rather than
// `new Date("2026-09-13")`'s UTC midnight — keeps the fixture's eligibility results
// stable regardless of the host timezone.
const today = new Date(2026, 8, 13);

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPlanPage() {
  return render(
    <MemoryRouter initialEntries={["/plan"]}>
      <DataContext.Provider value={dataset}>
        <Routes>
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/start" element={<div>start placeholder</div>} />
          <Route path="/tracker" element={<div>tracker placeholder</div>} />
        </Routes>
      </DataContext.Provider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

// Flushes the SummaryBar's ~600ms count-up animation (driven by framer-motion's
// `animate`, which schedules via requestAnimationFrame — fake timers drive that too).
function flushCountUp() {
  act(() => {
    vi.advanceTimersByTime(700);
  });
}

beforeEach(() => {
  useStore.setState(initialState, true);
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(today);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PlanPage", () => {
  test("shows the projected total as the sum of the placed bonuses' max amounts", () => {
    const profile = { ...defaultProfile("2026-09"), state: "MA" };
    useStore.setState({ profile });
    const expected = buildPlan(fixture, profile, { today });

    renderPlanPage();
    flushCountUp();

    expect(screen.getByText(money(expected.totals.projected))).toBeInTheDocument();
  });

  test("skipping a card moves it to Skipped with a Restore button that brings it back", async () => {
    const user = userEvent.setup({ delay: null });
    useStore.setState({ profile: { ...defaultProfile("2026-09"), state: "MA" } });

    const { container } = renderPlanPage();
    flushCountUp();

    const timeline = container.querySelector("ol");
    expect(timeline).not.toBeNull();
    const card = within(timeline as HTMLOListElement)
      .getByText(/Wells Fargo \$500/)
      .closest("li");
    expect(card).not.toBeNull();

    await user.click(within(card as HTMLLIElement).getByRole("button", { name: t.plan.details }));
    await user.click(within(card as HTMLLIElement).getByRole("menuitem", { name: t.plan.skip }));

    expect(
      within(timeline as HTMLOListElement).queryByText(/Wells Fargo \$500/),
    ).not.toBeInTheDocument();

    const restoreButton = screen.getByRole("button", { name: t.plan.restore });
    const skippedRow = restoreButton.closest("li");
    expect(skippedRow).not.toBeNull();
    expect(within(skippedRow as HTMLLIElement).getByText(/Wells Fargo \$500/)).toBeInTheDocument();

    await user.click(restoreButton);

    expect(within(timeline as HTMLOListElement).getByText(/Wells Fargo \$500/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.plan.restore })).not.toBeInTheDocument();
  });

  test("renders the empty state when nothing fits the profile", () => {
    useStore.setState({
      profile: {
        ...defaultProfile("2026-09"),
        state: "MA",
        monthlyDD: 0,
        maxSplits: 0,
        prefs: {
          avoidHardPull: true,
          avoidChexSensitive: false,
          includeBusiness: false,
          includeSavings: false,
        },
      },
    });

    renderPlanPage();

    expect(screen.getByText(t.plan.empty.h)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.plan.empty.cta })).toHaveAttribute(
      "href",
      "/start?step=1",
    );
  });

  test("redirects to /start when there is no profile", () => {
    renderPlanPage();
    expect(screen.getByTestId("location")).toHaveTextContent("/start");
  });
});

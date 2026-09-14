import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { BonusesPage } from "./BonusesPage";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();
// Matches how `parseISO` interprets date-only strings (local midnight) — keeps the
// fixture's eligibility/expiring results stable regardless of host timezone.
const today = new Date(2026, 8, 13);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/bonuses"]}>
      <DataContext.Provider value={dataset}>
        <Routes>
          <Route path="/bonuses" element={<BonusesPage />} />
          <Route path="/plan" element={<div>plan placeholder</div>} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useStore.setState(initialState, true);
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(today);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BonusesPage", () => {
  test("searching for a bank leaves only its own card", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.type(screen.getByRole("searchbox", { name: t.bonuses.search }), "wells");

    const grid = screen.getByRole("list");
    const cards = within(grid).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(within(grid).getByText(/Wells Fargo/)).toBeInTheDocument();
  });

  test("the noDD chip leaves only fourfront-400", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByRole("button", { name: t.bonuses.filters.noDD }));

    const grid = screen.getByRole("list");
    const cards = within(grid).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(within(grid).getByText(/4Front Credit Union/)).toBeInTheDocument();
  });

  test("clicking a card opens the drawer with glance labels", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByText(/Wells Fargo \$500/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.bonuses.glance.dd)).toBeInTheDocument();
    expect(within(dialog).getByText(t.bonuses.glance.availability)).toBeInTheDocument();
    expect(within(dialog).getByText(t.bonuses.glance.expires)).toBeInTheDocument();
  });

  test("sorting by expiring puts wells-fargo-500 before chase-400", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByRole("radio", { name: t.bonuses.sort.expiring }));

    const grid = screen.getByRole("list");
    const cards = within(grid).getAllByRole("listitem");
    const wellsIndex = cards.findIndex((card) => /Wells Fargo/.test(card.textContent ?? ""));
    const chaseIndex = cards.findIndex((card) => /Chase \$400/.test(card.textContent ?? ""));
    expect(wellsIndex).toBeGreaterThanOrEqual(0);
    expect(chaseIndex).toBeGreaterThanOrEqual(0);
    expect(wellsIndex).toBeLessThan(chaseIndex);
  });

  test("the addToPlan button navigates to /plan", async () => {
    // No profile is set, so nothing is auto-placed into a plan yet — the button
    // reads "Add to plan" (rather than the disabled "In your plan") and navigates.
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByText(/Wells Fargo \$500/));
    await user.click(screen.getByRole("button", { name: t.bonuses.addToPlan }));

    expect(screen.getByText("plan placeholder")).toBeInTheDocument();
  });

  test("the myState chip is disabled without a profile", () => {
    renderPage();

    expect(screen.getByRole("button", { name: t.bonuses.filters.myState })).toBeDisabled();
  });

  test("with a profile, an already-placed bonus shows a disabled 'In your plan' button and eligibility text", async () => {
    const user = userEvent.setup({ delay: null });
    useStore.setState({ profile: { ...defaultProfile("2026-09"), state: "MA" } });
    renderPage();

    // Eastern Bank's $750 checking bonus is available in MA and gets auto-placed
    // into the plan for this profile.
    await user.click(screen.getByText(/Eastern Bank \$750/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: t.bonuses.inPlan })).toBeDisabled();
    expect(within(dialog).getByText(t.bonuses.eligible)).toBeInTheDocument();
  });

  test("the result count reflects the filtered results", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    expect(screen.getByText(t.bonuses.count(fixture.length))).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: t.bonuses.search }), "wells");
    expect(screen.getByText(t.bonuses.count(1))).toBeInTheDocument();
  });
});

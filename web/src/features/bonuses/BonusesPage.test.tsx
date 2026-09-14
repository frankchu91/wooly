import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import type { Bonus } from "../../engine/types";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { BonusesPage } from "./BonusesPage";

const initialState = useStore.getState();
// Matches how `parseISO` interprets date-only strings (local midnight) — keeps the
// fixture's eligibility/expiring results stable regardless of host timezone.
const today = new Date(2026, 8, 13);

// Defaults to the shared fixture; a test that needs a variant (e.g. a bonus with its
// `terms.status` swapped) passes its own `bonuses` array instead of mutating the
// shared one.
function renderPage(bonuses: Bonus[] = fixture) {
  const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses };
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

  test("an ineligible offer offers to change preferences instead of 'Add to plan'", async () => {
    const user = userEvent.setup({ delay: null });
    // fourfront-400 needs a hard pull, which the default profile asks to avoid.
    useStore.setState({ profile: { ...defaultProfile("2026-09"), state: "MI" } });
    renderPage();

    await user.click(screen.getByText(/4Front Credit Union \$400/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: t.bonuses.addToPlan })).toBeNull();
    expect(within(dialog).getByText(t.plan.reasons.hard_pull)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: t.bonuses.changePrefs })).toHaveAttribute(
      "href",
      "/start?step=1",
    );
  });

  test("an out-of-state offer offers nothing — there is no preference to change", async () => {
    const user = userEvent.setup({ delay: null });
    useStore.setState({ profile: { ...defaultProfile("2026-09"), state: "NY" } });
    renderPage();

    await user.click(screen.getByText(/Eastern Bank \$750/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.plan.reasons.not_in_state)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: t.bonuses.addToPlan })).toBeNull();
    expect(within(dialog).queryByRole("link", { name: t.bonuses.changePrefs })).toBeNull();
  });

  test("an eligible offer the scheduler couldn't fit says so on a disabled button", async () => {
    const user = userEvent.setup({ delay: null });
    // A one-month horizon: eastern-750's $500 DD still fits the month (so it stays
    // eligible), but its 60-day window doesn't fit the horizon, so it never gets placed.
    useStore.setState({
      profile: { ...defaultProfile("2026-09"), state: "MA", monthlyDD: 500, horizonMonths: 1 },
    });
    renderPage();

    await user.click(screen.getByText(/Eastern Bank \$750/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.bonuses.eligible)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: t.bonuses.notPlaced })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: t.bonuses.addToPlan })).toBeNull();
  });

  test("the verify chip is paired with an instruction, not left as a shrug", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByText(/BMO \$400/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.bonuses.verify)).toBeInTheDocument();
    expect(within(dialog).getByText(t.bonuses.verifyBody)).toBeInTheDocument();
  });

  test("opening chase-400 shows its direct-deposit condition text in the Conditions section", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByText(/Chase \$400/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.bonuses.conditionsTitle)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Set up direct deposit and receive a qualifying direct deposit within 90 days of account opening.",
      ),
    ).toBeInTheDocument();
  });

  test("opening wells-fargo-500 shows a Bank badge and the bank-page link", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByText(/Wells Fargo \$500/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.conditions.sources.bank)).toBeInTheDocument();
    const link = within(dialog).getByRole("link", { name: t.bonuses.terms.bankPage });
    expect(link).toHaveAttribute("href", "https://example.test/wf-offer");
  });

  test("opening us-bank-450 (no recorded conditions, dd required) shows the synthesised DD text", async () => {
    // us-bank-450: conditions: [], dd required 2000/90, no etf — checklistFor's only
    // entry is the synthesised direct_deposit condition.
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByText(/US Bank \$450/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.conditions.synth.dd(2000, 90))).toBeInTheDocument();
  });

  test("a blocked terms page shows the unreadable note, not the bank-page link", async () => {
    const user = userEvent.setup({ delay: null });
    const bonuses = fixture.map((bonus) =>
      bonus.id === "wells-fargo-500"
        ? {
            ...bonus,
            terms: {
              status: "blocked" as const,
              url: "https://example.test",
              fetched_at: "2026-09-14",
            },
          }
        : bonus,
    );
    renderPage(bonuses);

    await user.click(screen.getByText(/Wells Fargo \$500/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t.bonuses.terms.unreadable)).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: t.bonuses.terms.bankPage })).toBeNull();
  });

  test("a terms.status of 'none' shows neither the bank-page link nor the unreadable note", async () => {
    // chase-400: terms.status "none", offer_url null.
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByText(/Chase \$400/));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("link", { name: t.bonuses.terms.bankPage })).toBeNull();
    expect(within(dialog).queryByText(t.bonuses.terms.unreadable)).toBeNull();
  });

  test("the result count reflects the filtered results", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    expect(screen.getByText(t.bonuses.count(fixture.length))).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: t.bonuses.search }), "wells");
    expect(screen.getByText(t.bonuses.count(1))).toBeInTheDocument();
  });
});

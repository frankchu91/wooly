import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import type { TrackedItem } from "../../state/store";
import { money } from "../../ui";
import { TrackerPage } from "./TrackerPage";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();
// Matches how `parseISO` interprets date-only strings (local midnight) rather than
// `new Date("2026-09-13")`'s UTC midnight — keeps date maths stable across timezones.
const today = new Date(2026, 8, 13);

function renderTrackerPage() {
  return render(
    <MemoryRouter initialEntries={["/tracker"]}>
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

function trackedItem(overrides: Partial<TrackedItem>): TrackedItem {
  return {
    id: overrides.bonusId ?? overrides.id ?? "wells-fargo-500",
    bonusId: "wells-fargo-500",
    status: "planned",
    dates: {},
    openMonth: "2026-09",
    ...overrides,
  };
}

beforeEach(() => {
  useStore.setState(initialState, true);
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(today);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TrackerPage", () => {
  test("groups tracked items under their status heading", () => {
    useStore.setState({
      tracker: [
        trackedItem({ id: "wells-fargo-500", bonusId: "wells-fargo-500", status: "planned" }),
        trackedItem({
          id: "chase-400",
          bonusId: "chase-400",
          status: "opened",
          dates: { opened: "2026-09-01" },
        }),
        trackedItem({ id: "us-bank-450", bonusId: "us-bank-450", status: "received" }),
      ],
    });

    renderTrackerPage();

    const plannedHeading = screen.getByRole("heading", { name: t.tracker.statuses.planned });
    const plannedGroup = plannedHeading.closest("section") as HTMLElement;
    expect(within(plannedGroup).getByText("Wells Fargo $500 Checking Bonus")).toBeInTheDocument();

    const openedHeading = screen.getByRole("heading", { name: t.tracker.statuses.opened });
    const openedGroup = openedHeading.closest("section") as HTMLElement;
    expect(within(openedGroup).getByText("Chase $400 Checking Bonus")).toBeInTheDocument();

    const receivedHeading = screen.getByRole("heading", { name: t.tracker.statuses.received });
    const receivedGroup = receivedHeading.closest("section") as HTMLElement;
    expect(within(receivedGroup).getByText("US Bank $450 Checking Bonus")).toBeInTheDocument();

    // Empty groups (dd_sent, closed) are omitted entirely.
    expect(
      screen.queryByRole("heading", { name: t.tracker.statuses.dd_sent }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: t.tracker.statuses.closed }),
    ).not.toBeInTheDocument();
  });

  test("advancing an item moves it to the next group and stores the chosen date", async () => {
    const user = userEvent.setup({ delay: null });
    useStore.setState({
      tracker: [
        trackedItem({ id: "wells-fargo-500", bonusId: "wells-fargo-500", status: "planned" }),
      ],
    });

    renderTrackerPage();

    const plannedHeading = screen.getByRole("heading", { name: t.tracker.statuses.planned });
    const card = plannedHeading.closest("section")?.querySelector("li") as HTMLLIElement;
    expect(card).not.toBeNull();

    await user.click(within(card).getByRole("button", { name: t.tracker.advance }));

    const dateInput = within(card).getByLabelText(t.tracker.dateFor(t.tracker.statuses.opened));
    fireEvent.change(dateInput, { target: { value: "2026-09-10" } });
    await user.click(within(card).getByRole("button", { name: t.common.save }));

    expect(
      screen.queryByRole("heading", { name: t.tracker.statuses.planned }),
    ).not.toBeInTheDocument();

    const openedHeading = screen.getByRole("heading", { name: t.tracker.statuses.opened });
    const openedGroup = openedHeading.closest("section") as HTMLElement;
    expect(within(openedGroup).getByText("Wells Fargo $500 Checking Bonus")).toBeInTheDocument();

    const item = useStore.getState().tracker.find((i) => i.id === "wells-fargo-500");
    expect(item?.status).toBe("opened");
    expect(item?.dates.opened).toBe("2026-09-10");
  });

  test("an opened No-DD bonus shows no DD deadline and no days-left badge", () => {
    useStore.setState({
      tracker: [
        trackedItem({
          id: "fourfront-400",
          bonusId: "fourfront-400",
          status: "opened",
          dates: { opened: "2026-09-01" },
        }),
      ],
    });

    renderTrackerPage();

    expect(screen.queryByText(new RegExp(t.plan.ddBy))).not.toBeInTheDocument();
    expect(screen.queryByText(/days left/)).not.toBeInTheDocument();
    expect(screen.queryByText(t.tracker.overdue)).not.toBeInTheDocument();
    // The account-level safe-close date is unrelated to direct deposit, so it stays.
    expect(screen.getByText(new RegExp(t.plan.safeClose))).toBeInTheDocument();
  });

  test("an opened DD bonus still shows its deadline and countdown", () => {
    useStore.setState({
      tracker: [
        trackedItem({
          id: "wells-fargo-500",
          bonusId: "wells-fargo-500",
          status: "opened",
          dates: { opened: "2026-09-01" },
        }),
      ],
    });

    renderTrackerPage();

    expect(screen.getByText(new RegExp(t.plan.ddBy))).toBeInTheDocument();
    expect(screen.getByText(/days left/)).toBeInTheDocument();
  });

  test("a planned item says which month it's planned for", () => {
    useStore.setState({
      tracker: [trackedItem({ id: "wells-fargo-500", openMonth: "2026-11" })],
    });

    renderTrackerPage();

    expect(screen.getByText(t.tracker.plannedFor("Nov 2026"))).toBeInTheDocument();
  });

  test("header stats sum bonus_max separately for earned vs in-progress statuses", () => {
    useStore.setState({
      tracker: [
        trackedItem({ id: "wells-fargo-500", bonusId: "wells-fargo-500", status: "received" }), // 500
        trackedItem({ id: "us-bank-450", bonusId: "us-bank-450", status: "closed" }), // 450
        trackedItem({ id: "chase-400", bonusId: "chase-400", status: "opened" }), // 400
        trackedItem({ id: "bmo-400", bonusId: "bmo-400", status: "planned" }), // 400
      ],
    });

    renderTrackerPage();

    expect(screen.getByText(t.tracker.earned).nextElementSibling).toHaveTextContent(money(950));
    expect(screen.getByText(t.tracker.inProgress).nextElementSibling).toHaveTextContent(money(800));
  });

  test("empty state links to /plan when a profile exists", () => {
    useStore.setState({ profile: { ...defaultProfile("2026-09"), state: "MA" }, tracker: [] });

    renderTrackerPage();

    expect(screen.getByText(t.tracker.empty.h)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.tracker.empty.cta })).toHaveAttribute(
      "href",
      "/plan",
    );
  });

  test("empty state links to /start when there is no profile", () => {
    useStore.setState({ profile: null, tracker: [] });

    renderTrackerPage();

    expect(screen.getByRole("link", { name: t.tracker.empty.cta })).toHaveAttribute(
      "href",
      "/start",
    );
  });
});

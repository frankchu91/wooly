import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import type { PlanItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { PlanCard } from "./PlanCard";

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

const item: PlanItem = {
  bonus: fixture[0],
  openMonth: "2026-09",
  ddSchedule: [{ month: "2026-09", amount: 1000 }],
  ddDeadline: "2026-12-11",
  safeCloseDate: "2027-03-11",
  warnings: [],
};

function renderCard() {
  return render(
    <MemoryRouter>
      <ul>
        <PlanCard item={item} />
      </ul>
    </MemoryRouter>,
  );
}

describe("PlanCard kebab menu", () => {
  test("opening the menu via keyboard focuses the first menu item", async () => {
    const user = userEvent.setup();
    renderCard();

    screen.getByRole("button", { name: t.plan.moreActions }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("menuitem", { name: t.plan.details })).toHaveFocus();
  });

  test("ArrowDown/ArrowUp move between items and wrap", async () => {
    const user = userEvent.setup();
    renderCard();

    screen.getByRole("button", { name: t.plan.moreActions }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: t.plan.details })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: t.plan.skip })).toHaveFocus();

    // Wraps back to the first item past the last one.
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: t.plan.details })).toHaveFocus();

    // Wraps to the last item going up from the first.
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: t.plan.skip })).toHaveFocus();
  });

  test("Home/End jump to the first/last item", async () => {
    const user = userEvent.setup();
    renderCard();

    screen.getByRole("button", { name: t.plan.moreActions }).focus();
    await user.keyboard("{Enter}");

    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: t.plan.skip })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: t.plan.details })).toHaveFocus();
  });

  test("Escape closes the menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderCard();

    const trigger = screen.getByRole("button", { name: t.plan.moreActions });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("activating the Skip item closes the menu", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: t.plan.moreActions }));
    await user.click(screen.getByRole("menuitem", { name: t.plan.skip }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(useStore.getState().skippedIds).toContain(fixture[0].id);
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import type { Bonus, PlanItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { money } from "../../ui";
import { PlanCard } from "./PlanCard";

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

const bonusById = (id: string) => {
  const found = fixture.find((b) => b.id === id);
  if (!found) throw new Error(`fixture missing ${id}`);
  return found;
};

const makeItem = (overrides: Partial<PlanItem> = {}): PlanItem => ({
  bonus: fixture[0],
  openMonth: "2026-09",
  ddSchedule: [{ month: "2026-09", amount: 1000 }],
  ddDeadline: "2026-12-11",
  safeCloseDate: "2027-03-11",
  warnings: [],
  ...overrides,
});

const item = makeItem();

function renderCard(planItem: PlanItem = item) {
  return render(
    <MemoryRouter>
      <ul>
        <PlanCard item={planItem} />
      </ul>
    </MemoryRouter>,
  );
}

describe("PlanCard content", () => {
  test("shows the DD deadline for a bonus that requires a direct deposit", () => {
    renderCard();
    expect(screen.getByText(new RegExp(t.plan.ddBy))).toBeInTheDocument();
  });

  test("omits the DD deadline entirely for a No-DD bonus", () => {
    renderCard(makeItem({ bonus: bonusById("fourfront-400") }));

    expect(screen.queryByText(new RegExp(t.plan.ddBy))).not.toBeInTheDocument();
    expect(screen.getByText(t.plan.badges.noDD)).toBeInTheDocument();
    // The safe-close date is about the account, not the deposit, so it stays.
    expect(screen.getByText(new RegExp(t.plan.safeClose))).toBeInTheDocument();
  });

  test("shows the assumed $500 DD badge when the amount is unknown", () => {
    renderCard(makeItem({ bonus: bonusById("chase-400"), warnings: ["dd_unknown"] }));

    expect(screen.getByText(t.plan.badges.ddAssumed(money(500)))).toBeInTheDocument();
    // ...and still says out loud that it's an assumption.
    expect(screen.getByText(t.plan.warnings.dd_unknown)).toBeInTheDocument();
  });

  test("renders not_enriched as an Unverified badge linking to the source, not a red line", () => {
    const bonus = bonusById("bmo-400");
    renderCard(makeItem({ bonus, warnings: ["not_enriched", "dd_unknown"] }));

    const link = screen.getByRole("link", { name: t.plan.badges.unverified });
    expect(link).toHaveAttribute("href", bonus.doc_url);
    expect(screen.queryByText(t.plan.warnings.not_enriched)).not.toBeInTheDocument();
    // The offer-specific warning is still spelled out.
    expect(screen.getByText(t.plan.warnings.dd_unknown)).toBeInTheDocument();
  });

  test("shows a range for a tiered offer instead of the headline alone", () => {
    const bonus = { ...bonusById("chase-400"), bonus_min: 1500, bonus_max: 7000 };
    renderCard(makeItem({ bonus }));
    expect(screen.getByText("$1,500–$7,000")).toBeInTheDocument();
  });
});

describe("PlanCard conditions chip", () => {
  test("shows a '3 conditions' chip linking to the drawer for wells-fargo-500", () => {
    const bonus = bonusById("wells-fargo-500");
    renderCard(makeItem({ bonus }));

    const chip = screen.getByText(t.plan.badges.conditions(3));
    expect(chip.closest("a")).toHaveAttribute("href", `/bonuses?bonus=${bonus.id}`);
  });

  test("omits the chip for a bonus with no conditions and dd.required === false", () => {
    renderCard(makeItem({ bonus: bonusById("fourfront-400") }));

    expect(screen.queryByText(/conditions$/)).not.toBeInTheDocument();
  });

  test("collapses a bank duplicate of a doc condition so the chip counts rendered rows, not raw entries", () => {
    // Three raw conditions (a doc/bank pair sharing kind+amount+days, plus one
    // distinct condition) collapse to two — the chip must report the collapsed
    // count, matching what ConditionList actually renders in the drawer.
    const bonus: Bonus = {
      ...bonusById("wells-fargo-500"),
      dd: { required: false, amount: null, deadline_days: null },
      etf: null,
      conditions: [
        {
          id: "d1",
          kind: "direct_deposit",
          text: "doc version",
          amount: 500,
          days: 60,
          count: null,
          source: "doc",
        },
        {
          id: "d3",
          kind: "new_customer",
          text: "New customer only",
          amount: null,
          days: null,
          count: null,
          source: "doc",
        },
        {
          id: "d2",
          kind: "direct_deposit",
          text: "bank version",
          amount: 500,
          days: 60,
          count: null,
          source: "bank",
        },
      ],
    };

    renderCard(makeItem({ bonus }));

    expect(screen.getByText(t.plan.badges.conditions(2))).toBeInTheDocument();
  });
});

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

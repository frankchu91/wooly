import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Condition } from "../../engine/types";
import { t } from "../../i18n/en";
import { collapseSimilar, ConditionList } from "./ConditionList";

const docDD: Condition = {
  id: "doc-dd",
  kind: "direct_deposit",
  text: "Receive $500 in direct deposits within 60 days",
  amount: 500,
  days: 60,
  count: null,
  source: "doc",
};

const bankDD: Condition = {
  ...docDD,
  id: "bank-dd",
  text: "Set up direct deposit of $500 within 60 days",
  source: "bank",
};

const keepOpen: Condition = {
  id: "keep",
  kind: "keep_open",
  text: "Keep the account open for 180 days",
  amount: null,
  days: 180,
  count: null,
  source: "bank",
};

describe("ConditionList", () => {
  test("renders a source badge for each condition", () => {
    render(<ConditionList conditions={[docDD, keepOpen]} />);

    expect(screen.getAllByText(t.conditions.sources.doc)).toHaveLength(1);
    expect(screen.getAllByText(t.conditions.sources.bank)).toHaveLength(1);
  });

  test("renders a checkbox per condition and calls onToggle with its id when onToggle is given", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ConditionList conditions={[docDD, keepOpen]} onToggle={onToggle} />);

    const checkbox = screen.getByRole("checkbox", { name: docDD.text });
    await user.click(checkbox);

    expect(onToggle).toHaveBeenCalledWith(docDD.id);
  });

  test("checkbox reflects the done set", () => {
    render(
      <ConditionList
        conditions={[docDD, keepOpen]}
        done={new Set([keepOpen.id])}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: docDD.text })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: keepOpen.text })).toBeChecked();
  });

  test("without onToggle, renders no checkboxes (read-only)", () => {
    render(<ConditionList conditions={[docDD, keepOpen]} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(docDD.text)).toBeInTheDocument();
  });

  test("renders the empty message when there are no conditions", () => {
    render(<ConditionList conditions={[]} />);

    expect(screen.getByText(t.conditions.none)).toBeInTheDocument();
  });
});

describe("collapseSimilar", () => {
  test("drops a bank duplicate of a doc condition sharing kind, amount, and days", () => {
    expect(collapseSimilar([docDD, bankDD])).toEqual([docDD]);
  });

  test("keeps conditions whose amount or days differ", () => {
    const otherDays: Condition = { ...bankDD, id: "bank-dd-2", days: 90 };
    expect(collapseSimilar([docDD, otherDays])).toEqual([docDD, otherDays]);
  });

  test("keeps conditions with null amount/days even when kind matches — nothing to compare", () => {
    const bareKeepOpen: Condition = { ...keepOpen, id: "keep-2", days: null };
    expect(collapseSimilar([keepOpen, bareKeepOpen])).toEqual([keepOpen, bareKeepOpen]);
  });
});

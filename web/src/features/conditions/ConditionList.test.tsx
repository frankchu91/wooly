import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Condition } from "../../engine/types";
import { t } from "../../i18n/en";
import { ConditionList } from "./ConditionList";

const docDD: Condition = {
  id: "doc-dd",
  kind: "direct_deposit",
  text: "Receive $500 in direct deposits within 60 days",
  amount: 500,
  days: 60,
  count: null,
  source: "doc",
};

const fee: Condition = {
  id: "fee",
  kind: "fee",
  text: "The monthly service fee is $15",
  amount: 15,
  days: null,
  count: null,
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

  test("compact hides the meta line and clamps the condition text to two lines", () => {
    render(<ConditionList conditions={[docDD]} compact />);

    expect(screen.queryByText(/Amount:/)).toBeNull();
    expect(screen.getByText(docDD.text)).toHaveClass("line-clamp-2");
  });
});

describe("ConditionList — notes", () => {
  test("renders notes read-only under a collapsed disclosure with their count", () => {
    render(<ConditionList conditions={[docDD]} notes={[fee]} onToggle={vi.fn()} />);

    const summary = screen.getByText(t.conditions.alsoNote(1));
    expect(summary).toBeInTheDocument();
    expect(summary.closest("details")).not.toHaveAttribute("open");

    // The note is text with a source badge, never a task with a checkbox.
    expect(screen.getByText(fee.text)).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  test("no disclosure when there are no notes", () => {
    render(<ConditionList conditions={[docDD]} notes={[]} />);

    expect(screen.queryByText(/^Also note/)).not.toBeInTheDocument();
  });

  test("an empty checklist still shows its notes alongside the empty message", () => {
    render(<ConditionList conditions={[]} notes={[fee]} />);

    expect(screen.getByText(t.conditions.none)).toBeInTheDocument();
    expect(screen.getByText(fee.text)).toBeInTheDocument();
  });
});

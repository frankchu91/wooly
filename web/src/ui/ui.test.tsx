import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  BankAvatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  MoneyText,
  Segmented,
  Select,
  Slider,
  Stepper,
  Toaster,
  Toggle,
  dateLabel,
  monthLabel,
  money,
  toast,
} from "./index";

describe("format", () => {
  test("money formats whole dollars with no cents", () => {
    expect(money(1500)).toBe("$1,500");
  });

  test("money returns em dash for null", () => {
    expect(money(null)).toBe("—");
  });

  test("monthLabel formats YYYY-MM", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
  });

  test("dateLabel formats YYYY-MM-DD", () => {
    expect(dateLabel("2026-10-06")).toBe("Oct 6, 2026");
  });
});

describe("Button", () => {
  test("renders as a native button by default and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("renders as a router link when `to` is given", () => {
    render(
      <MemoryRouter>
        <Button to="/plan">Go to plan</Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Go to plan" });
    expect(link).toHaveAttribute("href", "/plan");
  });

  test('renders as a router link when as="link" is given', () => {
    render(
      <MemoryRouter>
        <Button as="link" to="/tracker">
          Tracker
        </Button>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Tracker" })).toBeInTheDocument();
  });
});

describe("Card", () => {
  test("renders children inside the given element", () => {
    render(<Card as="section">Content</Card>);
    const el = screen.getByText("Content");
    expect(el.tagName).toBe("SECTION");
  });
});

describe("Badge", () => {
  test("renders children", () => {
    render(<Badge tone="mint">New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});

describe("MoneyText", () => {
  test("renders formatted value", () => {
    render(<MoneyText value={2500} />);
    expect(screen.getByText("$2,500")).toBeInTheDocument();
  });

  test("renders em dash for null", () => {
    render(<MoneyText value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("Field", () => {
  test("associates label with control and shows error", () => {
    render(
      <Field label="State" htmlFor="state" error="Required">
        <input id="state" />
      </Field>,
    );
    expect(screen.getByLabelText("State")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});

describe("Select", () => {
  const options = [
    { value: "wf", label: "Wells Fargo" },
    { value: "chase", label: "Chase" },
    { value: "ally", label: "Ally Bank" },
  ];

  test("searchable select filters options and selects with keyboard", async () => {
    const onChange = vi.fn();
    render(
      <Select
        options={options}
        value=""
        onChange={onChange}
        searchable
        placeholder="Search banks"
      />,
    );

    const combobox = screen.getByRole("combobox");
    expect(combobox).toHaveAttribute("aria-expanded");

    await userEvent.click(combobox);
    await userEvent.type(combobox, "all");

    const listbox = screen.getByRole("listbox");
    const optionEls = within(listbox).getAllByRole("option");
    expect(optionEls).toHaveLength(1);
    expect(optionEls[0]).toHaveTextContent("Ally Bank");

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("ally");
  });

  test("searchable select closes on Escape", async () => {
    render(<Select options={options} value="" onChange={vi.fn()} searchable />);
    const combobox = screen.getByRole("combobox");
    await userEvent.click(combobox);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("non-searchable select renders a native select", () => {
    render(<Select options={options} value="chase" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});

describe("Slider", () => {
  test("calls onChange with a number when dragged via the range input", () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={10} step={1} value={5} onChange={onChange} />);
    const range = screen.getByRole("slider");
    fireEvent.change(range, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe("Toggle", () => {
  function ControlledToggle() {
    const [checked, setChecked] = useState(false);
    return <Toggle checked={checked} onChange={setChecked} label="Autopilot" />;
  }

  test("toggles via click and reports aria-checked", async () => {
    render(<ControlledToggle />);
    const switchEl = screen.getByRole("switch", { name: "Autopilot" });
    expect(switchEl).toHaveAttribute("aria-checked", "false");
    await userEvent.click(switchEl);
    expect(switchEl).toHaveAttribute("aria-checked", "true");
  });
});

describe("Segmented", () => {
  test("renders a radiogroup and selects an option", async () => {
    const onChange = vi.fn();
    const options = [
      { value: "month", label: "Month" },
      { value: "year", label: "Year" },
    ];
    render(<Segmented options={options} value="month" onChange={onChange} />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Year" }));
    expect(onChange).toHaveBeenCalledWith("year");
  });
});

describe("Stepper", () => {
  test("renders each step label", () => {
    render(<Stepper steps={["Location", "Paycheck", "History"]} current={1} />);
    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByText("Paycheck")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
  });
});

describe("Drawer", () => {
  test("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Details">
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { name: "Details" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Details">
        <p>Body</p>
      </Drawer>,
    );
    const backdrop = document.querySelector('[data-testid="drawer-backdrop"]');
    expect(backdrop).not.toBeNull();
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("focuses the close button on open", () => {
    render(
      <Drawer open onClose={vi.fn()} title="Details">
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.getByRole("button", { name: /close/i })).toHaveFocus();
  });

  test("renders nothing when closed", () => {
    render(
      <Drawer open={false} onClose={vi.fn()} title="Details">
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  test("renders default emoji, title and body", () => {
    render(<EmptyState title="No bonuses yet" body="Add your first bank to get started." />);
    expect(screen.getByText("🐑")).toBeInTheDocument();
    expect(screen.getByText("No bonuses yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first bank to get started.")).toBeInTheDocument();
  });
});

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("shows a toast and auto-dismisses after 3000ms", () => {
    render(<Toaster />);
    act(() => {
      toast("Saved!");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved!");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("Saved!")).not.toBeInTheDocument();
  });
});

describe("BankAvatar", () => {
  test("shows initials from the first two words", () => {
    render(<BankAvatar name="Wells Fargo" />);
    expect(screen.getByText("WF")).toBeInTheDocument();
  });
});

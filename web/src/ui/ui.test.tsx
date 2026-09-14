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
  cn,
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

  test("padded={false} drops the default padding", () => {
    render(<Card padded={false}>Content</Card>);
    expect(screen.getByText("Content")).not.toHaveClass("p-5");
  });

  test("tone swaps the surface colour, and a className override wins over it", () => {
    const { rerender } = render(<Card tone="ink">Content</Card>);
    expect(screen.getByText("Content")).toHaveClass("bg-ink");

    rerender(<Card className="bg-mint">Content</Card>);
    const el = screen.getByText("Content");
    // twMerge resolves the conflict in favour of the caller instead of leaving both
    // background utilities on the element.
    expect(el).toHaveClass("bg-mint");
    expect(el).not.toHaveClass("bg-surface");
  });
});

describe("cn", () => {
  test("the later of two conflicting utilities wins", () => {
    expect(cn("p-5 bg-surface", "bg-ink")).toBe("p-5 bg-ink");
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

  test("renders a range when min and max differ", () => {
    render(<MoneyText value={7000} range={[1500, 7000]} />);
    expect(screen.getByText("$1,500–$7,000")).toBeInTheDocument();
  });

  test("renders the single value when min equals max or min is missing", () => {
    const { rerender } = render(<MoneyText value={500} range={[500, 500]} />);
    expect(screen.getByText("$500")).toBeInTheDocument();

    rerender(<MoneyText value={500} range={[null, 500]} />);
    expect(screen.getByText("$500")).toBeInTheDocument();
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

  test("wires aria-describedby from help text to the child control", () => {
    render(
      <Field label="State" htmlFor="state" help="Pick your home state">
        <input id="state" />
      </Field>,
    );
    expect(screen.getByLabelText("State")).toHaveAttribute("aria-describedby", "state-help");
  });

  test("wires aria-describedby from an error to the child control", () => {
    render(
      <Field label="State" htmlFor="state" error="Required">
        <input id="state" />
      </Field>,
    );
    expect(screen.getByLabelText("State")).toHaveAttribute("aria-describedby", "state-error");
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

  test("aria-activedescendant tracks the highlighted option on ArrowDown", async () => {
    render(<Select options={options} value="" onChange={vi.fn()} searchable />);
    const combobox = screen.getByRole("combobox");
    expect(combobox).toHaveAttribute("aria-haspopup", "listbox");

    await userEvent.click(combobox);
    await userEvent.keyboard("{ArrowDown}");

    // The first ArrowDown moves the highlight from index 0 to index 1.
    const listbox = screen.getByRole("listbox");
    const highlighted = within(listbox).getAllByRole("option")[1];
    expect(highlighted).toHaveAttribute("id");
    expect(combobox).toHaveAttribute("aria-activedescendant", highlighted.id);
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

  test("typing past max in the numeric input commits the clamped max on blur", () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={20000} step={100} value={5000} onChange={onChange} />);
    const spin = screen.getByRole("spinbutton");
    fireEvent.change(spin, { target: { value: "99999" } });
    fireEvent.blur(spin);
    expect(onChange).toHaveBeenCalledWith(20000);
  });

  test("typing a non-numeric value never calls onChange with NaN", () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={20000} step={100} value={5000} onChange={onChange} />);
    const spin = screen.getByRole("spinbutton");
    fireEvent.change(spin, { target: { value: "abc" } });
    fireEvent.blur(spin);
    for (const call of onChange.mock.calls) {
      expect(Number.isNaN(call[0])).toBe(false);
    }
    expect(onChange).not.toHaveBeenCalled();
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

  test("clicking the visible label toggles it too", async () => {
    render(<ControlledToggle />);
    const switchEl = screen.getByRole("switch", { name: "Autopilot" });
    await userEvent.click(screen.getByText("Autopilot"));
    expect(switchEl).toHaveAttribute("aria-checked", "true");
  });
});

describe("Segmented", () => {
  const monthYear = [
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
  ];

  test("renders a radiogroup and selects an option", async () => {
    const onChange = vi.fn();
    render(<Segmented options={monthYear} value="month" onChange={onChange} />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Year" }));
    expect(onChange).toHaveBeenCalledWith("year");
  });

  test("names the radiogroup from aria-label", () => {
    render(<Segmented options={monthYear} value="month" onChange={vi.fn()} aria-label="Horizon" />);
    expect(screen.getByRole("radiogroup", { name: "Horizon" })).toBeInTheDocument();
  });

  test("only the selected option is a tab stop", () => {
    render(<Segmented options={monthYear} value="month" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Month" })).toHaveAttribute("tabIndex", "0");
    expect(screen.getByRole("radio", { name: "Year" })).toHaveAttribute("tabIndex", "-1");
  });

  test("ArrowRight moves selection and focus to the next option", async () => {
    const onChange = vi.fn();
    render(<Segmented options={monthYear} value="month" onChange={onChange} />);
    screen.getByRole("radio", { name: "Month" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("year");
    expect(screen.getByRole("radio", { name: "Year" })).toHaveFocus();
  });

  test("a disabled option does not call onChange when clicked", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        options={[
          { value: "month", label: "Month" },
          { value: "year", label: "Year", disabled: true, title: "Needs setup" },
        ]}
        value="month"
        onChange={onChange}
      />,
    );
    const disabledOption = screen.getByRole("radio", { name: "Year" });
    expect(disabledOption).toHaveAttribute("title", "Needs setup");

    await userEvent.click(disabledOption);
    expect(onChange).not.toHaveBeenCalled();
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

  test("locks page scroll while open and restores it on close", () => {
    const { rerender } = render(
      <Drawer open onClose={vi.fn()} title="Details">
        <p>Body</p>
      </Drawer>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Drawer open={false} onClose={vi.fn()} title="Details">
        <p>Body</p>
      </Drawer>,
    );
    expect(document.body.style.overflow).toBe("");
  });

  test("the body is its own scroll container so the actions stay reachable", () => {
    render(
      <Drawer open onClose={vi.fn()} title="Details">
        <p>Body</p>
      </Drawer>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveClass("flex", "flex-col");
    const body = screen.getByText("Body").parentElement as HTMLElement;
    expect(body).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
  });

  function DrawerHarness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open drawer</button>
        <Drawer open={open} onClose={() => setOpen(false)} title="Details">
          <p>Body</p>
        </Drawer>
      </>
    );
  }

  test("restores focus to the triggering element after Escape closes it", async () => {
    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", { name: "Open drawer" });
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: /close/i })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  test("Tab from the last focusable element wraps to the first", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Details">
        <button>Inside action</button>
      </Drawer>,
    );
    const closeButton = screen.getByRole("button", { name: /close/i });
    const insideAction = screen.getByRole("button", { name: "Inside action" });

    insideAction.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(insideAction).toHaveFocus();
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

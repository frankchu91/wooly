import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Onboarding } from "./Onboarding";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <DataContext.Provider value={dataset}>
        <Routes>
          <Route path="/start" element={<Onboarding />} />
          <Route path="/plan" element={<div>plan placeholder</div>} />
        </Routes>
      </DataContext.Provider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("Onboarding", () => {
  test("Next is disabled on step 0 until a state is chosen", async () => {
    renderOnboarding();
    const next = screen.getByRole("button", { name: t.onboarding.next });
    expect(next).toBeDisabled();

    const combobox = screen.getByRole("combobox");
    await userEvent.type(combobox, "Massachusetts");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(next).toBeEnabled();
  });

  test("choosing a state then Next moves to step 1; Back returns to step 0", async () => {
    renderOnboarding();

    const combobox = screen.getByRole("combobox");
    await userEvent.type(combobox, "Massachusetts");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    await userEvent.click(screen.getByRole("button", { name: t.onboarding.next }));
    expect(
      screen.getByRole("heading", { level: 2, name: t.onboarding.paycheck.h }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t.onboarding.back }));
    expect(
      screen.getByRole("heading", { level: 2, name: t.onboarding.state.h }),
    ).toBeInTheDocument();
  });

  test("completing the wizard calls setProfile and navigates to /plan", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });

    renderOnboarding();

    const combobox = screen.getByRole("combobox");
    await user.type(combobox, "Massachusetts");
    await user.keyboard("{ArrowDown}{Enter}");
    await user.click(screen.getByRole("button", { name: t.onboarding.next }));

    // Step 1 (paycheck): move the direct-deposit slider before continuing.
    // jsdom doesn't implement the native keyboard-stepping behaviour for
    // range inputs, so the value is set directly via a change event.
    const slider = screen.getByRole("slider", { name: t.onboarding.paycheck.amount });
    fireEvent.change(slider, { target: { value: "7000" } });
    await user.click(screen.getByRole("button", { name: t.onboarding.next }));

    // Step 2 (history): finish.
    await user.click(screen.getByRole("button", { name: t.onboarding.finish }));

    expect(screen.getByRole("status")).toHaveTextContent(t.onboarding.loading);

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    const profile = useStore.getState().profile;
    expect(profile?.state).toBe("MA");
    expect(profile?.monthlyDD).toBe(7000);
    expect(screen.getByTestId("location")).toHaveTextContent("/plan");

    vi.useRealTimers();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Toaster } from "../../ui";
import { SettingsPage } from "./SettingsPage";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();
const maProfile = { ...defaultProfile("2026-09"), state: "MA" };

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ profile: maProfile });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <DataContext.Provider value={dataset}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<div>home placeholder</div>} />
        </Routes>
      </DataContext.Provider>
      <Toaster />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  test("editing the monthly DD amount then pressing Save updates the store", async () => {
    const user = userEvent.setup();
    renderSettings();

    const amountInput = screen.getByRole("spinbutton", { name: t.onboarding.paycheck.amount });
    await user.clear(amountInput);
    await user.type(amountInput, "8000");
    await user.tab();

    await user.click(screen.getByRole("button", { name: t.common.save }));

    expect(useStore.getState().profile?.monthlyDD).toBe(8000);
    expect(await screen.findByText(t.settings.saved)).toBeInTheDocument();
  });

  test("Clear, confirmed, empties the store and navigates to /", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettings();

    await user.click(screen.getByRole("button", { name: t.settings.clear }));

    expect(useStore.getState().profile).toBeNull();
    expect(useStore.getState().skippedIds).toEqual([]);
    expect(useStore.getState().tracker).toEqual([]);
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  test("Clear, declined, leaves the store untouched", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSettings();

    await user.click(screen.getByRole("button", { name: t.settings.clear }));

    expect(useStore.getState().profile).toEqual(maProfile);
    expect(screen.getByTestId("location")).toHaveTextContent("/settings");
  });

  test("importing invalid JSON shows the import error toast", async () => {
    const user = userEvent.setup();
    renderSettings();

    const file = new File(["{bad"], "x.json", { type: "application/json" });
    await user.upload(screen.getByLabelText(t.settings.importBtn), file);

    expect(await screen.findByText(t.settings.importError)).toBeInTheDocument();
    // The store is untouched by a rejected import.
    expect(useStore.getState().profile).toEqual(maProfile);
  });

  test("importing a valid export restores the profile", async () => {
    const user = userEvent.setup();
    const exported = useStore.getState().exportJSON();
    // Swap in a different profile so the import is verifiably what restores MA.
    useStore.setState({ profile: { ...maProfile, state: "CA" } });
    renderSettings();

    const file = new File([exported], "woolly-export.json", { type: "application/json" });
    await user.upload(screen.getByLabelText(t.settings.importBtn), file);

    expect(await screen.findByText(t.settings.imported)).toBeInTheDocument();
    expect(useStore.getState().profile?.state).toBe("MA");
  });

  test("does not render the onboarding skip button", () => {
    renderSettings();

    expect(screen.queryByRole("button", { name: t.onboarding.skip })).not.toBeInTheDocument();
  });

  test("the state combobox's listbox is not open on mount", () => {
    renderSettings();

    const combobox = screen.getByRole("combobox", { name: t.onboarding.state.h });
    expect(combobox).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

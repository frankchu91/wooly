import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Landing } from "./Landing";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "", bonuses: fixture };
const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <DataContext.Provider value={dataset}>
        <Landing />
      </DataContext.Provider>
    </MemoryRouter>,
  );
}

describe("Landing", () => {
  test("renders the h1 and a primary CTA linking to /start", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 1, name: t.landing.h1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.landing.cta })).toHaveAttribute("href", "/start");
  });

  test("shows the welcome-back CTA linking to /plan when a profile exists", () => {
    useStore.setState({ profile: defaultProfile("2026-09") });
    renderLanding();
    expect(
      screen.getByRole("heading", { level: 1, name: t.landing.welcomeBack }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.landing.viewPlan })).toHaveAttribute("href", "/plan");
  });
});

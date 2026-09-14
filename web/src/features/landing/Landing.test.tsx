import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test } from "vitest";

import { DataContext } from "../../data/DataContext";
import { fixture } from "../../data/fixture";
import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { DOC_URL } from "../../links";
import { useStore } from "../../state/store";
import { dateLabel } from "../../ui";
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

  test("offers a re-plan link to the wizard beside the welcome-back CTA", () => {
    useStore.setState({ profile: defaultProfile("2026-09") });
    renderLanding();
    expect(screen.getByRole("link", { name: t.landing.viewPlan })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: t.landing.replan })).toHaveAttribute("href", "/start");
  });

  test("hides the re-plan link when there is no profile to rebuild", () => {
    renderLanding();
    expect(screen.queryByRole("link", { name: t.landing.replan })).not.toBeInTheDocument();
  });

  describe("latest on Doctor of Credit", () => {
    test("lists the offers with a post_modified date, newest first", () => {
      renderLanding();

      const section = screen.getByRole("region", { name: t.landing.latest.title });
      expect(within(section).getByText(t.landing.latest.sub)).toBeInTheDocument();

      const updated = fixture.filter((bonus) => bonus.post_modified !== null);
      expect(updated).toHaveLength(3);

      const headings = within(section)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent);
      expect(headings).toEqual([
        "Chase $400 Checking Bonus",
        "US Bank $450 Checking Bonus",
        "Wells Fargo $500 Checking Bonus",
      ]);
    });

    test("stamps each card with its updated date and both ways in", () => {
      renderLanding();
      const section = screen.getByRole("region", { name: t.landing.latest.title });

      expect(
        within(section).getByText(t.landing.latest.updated(dateLabel("2026-09-12"))),
      ).toBeInTheDocument();

      const docLinks = within(section).getAllByRole("link", { name: t.bonuses.openDoc });
      expect(docLinks[0]).toHaveAttribute("href", "https://example.com/chase-400");
      expect(docLinks[0]).toHaveAttribute("rel", "noopener noreferrer");

      const detailLinks = within(section).getAllByRole("link", { name: t.landing.latest.details });
      expect(detailLinks[0]).toHaveAttribute("href", "/bonuses?bonus=chase-400");
    });

    test("footer links to every offer and to the source list", () => {
      renderLanding();
      const section = screen.getByRole("region", { name: t.landing.latest.title });

      expect(
        within(section).getByRole("link", { name: t.landing.latest.all(fixture.length) }),
      ).toHaveAttribute("href", "/bonuses");
      expect(within(section).getByRole("link", { name: t.landing.latest.source })).toHaveAttribute(
        "href",
        DOC_URL,
      );
    });

    test("is hidden entirely when no offer has been modified", () => {
      render(
        <MemoryRouter>
          <DataContext.Provider
            value={{
              ...dataset,
              bonuses: fixture.map((bonus) => ({ ...bonus, post_modified: null })),
            }}
          >
            <Landing />
          </DataContext.Provider>
        </MemoryRouter>,
      );
      expect(screen.queryByText(t.landing.latest.title)).not.toBeInTheDocument();
    });
  });
});

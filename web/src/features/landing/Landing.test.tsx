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

/** The hero, which repeats the page's CTAs at the top. */
function hero() {
  return screen.getByRole("region", {
    name: screen.getByRole("heading", { level: 1 }).textContent ?? "",
  });
}

describe("Landing", () => {
  test("renders the h1 and a primary CTA linking to /start", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 1, name: t.landing.h1 })).toBeInTheDocument();
    expect(within(hero()).getByRole("link", { name: t.landing.cta })).toHaveAttribute(
      "href",
      "/start",
    );
  });

  test("leads with one sentence of sub-copy, not three paragraphs", () => {
    renderLanding();
    expect(within(hero()).getByText(t.landing.sub)).toBeInTheDocument();
  });

  test("shows the welcome-back CTA linking to /plan when a profile exists", () => {
    useStore.setState({ profile: defaultProfile("2026-09") });
    renderLanding();
    expect(
      screen.getByRole("heading", { level: 1, name: t.landing.welcomeBack }),
    ).toBeInTheDocument();
    expect(within(hero()).getByRole("link", { name: t.landing.viewPlan })).toHaveAttribute(
      "href",
      "/plan",
    );
  });

  test("offers a re-plan link to the wizard beside the welcome-back CTA", () => {
    useStore.setState({ profile: defaultProfile("2026-09") });
    renderLanding();
    expect(screen.getByRole("link", { name: t.landing.replan })).toHaveAttribute("href", "/start");
  });

  test("hides the re-plan link when there is no profile to rebuild", () => {
    renderLanding();
    expect(screen.queryByRole("link", { name: t.landing.replan })).not.toBeInTheDocument();
  });

  describe("stat strip", () => {
    test("counts the offers in the provided dataset and dates the data", () => {
      renderLanding();
      const strip = hero();

      expect(within(strip).getByText(t.landing.stats.offers)).toBeInTheDocument();
      expect(within(strip).getByText(String(fixture.length))).toBeInTheDocument();

      expect(within(strip).getByText(t.landing.stats.updated)).toBeInTheDocument();
      expect(within(strip).getByText(dateLabel("2026-09-13T00:00:00Z"))).toBeInTheDocument();

      expect(within(strip).getByText(t.landing.stats.biggest)).toBeInTheDocument();
      expect(within(strip).getByText("$750")).toBeInTheDocument();
    });

    test("drops the date row when the dataset has no generated_at", () => {
      render(
        <MemoryRouter>
          <DataContext.Provider value={{ ...dataset, generated_at: null }}>
            <Landing />
          </DataContext.Provider>
        </MemoryRouter>,
      );
      expect(screen.queryByText(t.landing.stats.updated)).not.toBeInTheDocument();
    });
  });

  test("lists the three how-it-works steps as rows", () => {
    renderLanding();
    const section = screen.getByRole("region", { name: t.landing.howTitle });
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(t.landing.how.map((step) => step.title));
    expect(within(section).getByText("01")).toBeInTheDocument();
  });

  test("closes with the guide link and a single CTA", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: t.landing.learnCta })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(screen.getByText(t.landing.learn, { exact: false })).toBeInTheDocument();
    // Hero and closing row: the CTA appears exactly twice on the page.
    expect(screen.getAllByRole("link", { name: t.landing.cta })).toHaveLength(2);
  });

  test("closes with a CTA to the plan when a profile exists", () => {
    useStore.setState({ profile: defaultProfile("2026-09") });
    renderLanding();
    expect(screen.getAllByRole("link", { name: t.landing.viewPlan })[1]).toHaveAttribute(
      "href",
      "/plan",
    );
  });

  test("no longer carries the long-form explainer, needs list or FAQ", () => {
    renderLanding();
    expect(screen.queryByText(t.about.faq.title)).not.toBeInTheDocument();
    expect(screen.queryByText(t.about.faq.items[0].q)).not.toBeInTheDocument();
    expect(screen.queryByText(t.about.what.title)).not.toBeInTheDocument();
    expect(screen.queryByText(t.about.need.title)).not.toBeInTheDocument();
    expect(screen.queryByText(t.about.what.example.title)).not.toBeInTheDocument();
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

    test("stamps each row with its updated date and both ways in", () => {
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

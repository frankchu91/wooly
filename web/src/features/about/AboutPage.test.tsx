import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test } from "vitest";

import { defaultProfile } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { AboutPage } from "./AboutPage";

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

function renderAbout() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  );
}

test("opens with the title and a one-line standfirst", () => {
  renderAbout();
  expect(screen.getByRole("heading", { level: 1, name: t.about.title })).toBeInTheDocument();
  expect(screen.getByText(t.about.standfirst)).toBeInTheDocument();
});

test("explains what a bank bonus is in prose", () => {
  renderAbout();
  expect(screen.getByRole("heading", { level: 2, name: t.about.what.title })).toBeInTheDocument();
  for (const para of t.about.what.paras) {
    expect(screen.getByText(para)).toBeInTheDocument();
  }
});

test("shows the worked example with every label", () => {
  renderAbout();
  const section = screen.getByRole("region", { name: t.about.what.title });
  expect(
    within(section).getByRole("heading", { level: 3, name: t.about.what.example.title }),
  ).toBeInTheDocument();
  for (const [label, value] of t.about.what.example.rows) {
    expect(within(section).getByText(label)).toBeInTheDocument();
    expect(within(section).getByText(value)).toBeInTheDocument();
  }
});

test("lists what a newcomer needs", () => {
  renderAbout();
  const section = screen.getByRole("region", { name: t.about.need.title });
  for (const item of t.about.need.items) {
    expect(within(section).getByText(item.title)).toBeInTheDocument();
    expect(within(section).getByText(item.body)).toBeInTheDocument();
  }
});

test("renders every FAQ question, with the answers in the DOM while collapsed", () => {
  renderAbout();
  const section = screen.getByRole("region", { name: t.about.faq.title });

  expect(within(section).getAllByRole("group")).toHaveLength(8);
  for (const item of t.about.faq.items) {
    expect(within(section).getByText(item.q)).toBeInTheDocument();
  }

  // <details> keeps its content mounted when closed, so the answer is findable.
  expect(within(section).getByText(t.about.faq.items[0].a)).toBeInTheDocument();
});

test("closes with a CTA to the wizard", () => {
  renderAbout();
  expect(screen.getByRole("link", { name: t.landing.cta })).toHaveAttribute("href", "/start");
});

test("closes with a CTA to the plan when a profile exists", () => {
  useStore.setState({ profile: defaultProfile("2026-09") });
  renderAbout();
  expect(screen.getByRole("link", { name: t.landing.viewPlan })).toHaveAttribute("href", "/plan");
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { fixture } from "./data/fixture";
import { t } from "./i18n/en";
import { errorElement, rootRoute } from "./router";
import { useStore } from "./state/store";

vi.mock("./data/useBonuses", () => ({
  useBonuses: () => ({
    data: { generated_at: "2026-09-13T00:00:00Z", source: "s", bonuses: fixture },
    error: null,
    retry: () => {},
  }),
}));

function renderAt(path: string, extraChildren: RouteObject[] = []) {
  const routes: RouteObject[] = [
    { ...rootRoute, children: [...(rootRoute.children ?? []), ...extraChildren] },
  ];
  const mem = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={mem} />);
}

function Boom(): never {
  throw new Error("kaboom");
}

test("renders landing route", async () => {
  renderAt("/");
  expect(await screen.findByRole("heading", { level: 1, name: t.landing.h1 })).toBeInTheDocument();
});

test("an unknown path renders the not-found state inside the shell", async () => {
  renderAt("/nope");

  expect(await screen.findByText(t.errors.notFound)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: t.errors.home })).toHaveAttribute("href", "/");
  // Still inside the persistent shell, so the user can navigate away.
  expect(screen.getAllByRole("link", { name: t.nav.plan }).length).toBeGreaterThan(0);
});

test("a route that throws renders the error state with a way out", async () => {
  // React Router logs the caught error; keep the test output readable.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  renderAt("/boom", [{ path: "boom", element: <Boom />, errorElement }]);

  expect(await screen.findByText(t.errors.title)).toBeInTheDocument();
  expect(screen.getByText(t.errors.body)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: t.errors.home })).toHaveAttribute("href", "/");
  consoleError.mockRestore();
});

test("Clear local data wipes the saved blob and goes home", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup();
  localStorage.setItem("woolly.v1", JSON.stringify({ state: { profile: null }, version: 1 }));
  renderAt("/boom", [{ path: "boom", element: <Boom />, errorElement }]);

  await user.click(await screen.findByRole("button", { name: t.errors.clear }));

  expect(localStorage.getItem("woolly.v1")).toBeNull();
  expect(useStore.getState().profile).toBeNull();
  expect(await screen.findByRole("heading", { level: 1, name: t.landing.h1 })).toBeInTheDocument();
  consoleError.mockRestore();
});

import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { fixture } from "./data/fixture";
import { t } from "./i18n/en";
import { router } from "./router";

vi.mock("./data/useBonuses", () => ({
  useBonuses: () => ({
    data: { generated_at: "2026-09-13T00:00:00Z", source: "s", bonuses: fixture },
    error: null,
    retry: () => {},
  }),
}));

test("renders landing route", async () => {
  const mem = createMemoryRouter(router.routes, { initialEntries: ["/"] });
  render(<RouterProvider router={mem} />);
  expect(await screen.findByRole("heading", { level: 1, name: t.landing.h1 })).toBeInTheDocument();
});

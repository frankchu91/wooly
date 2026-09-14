import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { test, vi } from "vitest";

import { t } from "../../i18n/en";
import { Layout } from "./Layout";

vi.mock("../../data/useBonuses", () => ({
  useBonuses: () => ({ data: null, error: "bad dataset", retry: vi.fn() }),
}));

test("keeps the header (with a working brand link) and shows a retry button when useBonuses errors", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>child</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole("link", { name: t.brand })).toHaveAttribute("href", "/");
  expect(screen.getByRole("button", { name: t.common.retry })).toBeInTheDocument();
});

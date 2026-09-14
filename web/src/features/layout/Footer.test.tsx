import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { t } from "../../i18n/en";
import { DOC_URL, GITHUB_URL } from "../../links";
import { Footer } from "./Footer";

test("points returning users back at the introduction, and keeps the source links", () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );

  expect(screen.getByRole("link", { name: t.footer.about })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: t.footer.source })).toHaveAttribute("href", DOC_URL);
  expect(screen.getByRole("link", { name: t.footer.github })).toHaveAttribute("href", GITHUB_URL);
  expect(screen.getByText(t.footer.disclaimer)).toBeInTheDocument();
});

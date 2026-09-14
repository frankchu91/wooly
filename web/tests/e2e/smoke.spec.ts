import { test, expect } from "@playwright/test";

test("landing → wizard → plan", async ({ page }) => {
  await page.goto("/");
  // Two CTAs share this label now (hero and the closing row); the hero one is the entry.
  await page.getByRole("link", { name: "Plan my bonuses" }).first().click();
  await page.getByPlaceholder("Search your state").fill("Massachusetts");
  await page.getByRole("option", { name: "Massachusetts" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Build my plan" }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 10000 });
  await expect(page.getByText("Projected earnings")).toBeVisible();
  await expect(page.locator("li", { hasText: "DD" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Track this plan" }).click();
  await expect(page).toHaveURL(/\/tracker/, { timeout: 10000 });

  // The full five-stage pipeline is on screen.
  for (const stage of ["Planned", "Opened", "Requirements done", "Bonus received", "Closed"]) {
    await expect(page.getByRole("heading", { level: 3, name: stage })).toBeVisible();
  }

  // The spreadsheet lives on its own tab now.
  await page.getByRole("link", { name: "Ledger", exact: true }).first().click();
  await expect(page).toHaveURL(/\/ledger/, { timeout: 10000 });
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("Earned")).toBeVisible();
});

test("bonuses page shows the offer count", async ({ page }) => {
  await page.goto("/bonuses");
  await expect(page.getByText(/^\d+ offers$/)).toBeVisible();
});

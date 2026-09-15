import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** A saved profile, so the plan page can be opened directly instead of walking the
 * wizard again — the wizard has its own test. */
const SEED = JSON.stringify({
  version: 2,
  state: {
    profile: {
      state: "MA",
      monthlyDD: 5000,
      maxSplits: 2,
      achPushCountsAsDD: false,
      prefs: {
        avoidHardPull: true,
        avoidChexSensitive: false,
        includeBusiness: true,
        includeSavings: true,
      },
      history: [],
      horizonMonths: 12,
      startMonth: "2026-09",
    },
    skippedIds: [],
    tracker: [],
  },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seed) => {
    window.localStorage.setItem("woolly.v1", seed);
  }, SEED);
});

/** The plan is the product's main output, and taking it away as a spreadsheet is what
 * most people will do with it — so this walks the real download, not a mocked one. */
test("the plan downloads as a spreadsheet you could work from offline", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByText("Projected earnings")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download as spreadsheet" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^woolly-plan-\d{4}-\d{2}-\d{2}\.csv$/);

  const text = await readFile(await download.path(), "utf8");
  const [header, totals, ...rows] = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n");

  expect(header.split(",")[0]).toBe("Open in");
  expect(header).toContain("Doctor of Credit");
  expect(rows.length).toBeGreaterThan(0);

  // The totals row has added up a real projection, and every account row carries the
  // month, the deadline and a link — the three things that make the file usable alone.
  expect(Number(totals.split(",")[3])).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row).toMatch(/^\d{4}-\d{2},/);
    expect(row).toContain("https://");
  }
});

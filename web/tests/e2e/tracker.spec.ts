import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import Excel from "exceljs";

/** Opens a downloaded workbook and returns its first sheet. */
async function readSheet(path: string) {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook.getWorksheet(1)!;
}

/** Column number by header text: keys are an authoring-time convenience and are not
 * written into the file, so a read-back sheet can only be addressed by its headers. */
function col(sheet: Excel.Worksheet, header: string): number {
  const headers = sheet.getRow(1).values as (string | undefined)[];
  const index = headers.indexOf(header);
  if (index < 1) throw new Error(`no column "${header}"`);
  return index;
}

const STAGES = ["Planned", "Opened", "Requirements done", "Bonus received", "Closed"];

/** A tracker with one account in four of the five stages, written straight to the store's
 * localStorage key so the walk starts where the walkthrough did. */
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
    tracker: [
      {
        id: "wells-fargo-500-checking-bonus",
        bonusId: "wells-fargo-500-checking-bonus",
        status: "opened",
        dates: { opened: "2026-09-01" },
        openMonth: "2026-09",
        conditionsDone: [],
      },
      {
        id: "bank-of-america-100-500-checking-bonus",
        bonusId: "bank-of-america-100-500-checking-bonus",
        status: "requirements_met",
        dates: { opened: "2026-08-10", requirements_met: "2026-09-05" },
        openMonth: "2026-08",
        conditionsDone: [],
      },
      {
        id: "chime-earn-10000-swagbucks-for-opening-a-new-account-receiving-a-direct-deposit",
        bonusId: "chime-earn-10000-swagbucks-for-opening-a-new-account-receiving-a-direct-deposit",
        status: "received",
        dates: { opened: "2026-06-01", requirements_met: "2026-07-02", received: "2026-08-20" },
        openMonth: "2026-06",
        conditionsDone: [],
        bonusReceived: 425,
      },
      {
        id: "capital-one-500-1000-business-checking-bonus",
        bonusId: "capital-one-500-1000-business-checking-bonus",
        status: "planned",
        dates: {},
        openMonth: "2026-10",
        conditionsDone: [],
      },
    ],
  },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((seed) => {
    window.localStorage.setItem("woolly.v1", seed);
  }, SEED);
});

/** The page itself must never scroll sideways — only the ledger and the kanban row do,
 * each inside its own container. */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

test("the whole pipeline is on screen at 1280, with no page-level sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tracker");

  await expect(page.getByRole("heading", { name: "My bonuses" })).toBeVisible();

  for (const stage of STAGES) {
    const heading = page.getByRole("heading", { level: 3, name: stage });
    await expect(heading).toBeVisible();
    // Visible is not enough: a column parked off the right edge of its scroller still
    // counts as visible to Playwright.
    const box = await heading.boundingBox();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1280);
  }

  await expectNoPageOverflow(page);
});

test("the tracker fits a phone without the page scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await page.goto("/tracker");

  await expect(page.getByRole("heading", { name: "My bonuses" })).toBeVisible();
  await expectNoPageOverflow(page);
});

test("the item drawer separates the checklist from the notes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tracker?item=wells-fargo-500-checking-bonus");

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: /Wells Fargo/ })).toBeVisible();

  // Every box is a requirement, and there are few enough to read.
  const boxes = drawer.getByRole("checkbox");
  const count = await boxes.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(6);

  // The offer's fine print lives behind a closed disclosure, not among the tasks.
  const notes = drawer.locator("details");
  await expect(notes).toHaveCount(1);
  await expect(notes.locator("summary")).toHaveText(/^Also note \(\d+\)$/);
  await expect(notes.locator("li").first()).toBeHidden();
  await notes.locator("summary").click();
  await expect(notes.locator("li").first()).toBeVisible();
});

test("a ledger row opens its drawer from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/ledger");

  const offer = page.getByRole("button", { name: "Open Wells Fargo $500 Checking Bonus" });
  await offer.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/item=wells-fargo-500-checking-bonus/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the ledger downloads as a spreadsheet the browser can actually save", async ({ page }) => {
  await page.goto("/ledger");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download as Excel" }).first().click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^woolly-ledger-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const sheet = await readSheet(await download.path());
  const header = sheet.getRow(1).values as string[];
  expect(header).toContain("Bank");
  // The four seeded accounts, and a totals row that sums the headline bonuses.
  expect(sheet.rowCount).toBe(2 + 4);
  expect(String((sheet.getCell("D2").value as { formula: string }).formula)).toMatch(/^SUM\(/);
  expect(sheet.getCell(3, col(sheet, "Stage")).dataValidation?.type).toBe("list");
  const banks = [3, 4, 5, 6].map((r) => sheet.getCell(r, 1).value);
  expect(banks).toContain("Wells Fargo");
});

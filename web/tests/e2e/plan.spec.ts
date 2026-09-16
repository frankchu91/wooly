import { test, expect } from "@playwright/test";
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
    page.getByRole("button", { name: "Download as Excel" }).first().click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^woolly-plan-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const sheet = await readSheet(await download.path());
  const header = sheet.getRow(1).values as string[];
  expect(header).toContain("Open in");
  expect(header).toContain("Opened on");
  expect(header).toContain("Status");
  expect(sheet.rowCount).toBeGreaterThan(2);

  // Row 2 totals the data rows; every account row has a date to work from, a formula
  // for its deadline, a status dropdown, and a link. That is what makes the file usable
  // on its own.
  expect(String((sheet.getCell("D2").value as { formula: string }).formula)).toMatch(/^SUM\(/);
  for (let r = 3; r <= sheet.rowCount; r += 1) {
    expect(sheet.getCell(r, col(sheet, "Opened on")).value).toBeInstanceOf(Date);
    expect(
      (sheet.getCell(r, col(sheet, "Direct deposit by")).value as { formula?: string }).formula,
    ).toContain("IF(");
    expect(sheet.getCell(r, col(sheet, "Status")).dataValidation?.type).toBe("list");
  }
});

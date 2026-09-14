import { describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import type { Bonus, TrackedItem } from "../../engine/types";
import { t } from "../../i18n/en";
import {
  ddDeadlineFor,
  ddDeadlineIsUrgent,
  requirementsProgress,
  safeCloseFor,
  sortForLedger,
  stageContextLine,
} from "./trackerModel";

const bonusById = (id: string): Bonus => fixture.find((b) => b.id === id) as Bonus;
const today = new Date(2026, 8, 14);

function item(overrides: Partial<TrackedItem> = {}): TrackedItem {
  return {
    id: overrides.bonusId ?? "wells-fargo-500",
    bonusId: "wells-fargo-500",
    status: "planned",
    dates: {},
    openMonth: "2026-09",
    conditionsDone: [],
    ...overrides,
  };
}

describe("requirementsProgress", () => {
  test("counts ticked conditions against the checklist, not the notes", () => {
    // wells-fargo-500 records three conditions, but "new consumer checking customers
    // only" is a note about the offer — the denominator is the two real tasks.
    const progress = requirementsProgress(
      item({ conditionsDone: ["wf-dd", "wf-keep-open"] }),
      bonusById("wells-fargo-500"),
    );
    expect(progress).toEqual({ done: 2, total: 2 });
  });

  test("ids ticked off a checklist that no longer holds them are ignored", () => {
    // "wf-new-customer" is a note now, and "gone" was reworded away by a later scrape;
    // neither may inflate the numerator past the denominator.
    const progress = requirementsProgress(
      item({ conditionsDone: ["wf-dd", "wf-new-customer", "gone"] }),
      bonusById("wells-fargo-500"),
    );
    expect(progress).toEqual({ done: 1, total: 2 });
  });

  test("counts synthesised conditions too", () => {
    // us-bank-450 records no conditions, so the checklist is the synthesised DD alone.
    const progress = requirementsProgress(
      item({ bonusId: "us-bank-450", conditionsDone: ["synth-dd"] }),
      bonusById("us-bank-450"),
    );
    expect(progress).toEqual({ done: 1, total: 1 });
  });

  test("a bonus that has dropped out of the dataset has nothing to tick", () => {
    expect(requirementsProgress(item(), undefined)).toEqual({ done: 0, total: 0 });
  });
});

describe("ddDeadlineFor", () => {
  test("is the open date plus the offer's deadline", () => {
    expect(
      ddDeadlineFor(item({ dates: { opened: "2026-09-04" } }), bonusById("wells-fargo-500")),
    ).toBe("2026-12-03");
  });

  test("is null before the account is opened, and for a no-DD offer", () => {
    expect(ddDeadlineFor(item(), bonusById("wells-fargo-500"))).toBeNull();
    expect(
      ddDeadlineFor(
        item({ bonusId: "fourfront-400", dates: { opened: "2026-09-04" } }),
        bonusById("fourfront-400"),
      ),
    ).toBeNull();
  });
});

describe("ddDeadlineIsUrgent", () => {
  test("is true only while the item is open and the deadline is inside the warning window", () => {
    // Opened 2026-06-20 + 90 days = 2026-09-18, four days out.
    const urgent = item({ status: "opened", dates: { opened: "2026-06-20" } });
    expect(ddDeadlineIsUrgent(urgent, bonusById("wells-fargo-500"), today)).toBe(true);

    const relaxed = item({ status: "opened", dates: { opened: "2026-09-04" } });
    expect(ddDeadlineIsUrgent(relaxed, bonusById("wells-fargo-500"), today)).toBe(false);

    // The same dates, but the requirements are already done — nothing left to miss.
    const doneWithIt = item({ status: "requirements_met", dates: { opened: "2026-06-20" } });
    expect(ddDeadlineIsUrgent(doneWithIt, bonusById("wells-fargo-500"), today)).toBe(false);
  });
});

describe("safeCloseFor", () => {
  test("prefers hold_days and says so", () => {
    const result = safeCloseFor(
      item({ dates: { opened: "2026-09-04" } }),
      bonusById("wells-fargo-500"),
    );
    expect(result).toEqual({
      date: "2027-03-03",
      reason: t.tracker.safeClose.reason.keepOpen(180),
    });
  });

  test("falls back to the ETF window, then to the default", () => {
    // chase-400 has no hold_days but a 180-day ETF window.
    expect(
      safeCloseFor(
        item({ bonusId: "chase-400", dates: { opened: "2026-09-04" } }),
        bonusById("chase-400"),
      )?.reason,
    ).toBe(t.tracker.safeClose.reason.etf(180));

    // us-bank-450 has neither.
    expect(
      safeCloseFor(
        item({ bonusId: "us-bank-450", dates: { opened: "2026-09-04" } }),
        bonusById("us-bank-450"),
      )?.reason,
    ).toBe(t.tracker.safeClose.reason.default);
  });

  test("is null until the account is opened", () => {
    expect(safeCloseFor(item(), bonusById("wells-fargo-500"))).toBeNull();
  });
});

describe("stageContextLine", () => {
  test("planned says which month it's planned for", () => {
    expect(
      stageContextLine(item({ openMonth: "2026-11" }), bonusById("wells-fargo-500"), today),
    ).toEqual({ text: t.tracker.plannedFor("Nov 2026"), tone: "muted" });
  });

  test("opened counts down to the DD deadline, quietly when there's time", () => {
    const context = stageContextLine(
      item({ status: "opened", dates: { opened: "2026-09-04" } }),
      bonusById("wells-fargo-500"),
      today,
    );
    expect(context.text).toBe(`${t.tracker.fields.ddBy} Dec 3, 2026 · ${t.tracker.daysLeft(80)}`);
    expect(context.tone).toBe("muted");
  });

  test("opened warns when the DD deadline is inside two weeks", () => {
    const context = stageContextLine(
      item({ status: "opened", dates: { opened: "2026-06-20" } }),
      bonusById("wells-fargo-500"),
      today,
    );
    expect(context.tone).toBe("warn");
    expect(context.text).toContain(t.tracker.daysLeft(4));
  });

  test("opened says Overdue once the deadline has passed", () => {
    expect(
      stageContextLine(
        item({ status: "opened", dates: { opened: "2026-01-01" } }),
        bonusById("wells-fargo-500"),
        today,
      ),
    ).toEqual({ text: t.tracker.overdue, tone: "warn" });
  });

  test("an opened no-DD offer falls back to the date it was opened", () => {
    expect(
      stageContextLine(
        item({ bonusId: "fourfront-400", status: "opened", dates: { opened: "2026-09-04" } }),
        bonusById("fourfront-400"),
        today,
      ),
    ).toEqual({ text: t.tracker.openedOn("Sep 4, 2026"), tone: "muted" });
  });

  test("requirements_met is waiting for the bonus", () => {
    expect(
      stageContextLine(item({ status: "requirements_met" }), bonusById("wells-fargo-500"), today),
    ).toEqual({ text: t.tracker.waitingForBonus, tone: "muted" });
  });

  test("received counts down to the earliest safe close", () => {
    const context = stageContextLine(
      item({ status: "received", dates: { opened: "2026-09-04", received: "2026-09-12" } }),
      bonusById("wells-fargo-500"),
      today,
    );
    expect(context.text).toBe(
      `${t.tracker.fields.closeAfter} Mar 3, 2027 · ${t.tracker.ledger.daysUntilClose(170)}`,
    );
  });

  test("received says it's safe to close once the window is up", () => {
    expect(
      stageContextLine(
        item({ status: "received", dates: { opened: "2025-01-01", received: "2025-03-01" } }),
        bonusById("wells-fargo-500"),
        today,
      ),
    ).toEqual({ text: t.tracker.safeToCloseNow, tone: "muted" });
  });

  test("closed says when it was closed", () => {
    expect(
      stageContextLine(
        item({ status: "closed", dates: { opened: "2026-01-01", closed: "2026-08-01" } }),
        bonusById("wells-fargo-500"),
        today,
      ),
    ).toEqual({ text: t.tracker.closedOn("Aug 1, 2026"), tone: "muted" });
  });

  test("falls back to the stage label when the date it wants is missing", () => {
    expect(stageContextLine(item({ openMonth: "" }), undefined, today).text).toBe(
      t.tracker.statuses.planned,
    );
    expect(stageContextLine(item({ status: "opened" }), undefined, today).text).toBe(
      t.tracker.statuses.opened,
    );
    expect(stageContextLine(item({ status: "received" }), undefined, today).text).toBe(
      t.tracker.statuses.received,
    );
    expect(stageContextLine(item({ status: "closed" }), undefined, today).text).toBe(
      t.tracker.statuses.closed,
    );
  });
});

describe("sortForLedger", () => {
  test("orders by stage, then by open date (falling back to the planned month)", () => {
    const items = [
      item({ bonusId: "us-bank-450", status: "received", dates: { opened: "2026-07-01" } }),
      item({ bonusId: "bmo-400", status: "planned", openMonth: "2026-11" }),
      item({ bonusId: "chase-400", status: "opened", dates: { opened: "2026-08-01" } }),
      item({ bonusId: "wells-fargo-500", status: "opened", dates: { opened: "2026-06-20" } }),
      item({ bonusId: "sofi-675", status: "planned", openMonth: "2026-09" }),
    ];

    expect(sortForLedger(items).map((i) => i.bonusId)).toEqual([
      "sofi-675",
      "bmo-400",
      "wells-fargo-500",
      "chase-400",
      "us-bank-450",
    ]);
  });

  test("leaves the caller's array untouched", () => {
    const items = [
      item({ bonusId: "us-bank-450", status: "closed" }),
      item({ bonusId: "bmo-400", status: "planned" }),
    ];
    sortForLedger(items);
    expect(items.map((i) => i.bonusId)).toEqual(["us-bank-450", "bmo-400"]);
  });
});

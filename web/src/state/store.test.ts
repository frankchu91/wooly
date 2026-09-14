import { useStore } from "./store";
import { defaultProfile } from "../engine/types";
import type { PlanItem } from "../engine/types";
import { fixture } from "../data/fixture";

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState(initial, true);
  localStorage.clear();
});

const profile = defaultProfile("2026-09");

// Minimal PlanItem builder — tests only care about `bonus.id` and `openMonth`.
const makePlanItem = (bonusId: string, openMonth = "2026-09"): PlanItem => ({
  bonus: fixture.find((b) => b.id === bonusId) ?? fixture[0],
  openMonth,
  ddSchedule: [],
  ddDeadline: "2026-12-01",
  safeCloseDate: null,
  warnings: [],
});

describe("setProfile / updateProfile", () => {
  test("setProfile replaces the profile", () => {
    useStore.getState().setProfile(profile);
    expect(useStore.getState().profile).toEqual(profile);
  });

  test("updateProfile merges a patch into the existing profile", () => {
    useStore.getState().setProfile(profile);
    useStore.getState().updateProfile({ monthlyDD: 9999 });
    expect(useStore.getState().profile?.monthlyDD).toBe(9999);
    expect(useStore.getState().profile?.state).toBe(profile.state);
  });
});

describe("skip / restore", () => {
  test("skip adds an id to skippedIds (no duplicates)", () => {
    useStore.getState().skip("wells-fargo-500");
    useStore.getState().skip("wells-fargo-500");
    expect(useStore.getState().skippedIds).toEqual(["wells-fargo-500"]);
  });

  test("restore removes an id from skippedIds", () => {
    useStore.getState().skip("wells-fargo-500");
    useStore.getState().restore("wells-fargo-500");
    expect(useStore.getState().skippedIds).toEqual([]);
  });
});

describe("trackPlan", () => {
  test("adds tracked items with status planned and empty dates", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    const tracker = useStore.getState().tracker;
    expect(tracker).toEqual([
      {
        id: "wells-fargo-500",
        bonusId: "wells-fargo-500",
        status: "planned",
        dates: {},
        openMonth: "2026-09",
        conditionsDone: [],
      },
    ]);
  });

  test("is idempotent per bonusId (does not duplicate)", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    expect(useStore.getState().tracker).toHaveLength(1);
  });

  test("adds new items alongside already-tracked ones", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500"), makePlanItem("chase-400")]);
    expect(useStore.getState().tracker.map((t) => t.bonusId)).toEqual([
      "wells-fargo-500",
      "chase-400",
    ]);
  });
});

describe("advance", () => {
  test("moves planned -> opened -> requirements_met -> received -> closed, recording each date", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);

    useStore.getState().advance("wells-fargo-500", "2026-09-01");
    let item = useStore.getState().tracker[0];
    expect(item.status).toBe("opened");
    expect(item.dates.opened).toBe("2026-09-01");

    useStore.getState().advance("wells-fargo-500", "2026-09-15");
    item = useStore.getState().tracker[0];
    expect(item.status).toBe("requirements_met");
    expect(item.dates.requirements_met).toBe("2026-09-15");

    useStore.getState().advance("wells-fargo-500", "2026-10-01");
    item = useStore.getState().tracker[0];
    expect(item.status).toBe("received");
    expect(item.dates.received).toBe("2026-10-01");

    useStore.getState().advance("wells-fargo-500", "2027-03-01");
    item = useStore.getState().tracker[0];
    expect(item.status).toBe("closed");
    expect(item.dates.closed).toBe("2027-03-01");
  });

  test("is a no-op at closed", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().advance("wells-fargo-500", "2026-09-01");
    useStore.getState().advance("wells-fargo-500", "2026-09-15");
    useStore.getState().advance("wells-fargo-500", "2026-10-01");
    useStore.getState().advance("wells-fargo-500", "2027-03-01");
    const closedItem = useStore.getState().tracker[0];

    useStore.getState().advance("wells-fargo-500", "2027-06-01");

    expect(useStore.getState().tracker[0]).toEqual(closedItem);
  });
});

describe("untrack", () => {
  test("removes a tracked item by id", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500"), makePlanItem("chase-400")]);
    useStore.getState().untrack("wells-fargo-500");
    expect(useStore.getState().tracker.map((t) => t.bonusId)).toEqual(["chase-400"]);
  });
});

describe("export / clearAll / import", () => {
  test("exportJSON -> clearAll -> importJSON restores state", () => {
    useStore.getState().setProfile(profile);
    useStore.getState().skip("wells-fargo-500");
    useStore.getState().trackPlan([makePlanItem("chase-400")]);

    const json = useStore.getState().exportJSON();

    useStore.getState().clearAll();
    expect(useStore.getState().profile).toBeNull();
    expect(useStore.getState().skippedIds).toEqual([]);
    expect(useStore.getState().tracker).toEqual([]);

    useStore.getState().importJSON(json);

    expect(useStore.getState().profile).toEqual(profile);
    expect(useStore.getState().skippedIds).toEqual(["wells-fargo-500"]);
    expect(useStore.getState().tracker).toEqual([
      {
        id: "chase-400",
        bonusId: "chase-400",
        status: "planned",
        dates: {},
        openMonth: "2026-09",
        conditionsDone: [],
      },
    ]);
  });

  test("exportJSON produces 2-space indented JSON of the persisted slice", () => {
    useStore.getState().setProfile(profile);
    const json = useStore.getState().exportJSON();
    expect(json).toBe(JSON.stringify({ profile, skippedIds: [], tracker: [] }, null, 2));
  });

  test("importJSON throws on malformed input", () => {
    expect(() => useStore.getState().importJSON("not json")).toThrow("bad import");
    expect(() => useStore.getState().importJSON(JSON.stringify({ profile: 5 }))).toThrow(
      "bad import",
    );
    expect(() =>
      useStore.getState().importJSON(JSON.stringify({ profile: null, skippedIds: [1] })),
    ).toThrow("bad import");
    expect(() =>
      useStore
        .getState()
        .importJSON(JSON.stringify({ profile: null, skippedIds: [], tracker: [{}] })),
    ).toThrow("bad import");
  });

  test("importJSON accepts a null profile", () => {
    useStore.getState().importJSON(JSON.stringify({ profile: null, skippedIds: [], tracker: [] }));
    expect(useStore.getState().profile).toBeNull();
  });

  test("importJSON normalizes a partial profile by merging it over defaults", () => {
    useStore
      .getState()
      .importJSON(
        JSON.stringify({ profile: { state: "MA", monthlyDD: 3000 }, skippedIds: [], tracker: [] }),
      );
    const imported = useStore.getState().profile;
    expect(imported?.state).toBe("MA");
    expect(imported?.monthlyDD).toBe(3000);
    expect(imported?.maxSplits).toBe(2);
    expect(imported?.horizonMonths).toBe(12);
    expect(imported?.prefs.avoidHardPull).toBe(true);
  });

  test("importJSON normalizes a tracker item missing dates and status", () => {
    useStore.getState().importJSON(
      JSON.stringify({
        profile: null,
        skippedIds: [],
        tracker: [{ id: "chase-400", bonusId: "chase-400", openMonth: "2026-09" }],
      }),
    );
    const item = useStore.getState().tracker[0];
    expect(item.dates).toEqual({});
    expect(item.status).toBe("planned");
    expect(item.conditionsDone).toEqual([]);
  });
});

describe("setStatus", () => {
  test("moves a tracked item directly to any stage, recording the date under it", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);

    useStore.getState().setStatus("wells-fargo-500", "received", "2026-11-01");

    const item = useStore.getState().tracker[0];
    expect(item.status).toBe("received");
    expect(item.dates.received).toBe("2026-11-01");
  });

  test("moving forward records only the target date, leaving earlier dates intact", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().setStatus("wells-fargo-500", "opened", "2026-09-01");

    useStore.getState().setStatus("wells-fargo-500", "received", "2026-11-01");

    const item = useStore.getState().tracker[0];
    expect(item.status).toBe("received");
    expect(item.dates.opened).toBe("2026-09-01");
    expect(item.dates.received).toBe("2026-11-01");
  });

  test("moving to an earlier stage clears dates and bonusReceived for every later stage", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().setStatus("wells-fargo-500", "opened", "2026-09-01");
    useStore.getState().setStatus("wells-fargo-500", "received", "2026-11-01");
    useStore.getState().setBonusReceived("wells-fargo-500", 500);

    useStore.getState().setStatus("wells-fargo-500", "opened", "2026-09-05");

    const item = useStore.getState().tracker[0];
    expect(item.status).toBe("opened");
    // The target date overwrites, dates for every later stage are gone, and so is the
    // recorded bonus amount — moving the pointer back doesn't mean it posted again.
    expect(item.dates.opened).toBe("2026-09-05");
    expect(item.dates.received).toBeUndefined();
    expect(item.bonusReceived).toBeUndefined();
    expect("bonusReceived" in item).toBe(false);
  });

  test("moving backward to received itself keeps bonusReceived (it isn't 'before received')", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().setStatus("wells-fargo-500", "received", "2026-11-01");
    useStore.getState().setBonusReceived("wells-fargo-500", 500);
    useStore.getState().setStatus("wells-fargo-500", "closed", "2027-05-01");

    useStore.getState().setStatus("wells-fargo-500", "received", "2026-11-05");

    const item = useStore.getState().tracker[0];
    expect(item.status).toBe("received");
    expect(item.dates.received).toBe("2026-11-05");
    expect(item.dates.closed).toBeUndefined();
    expect(item.bonusReceived).toBe(500);
  });
});

describe("setDate", () => {
  test("corrects the date recorded against a stage without moving the item there", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().setStatus("wells-fargo-500", "opened", "2026-09-01");
    useStore.getState().setStatus("wells-fargo-500", "received", "2026-11-01");

    useStore.getState().setDate("wells-fargo-500", "opened", "2026-09-05");

    const item = useStore.getState().tracker[0];
    expect(item.dates.opened).toBe("2026-09-05");
    // The stage pointer and every other recorded date are untouched.
    expect(item.status).toBe("received");
    expect(item.dates.received).toBe("2026-11-01");
  });

  test("ignores an unknown id", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    const before = useStore.getState().tracker;

    useStore.getState().setDate("nope", "opened", "2026-09-05");

    expect(useStore.getState().tracker[0]).toEqual(before[0]);
  });
});

describe("toggleCondition", () => {
  test("ticks a condition id onto conditionsDone, then unticks it", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);

    useStore.getState().toggleCondition("wells-fargo-500", "wf-dd");
    expect(useStore.getState().tracker[0].conditionsDone).toEqual(["wf-dd"]);

    useStore.getState().toggleCondition("wells-fargo-500", "wf-new-customer");
    expect(useStore.getState().tracker[0].conditionsDone).toEqual(["wf-dd", "wf-new-customer"]);

    useStore.getState().toggleCondition("wells-fargo-500", "wf-dd");
    expect(useStore.getState().tracker[0].conditionsDone).toEqual(["wf-new-customer"]);
  });
});

describe("setBonusReceived", () => {
  test("sets the recorded amount, and clears it when passed undefined", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);

    useStore.getState().setBonusReceived("wells-fargo-500", 500);
    expect(useStore.getState().tracker[0].bonusReceived).toBe(500);

    useStore.getState().setBonusReceived("wells-fargo-500", undefined);
    expect(useStore.getState().tracker[0].bonusReceived).toBeUndefined();
    expect("bonusReceived" in useStore.getState().tracker[0]).toBe(false);
  });
});

describe("setNotes", () => {
  test("sets the freeform notes text", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);

    useStore.getState().setNotes("wells-fargo-500", "Called support, DD posted on the 3rd.");

    expect(useStore.getState().tracker[0].notes).toBe("Called support, DD posted on the 3rd.");
  });
});

describe("setApplicant", () => {
  test("records who the account is for, and drops the field when it's blanked", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);

    useStore.getState().setApplicant("wells-fargo-500", "  partner  ");
    expect(useStore.getState().tracker[0].applicant).toBe("partner"); // trimmed

    useStore.getState().setApplicant("wells-fargo-500", "   ");
    expect("applicant" in useStore.getState().tracker[0]).toBe(false);
  });

  test("survives an export/import round trip", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);
    useStore.getState().setApplicant("wells-fargo-500", "me");

    const json = useStore.getState().exportJSON();
    useStore.getState().clearAll();
    useStore.getState().importJSON(json);

    expect(useStore.getState().tracker[0].applicant).toBe("me");
  });

  test("a hydrated blank applicant is dropped rather than badged", () => {
    useStore.getState().importJSON(
      JSON.stringify({
        profile: null,
        skippedIds: [],
        tracker: [
          {
            id: "a",
            bonusId: "wells-fargo-500",
            status: "opened",
            dates: {},
            openMonth: "2026-09",
            conditionsDone: [],
            applicant: "   ",
          },
        ],
      }),
    );

    expect("applicant" in useStore.getState().tracker[0]).toBe(false);
  });
});

describe("hydration", () => {
  test("a blob already in localStorage is loaded as the module initialises", async () => {
    // `merge` runs while `create(persist(...))` is still executing, so anything it
    // touches must already be initialised. A throw there is swallowed by persist and the
    // user's profile just silently never appears — which is why this imports the module
    // fresh with the blob already in place, rather than calling `rehydrate()` later.
    localStorage.setItem(
      "woolly.v1",
      JSON.stringify({ state: { profile: { state: "MA", monthlyDD: 4200 } }, version: 1 }),
    );
    vi.resetModules();

    const fresh = await import("./store");

    expect(fresh.useStore.getState().profile?.state).toBe("MA");
    expect(fresh.useStore.getState().profile?.monthlyDD).toBe(4200);
  });

  test("a partial profile (no prefs, no numbers) hydrates with defaults filled in", async () => {
    localStorage.setItem(
      "woolly.v1",
      JSON.stringify({ state: { profile: { state: "MA" } }, version: 1 }),
    );

    await useStore.persist.rehydrate();

    const hydrated = useStore.getState().profile;
    expect(hydrated?.state).toBe("MA");
    expect(hydrated?.monthlyDD).toBe(5000);
    expect(hydrated?.maxSplits).toBe(2);
    expect(hydrated?.horizonMonths).toBe(12);
    expect(hydrated?.prefs.avoidHardPull).toBe(true);
    expect(hydrated?.history).toEqual([]);
    expect(typeof hydrated?.startMonth).toBe("string");
    expect(useStore.getState().skippedIds).toEqual([]);
    expect(useStore.getState().tracker).toEqual([]);
  });

  test("junk types in the persisted blob are replaced by defaults instead of throwing", async () => {
    localStorage.setItem(
      "woolly.v1",
      JSON.stringify({
        state: {
          profile: { state: 7, startMonth: null, monthlyDD: "lots", maxSplits: NaN },
          skippedIds: "nope",
          tracker: [{ bonusId: "chase-400" }, "junk", null],
        },
        version: 1,
      }),
    );

    await useStore.persist.rehydrate();

    const hydrated = useStore.getState().profile;
    expect(hydrated?.state).toBe("");
    expect(hydrated?.monthlyDD).toBe(5000);
    expect(hydrated?.maxSplits).toBe(2);
    expect(typeof hydrated?.startMonth).toBe("string");
    expect(useStore.getState().skippedIds).toEqual([]);
    expect(useStore.getState().tracker).toEqual([
      {
        id: "chase-400",
        bonusId: "chase-400",
        status: "planned",
        dates: {},
        openMonth: "",
        conditionsDone: [],
      },
    ]);
  });

  test("a version 0 blob is migrated instead of dropped", async () => {
    localStorage.setItem(
      "woolly.v1",
      JSON.stringify({
        state: { profile: { state: "NY", monthlyDD: 4000 }, skippedIds: ["chase-400"] },
        version: 0,
      }),
    );

    await useStore.persist.rehydrate();

    expect(useStore.getState().profile?.state).toBe("NY");
    expect(useStore.getState().profile?.monthlyDD).toBe(4000);
    expect(useStore.getState().skippedIds).toEqual(["chase-400"]);
  });

  test("a v1 blob with a dd_sent tracked item migrates it to requirements_met", async () => {
    localStorage.setItem(
      "woolly.v1",
      JSON.stringify({
        state: {
          profile: null,
          skippedIds: [],
          tracker: [
            {
              id: "wells-fargo-500",
              bonusId: "wells-fargo-500",
              status: "dd_sent",
              dates: { opened: "2026-09-01", dd_sent: "2026-09-15" },
              openMonth: "2026-09",
            },
          ],
        },
        version: 1,
      }),
    );

    await useStore.persist.rehydrate();

    const item = useStore.getState().tracker[0];
    expect(item.status).toBe("requirements_met");
    expect(item.dates).toEqual({ opened: "2026-09-01", requirements_met: "2026-09-15" });
    expect(item.conditionsDone).toEqual([]);
  });
});

describe("persistence", () => {
  test("setProfile persists to localStorage under woolly.v1", () => {
    useStore.getState().setProfile(profile);
    const raw = localStorage.getItem("woolly.v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.profile).toEqual(profile);
    expect(parsed.version).toBe(2);
  });

  test("persisted state omits the derived plan (only profile, skippedIds, tracker)", () => {
    useStore.getState().setProfile(profile);
    useStore.getState().skip("wells-fargo-500");
    const raw = localStorage.getItem("woolly.v1");
    const parsed = JSON.parse(raw as string);
    expect(Object.keys(parsed.state).sort()).toEqual(["profile", "skippedIds", "tracker"]);
  });
});

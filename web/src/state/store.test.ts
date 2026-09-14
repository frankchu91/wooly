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
  test("moves planned -> opened -> dd_sent -> received -> closed, recording each date", () => {
    useStore.getState().trackPlan([makePlanItem("wells-fargo-500")]);

    useStore.getState().advance("wells-fargo-500", "2026-09-01");
    let item = useStore.getState().tracker[0];
    expect(item.status).toBe("opened");
    expect(item.dates.opened).toBe("2026-09-01");

    useStore.getState().advance("wells-fargo-500", "2026-09-15");
    item = useStore.getState().tracker[0];
    expect(item.status).toBe("dd_sent");
    expect(item.dates.dd_sent).toBe("2026-09-15");

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
  });
});

describe("persistence", () => {
  test("setProfile persists to localStorage under woolly.v1", () => {
    useStore.getState().setProfile(profile);
    const raw = localStorage.getItem("woolly.v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.profile).toEqual(profile);
    expect(parsed.version).toBe(1);
  });

  test("persisted state omits the derived plan (only profile, skippedIds, tracker)", () => {
    useStore.getState().setProfile(profile);
    useStore.getState().skip("wells-fargo-500");
    const raw = localStorage.getItem("woolly.v1");
    const parsed = JSON.parse(raw as string);
    expect(Object.keys(parsed.state).sort()).toEqual(["profile", "skippedIds", "tracker"]);
  });
});

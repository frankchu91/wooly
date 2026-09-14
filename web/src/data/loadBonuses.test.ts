import { loadBonuses } from "./loadBonuses";
import { fixture } from "./fixture";

const ok = (body: unknown) =>
  (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

test("loads and validates dataset", async () => {
  const ds = await loadBonuses(
    ok({ generated_at: "2026-09-13T00:00:00Z", source: "s", bonuses: fixture }),
  );
  expect(ds.bonuses).toHaveLength(8);
});

test("rejects malformed dataset", async () => {
  await expect(loadBonuses(ok({ bonuses: [{ id: "x" }] }))).rejects.toThrow("bad dataset");
  await expect(loadBonuses(ok({ nope: true }))).rejects.toThrow("bad dataset");
});

test("defaults conditions/hold_days/terms when missing from an older dataset", async () => {
  const { conditions, hold_days, terms, ...withoutNewFields } = fixture[0];
  void conditions;
  void hold_days;
  void terms;
  const ds = await loadBonuses(
    ok({ generated_at: "2026-09-13T00:00:00Z", source: "s", bonuses: [withoutNewFields] }),
  );
  expect(ds.bonuses[0].conditions).toEqual([]);
  expect(ds.bonuses[0].hold_days).toBeNull();
  expect(ds.bonuses[0].terms).toEqual({ status: "none", url: null, fetched_at: null });
});

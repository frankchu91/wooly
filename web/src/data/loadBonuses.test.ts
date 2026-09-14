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

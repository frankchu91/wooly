import type { Bonus, Dataset } from "../engine/types";

/** The dataset's URL under the site's mount point (`/bonuses.json` on a host of its own,
 * `/<repo>/bonuses.json` on GitHub Pages). */
export const BONUSES_URL = `${import.meta.env.BASE_URL}bonuses.json`;

export async function loadBonuses(fetchImpl: typeof fetch = fetch): Promise<Dataset> {
  const res = await fetchImpl(BONUSES_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("bad dataset");
  const doc = (await res.json()) as Partial<Dataset>;
  if (!Array.isArray(doc.bonuses)) throw new Error("bad dataset");
  // Older data files (and the pre-conditions scraper) don't carry `conditions`,
  // `hold_days`, or `terms` — default them here so the rest of the app can rely on
  // every `Bonus` having the full shape regardless of which dataset generated it.
  const bonuses: Bonus[] = (doc.bonuses as Partial<Bonus>[]).map((b) => {
    if (!b || typeof b.id !== "string" || typeof b.bank !== "string" || typeof b.title !== "string")
      throw new Error("bad dataset");
    return {
      ...b,
      conditions: Array.isArray(b.conditions) ? b.conditions : [],
      hold_days: typeof b.hold_days === "number" ? b.hold_days : null,
      terms: b.terms ?? { status: "none", url: null, fetched_at: null },
    } as Bonus;
  });
  return {
    generated_at: doc.generated_at ?? null,
    source: doc.source ?? "",
    bonuses,
  };
}

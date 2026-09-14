import type { Bonus, Dataset } from "../engine/types";

export async function loadBonuses(fetchImpl: typeof fetch = fetch): Promise<Dataset> {
  const res = await fetchImpl("/bonuses.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("bad dataset");
  const doc = (await res.json()) as Partial<Dataset>;
  if (!Array.isArray(doc.bonuses)) throw new Error("bad dataset");
  for (const b of doc.bonuses as Partial<Bonus>[]) {
    if (!b || typeof b.id !== "string" || typeof b.bank !== "string" || typeof b.title !== "string")
      throw new Error("bad dataset");
  }
  return {
    generated_at: doc.generated_at ?? null,
    source: doc.source ?? "",
    bonuses: doc.bonuses as Bonus[],
  };
}

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { useData } from "../../data/DataContext";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { BonusCard } from "./BonusCard";
import { BonusDrawer } from "./BonusDrawer";
import { Filters } from "./Filters";
import type { Chip, SortKey } from "./useBonusFilters";
import { useBonusFilters } from "./useBonusFilters";

const CHIP_KEYS = new Set<string>(Object.keys(t.bonuses.filters));
const SORT_KEYS = new Set<string>(Object.keys(t.bonuses.sort));

function isChip(value: string): value is Chip {
  return CHIP_KEYS.has(value);
}

function isSortKey(value: string): value is SortKey {
  return SORT_KEYS.has(value);
}

/** Browse every offer in the dataset, with search, filter chips, and sort — all
 * mirrored into the URL (`?q=&chips=&sort=`) so a filtered view is shareable. A
 * separate `?bonus=<id>` param drives the `BonusDrawer`, so a direct link to a single
 * offer (e.g. from `PlanCard`'s "Details" action) opens straight into its detail. */
export function BonusesPage() {
  const data = useData();
  const profile = useStore((state) => state.profile);
  const filters = useBonusFilters(data.bonuses, profile);
  const [searchParams, setSearchParams] = useSearchParams();
  const hydratedRef = useRef(false);

  // Seed filter state from the URL exactly once on mount. `useBonusFilters` owns its
  // state internally (so it stays trivially testable with `renderHook`), so hydration
  // happens here by driving its setters rather than by passing it initial values.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const initialQ = searchParams.get("q");
    if (initialQ) filters.setQ(initialQ);

    const initialChips = (searchParams.get("chips") ?? "").split(",").filter(isChip);
    for (const chip of initialChips) {
      if (chip !== "myState" || profile) filters.toggleChip(chip);
    }

    const initialSort = searchParams.get("sort");
    if (initialSort && isSortKey(initialSort) && (initialSort !== "score" || profile)) {
      filters.setSort(initialSort);
    }
    // Deliberately runs once: `filters`'s setters are stable, and re-running this on
    // every render would re-apply the URL's initial values over the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with filter state, without touching the independent `bonus`
  // selection param.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (filters.q) next.set("q", filters.q);
        else next.delete("q");
        if (filters.chips.size > 0) next.set("chips", Array.from(filters.chips).join(","));
        else next.delete("chips");
        if (filters.sort !== "bonus") next.set("sort", filters.sort);
        else next.delete("sort");
        return next;
      },
      { replace: true },
    );
  }, [filters.q, filters.chips, filters.sort, setSearchParams]);

  const selectedId = searchParams.get("bonus");
  const selectedBonus = selectedId ? (data.bonuses.find((b) => b.id === selectedId) ?? null) : null;

  function openDrawer(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("bonus", id);
      return next;
    });
  }

  function closeDrawer() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("bonus");
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.bonuses.title}</h1>

      <Filters filters={filters} hasProfile={profile != null} />

      <p className="text-sm text-muted">{t.bonuses.count(filters.count)}</p>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filters.results.map((bonus) => (
          <BonusCard key={bonus.id} bonus={bonus} onOpen={openDrawer} />
        ))}
      </ul>

      <BonusDrawer bonus={selectedBonus} open={selectedBonus != null} onClose={closeDrawer} />
    </div>
  );
}

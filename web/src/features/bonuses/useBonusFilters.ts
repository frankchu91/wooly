import { useMemo, useState } from "react";

import { compareByScore, evaluate } from "../../engine";
import type { Bonus, Profile } from "../../engine/types";
import { t } from "../../i18n/en";

export type Chip = keyof typeof t.bonuses.filters;
export type SortKey = keyof typeof t.bonuses.sort;

/** The valid `Chip`/`SortKey` values, derived once from the copy object so `Filters`
 * and `BonusesPage` don't each redeclare their own copy of this list. */
export const CHIP_KEYS = Object.keys(t.bonuses.filters) as Chip[];
export const SORT_KEYS = Object.keys(t.bonuses.sort) as SortKey[];

/** Section chips are mutually exclusive: picking one clears the others. */
const SECTION_CHIPS: Chip[] = ["checking", "savings", "business"];

/** Mirrors `PlanCard`'s fee-avoidability check: a bonus counts as "no fee" when it has
 * no monthly fee at all, the fee is $0, or the fee is explicitly avoidable. */
function isFeeAvoidable(bonus: Bonus): boolean {
  return (
    bonus.monthly_fee === null ||
    bonus.monthly_fee.amount === 0 ||
    bonus.monthly_fee.avoidable === true
  );
}

/** A section chip counts `state`/`regional` bonuses as "checking" — those sections are
 * just geographically-restricted checking offers, not a distinct category to browse. */
function matchesSection(chip: "checking" | "savings" | "business", bonus: Bonus): boolean {
  if (chip === "checking")
    return (
      bonus.section === "checking" || bonus.section === "state" || bonus.section === "regional"
    );
  return bonus.section === chip;
}

function matchesChip(chip: Chip, bonus: Bonus, profile: Profile | null, today: Date): boolean {
  switch (chip) {
    case "nationwide":
      return bonus.availability.nationwide;
    case "myState": {
      if (!profile) return true;
      const { reasons } = evaluate(bonus, profile, today);
      return !reasons.includes("not_in_state") && !reasons.includes("unknown_availability");
    }
    case "noDD":
      return bonus.dd.required === false;
    case "softPull":
      return bonus.pull === "soft";
    case "noFee":
      return isFeeAvoidable(bonus);
    case "checking":
    case "savings":
    case "business":
      return matchesSection(chip, bonus);
    default:
      return true;
  }
}

function compareExpiring(a: Bonus, b: Bonus): number {
  if (a.expiration === b.expiration) return 0;
  if (a.expiration === null) return 1;
  if (b.expiration === null) return -1;
  return a.expiration.localeCompare(b.expiration);
}

function compareBonusMax(a: Bonus, b: Bonus): number {
  const aMax = a.bonus_max ?? -Infinity;
  const bMax = b.bonus_max ?? -Infinity;
  return bMax - aMax;
}

export interface UseBonusFiltersResult {
  q: string;
  setQ: (q: string) => void;
  chips: Set<Chip>;
  toggleChip: (chip: Chip) => void;
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  results: Bonus[];
  count: number;
}

/** Drives the `/bonuses` browse page: free-text search plus AND-combined filter chips,
 * with a choice of sort order. Pure state + derived results — the page is responsible
 * for mirroring this state into the URL so it stays shareable. */
export function useBonusFilters(bonuses: Bonus[], profile: Profile | null): UseBonusFiltersResult {
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<Set<Chip>>(new Set());
  const [sort, setSort] = useState<SortKey>("bonus");

  function toggleChip(chip: Chip) {
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) {
        next.delete(chip);
        return next;
      }
      if (SECTION_CHIPS.includes(chip)) {
        for (const section of SECTION_CHIPS) next.delete(section);
      }
      next.add(chip);
      return next;
    });
  }

  const results = useMemo(() => {
    const today = new Date();
    const query = q.trim().toLowerCase();

    const filtered = bonuses.filter((bonus) => {
      if (
        query &&
        !bonus.bank.toLowerCase().includes(query) &&
        !bonus.title.toLowerCase().includes(query)
      )
        return false;

      for (const chip of chips) {
        if (!matchesChip(chip, bonus, profile, today)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (sort === "bonus") {
      sorted.sort(compareBonusMax);
    } else if (sort === "score" && profile) {
      sorted.sort(compareByScore);
    } else if (sort === "expiring") {
      sorted.sort(compareExpiring);
    }
    return sorted;
  }, [bonuses, q, chips, sort, profile]);

  return { q, setQ, chips, toggleChip, sort, setSort, results, count: results.length };
}

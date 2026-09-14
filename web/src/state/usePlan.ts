import { useMemo } from "react";
import { buildPlan } from "../engine";
import type { Bonus, Plan } from "../engine/types";
import { currentMonth, useStore } from "./store";

/**
 * Derives the current `Plan` from the store's profile and skipped-bonus state plus the
 * caller-supplied bonus dataset. The plan itself is never persisted — it's cheap to
 * recompute and depends on `today`, which the store doesn't track.
 *
 * The persisted profile's `startMonth` is whenever the user first set up — for a
 * returning user that is in the past, which would schedule the first months of the plan
 * into months that have already been and gone. The plan always starts from the current
 * month instead.
 */
export function usePlan(bonuses: Bonus[] | undefined): Plan | null {
  const profile = useStore((state) => state.profile);
  const skippedIds = useStore((state) => state.skippedIds);

  return useMemo(() => {
    if (!profile || !bonuses) return null;
    return buildPlan(
      bonuses,
      { ...profile, startMonth: currentMonth() },
      { today: new Date(), skippedIds },
    );
  }, [profile, bonuses, skippedIds]);
}

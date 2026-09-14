import { useMemo } from "react";
import { buildPlan } from "../engine";
import type { Bonus, Plan } from "../engine/types";
import { useStore } from "./store";

/**
 * Derives the current `Plan` from the store's profile and skipped-bonus state plus the
 * caller-supplied bonus dataset. The plan itself is never persisted — it's cheap to
 * recompute and depends on `today`, which the store doesn't track.
 */
export function usePlan(bonuses: Bonus[] | undefined): Plan | null {
  const profile = useStore((state) => state.profile);
  const skippedIds = useStore((state) => state.skippedIds);

  return useMemo(() => {
    if (!profile || !bonuses) return null;
    return buildPlan(bonuses, profile, { today: new Date(), skippedIds });
  }, [profile, bonuses, skippedIds]);
}

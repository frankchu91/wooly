import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { useData } from "../../data/DataContext";
import { ledgerTotals } from "../../engine/conditions";
import type { Bonus, TrackedItem } from "../../engine/types";
import { useStore } from "../../state/store";

export interface TrackerView {
  tracker: TrackedItem[];
  profile: ReturnType<typeof useStore.getState>["profile"];
  bonusesById: Record<string, Bonus>;
  totals: ReturnType<typeof ledgerTotals>;
  today: Date;
  selectedItem: TrackedItem | null;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  handleUntrack: (id: string) => void;
}

/**
 * The view state the tracker and the ledger share (spec §4.3). Both pages list the same
 * tracked accounts and open the same item drawer, so the data, the totals, the "now" every
 * countdown is measured from, and the drawer's selection all live here rather than being
 * re-derived — and slightly differently — on each page.
 *
 * The drawer's selection lives in the URL (`?item=<id>`, mirroring `/bonuses?bonus=`) so a
 * single tracked account is linkable from either page and the browser's back button closes
 * the drawer rather than leaving the page.
 */
export function useTrackerView(): TrackerView {
  const data = useData();
  const tracker = useStore((state) => state.tracker);
  const profile = useStore((state) => state.profile);
  const [searchParams, setSearchParams] = useSearchParams();

  const bonusesById = useMemo(() => {
    const byId: Record<string, Bonus> = {};
    for (const bonus of data.bonuses) byId[bonus.id] = bonus;
    return byId;
  }, [data.bonuses]);

  const totals = ledgerTotals(tracker, bonusesById);
  // One `Date` per render, shared by every child, so every countdown on the page is
  // measured from the same instant.
  const today = new Date();

  const selectedId = searchParams.get("item");
  const selectedItem = selectedId ? (tracker.find((item) => item.id === selectedId) ?? null) : null;

  function openDrawer(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("item", id);
      return next;
    });
  }

  function closeDrawer() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("item");
        return next;
      },
      { replace: true },
    );
  }

  /** A `?item=` pointing at an item that has just been removed would survive in the URL
   * (and in the back button's history) with nothing behind it. */
  function handleUntrack(id: string) {
    if (id === selectedId) closeDrawer();
  }

  return {
    tracker,
    profile,
    bonusesById,
    totals,
    today,
    selectedItem,
    openDrawer,
    closeDrawer,
    handleUntrack,
  };
}

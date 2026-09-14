import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { useData } from "../../data/DataContext";
import { ledgerTotals } from "../../engine/conditions";
import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Button, Card, EmptyState } from "../../ui";
import { ItemDrawer } from "./ItemDrawer";
import { LedgerTable } from "./LedgerTable";
import { LedgerTotals } from "./LedgerTotals";
import { Pipeline } from "./Pipeline";

/**
 * The tracker (spec §4.3): ledger totals, the spreadsheet-style ledger table, the
 * five-stage pipeline, and the item drawer — top to bottom, one screen.
 *
 * The drawer's selection lives in the URL (`?item=<id>`, mirroring `/bonuses?bonus=`)
 * so a single tracked account is linkable and the browser's back button closes the
 * drawer rather than leaving the page.
 */
export function TrackerPage() {
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

  /** A `?item=` pointing at an item that has just been removed would survive in the URL
   * (and in the back button's history) with nothing behind it. */
  function handleUntrack(id: string) {
    if (id === selectedId) closeDrawer();
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

  return (
    <div className="flex flex-col gap-6 pb-4">
      <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.tracker.title}</h1>

      {tracker.length === 0 ? (
        <EmptyState
          title={t.tracker.empty.h}
          body={t.tracker.empty.body}
          action={<Button to={profile ? "/plan" : "/start"}>{t.tracker.empty.cta}</Button>}
        />
      ) : (
        <>
          <LedgerTotals totals={totals} />
          <LedgerTable
            items={tracker}
            bonusesById={bonusesById}
            today={today}
            onSelect={openDrawer}
          />
          <Pipeline
            items={tracker}
            bonusesById={bonusesById}
            today={today}
            onSelect={openDrawer}
            onUntrack={handleUntrack}
          />
        </>
      )}

      <Card tone="mint">
        <p className="text-sm text-primary-dark">{t.tracker.pro}</p>
      </Card>

      <ItemDrawer
        item={selectedItem}
        bonus={selectedItem ? bonusesById[selectedItem.bonusId] : undefined}
        open={selectedItem != null}
        onClose={closeDrawer}
        today={today}
      />
    </div>
  );
}

import { t } from "../../i18n/en";
import { Button, EmptyState } from "../../ui";
import { ItemDrawer } from "./ItemDrawer";
import { LedgerTotals } from "./LedgerTotals";
import { Pipeline } from "./Pipeline";
import { useTrackerView } from "./useTrackerView";

/**
 * The tracker (spec §4.3): ledger totals, the five-stage pipeline, and the item drawer.
 *
 * The spreadsheet itself lives on its own page now (`/ledger`), so this one is the
 * pipeline's — a quiet link under the title leads to the other view, and both share
 * `useTrackerView`, so a row clicked on either opens the same drawer.
 */
export function TrackerPage() {
  const {
    tracker,
    profile,
    bonusesById,
    totals,
    today,
    selectedItem,
    openDrawer,
    closeDrawer,
    handleUntrack,
  } = useTrackerView();

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.tracker.title}</h1>
        <div>
          <Button to="/ledger" variant="ghost" size="sm">
            {t.tracker.seeLedger}
          </Button>
        </div>
      </div>

      {tracker.length === 0 ? (
        <EmptyState
          title={t.tracker.empty.h}
          body={t.tracker.empty.body}
          action={<Button to={profile ? "/plan" : "/start"}>{t.tracker.empty.cta}</Button>}
        />
      ) : (
        <>
          <LedgerTotals totals={totals} />
          <Pipeline
            items={tracker}
            bonusesById={bonusesById}
            today={today}
            onSelect={openDrawer}
            onUntrack={handleUntrack}
          />
        </>
      )}

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

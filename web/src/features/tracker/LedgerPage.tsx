import { Download } from "lucide-react";

import { t } from "../../i18n/en";
import { Button, EmptyState, toast } from "../../ui";
import { datedFilename, downloadWorkbook } from "../../xlsx";
import { ItemDrawer } from "./ItemDrawer";
import { buildLedgerWorkbook } from "./ledgerXlsx";
import { LedgerTable } from "./LedgerTable";
import { LedgerTotals } from "./LedgerTotals";
import { useTrackerView } from "./useTrackerView";

/**
 * The ledger (spec §4.3.2) on its own page: the totals, then the spreadsheet, then the
 * item drawer. It shares `useTrackerView` with the tracker, so a row clicked here opens
 * exactly the drawer a pipeline card would.
 */
export function LedgerPage() {
  const { tracker, profile, bonusesById, totals, today, selectedItem, openDrawer, closeDrawer } =
    useTrackerView();

  /** Builds the file in the browser and hands it straight to the download: the ledger
   * never leaves this device on its way out of it, same as it never left on the way in. */
  async function handleDownload() {
    await downloadWorkbook(
      datedFilename("ledger", today),
      await buildLedgerWorkbook(tracker, bonusesById),
    );
    toast(t.ledger.downloaded);
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.ledger.title}</h1>
        <p className="text-sm text-muted">{t.ledger.sub}</p>
        <div className="flex flex-wrap items-center gap-1">
          <Button to="/tracker" variant="ghost" size="sm">
            {t.ledger.seePipeline}
          </Button>
          {/* Only offered once there is something to put in the file — a spreadsheet of
           * one header row is a worse answer than no button. */}
          {tracker.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDownload()}
              icon={<Download size={15} aria-hidden="true" />}
            >
              {t.ledger.download}
            </Button>
          ) : null}
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
          <LedgerTable
            items={tracker}
            bonusesById={bonusesById}
            today={today}
            onSelect={openDrawer}
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

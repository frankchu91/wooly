import type { LedgerTotals as Totals } from "../../engine/conditions";
import { t } from "../../i18n/en";
import { Card, MoneyText } from "../../ui";

export interface LedgerTotalsProps {
  totals: Totals;
}

/** The dark summary card at the top of the tracker: what the user has actually
 * collected, what is still in flight, and what is only planned — each with how many
 * accounts make it up (spec §4.3.1). "Earned" is the headline, so it alone gets the gold
 * treatment; the other two are deliberately quieter. */
export function LedgerTotals({ totals }: LedgerTotalsProps) {
  const { counts } = totals;

  return (
    <section aria-label={t.tracker.ledger.totals}>
      <Card tone="ink" className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
            {t.tracker.ledger.earned}
          </p>
          <div className="mt-1">
            <MoneyText value={totals.earned} size="xl" />
          </div>
          {/* Accounts that actually paid, not every account that reached a late stage —
           * the same rule the figure above it uses (X1). */}
          <p className="mt-1 text-xs text-cream/70">{t.tracker.ledger.accounts(counts.earned)}</p>
        </div>

        <div className="flex gap-8 sm:gap-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
              {t.tracker.ledger.pending}
            </p>
            <div className="mt-1">
              <MoneyText value={totals.pending} size="md" className="text-lg font-semibold" />
            </div>
            <p className="mt-1 text-xs text-cream/70">
              {t.tracker.ledger.accounts(counts.opened + counts.requirements_met)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
              {t.tracker.ledger.planned}
            </p>
            <div className="mt-1">
              <MoneyText value={totals.planned} size="md" className="text-lg font-semibold" />
            </div>
            <p className="mt-1 text-xs text-cream/70">
              {t.tracker.ledger.accounts(counts.planned)}
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}

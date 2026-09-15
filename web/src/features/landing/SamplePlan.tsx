import { useMemo } from "react";

import { buildPlan, defaultProfile } from "../../engine";
import type { Bonus, PlanMonth } from "../../engine/types";
import { t } from "../../i18n/en";
import { currentMonth } from "../../state/store";
import { BankAvatar, money, monthLabel } from "../../ui";

/** Months the sample shows. Three is enough to read as a plan without becoming a table. */
const SAMPLE_MONTHS = 3;

/** The stand-in profile the sample is built for. It is `defaultProfile` (the wizard's
 * starting values) with the horizon cut down, so the hero shows exactly what a new user
 * would get by accepting the defaults. An empty `state` keeps it to nationwide offers. */
function sampleProfile(startMonth: string) {
  return { ...defaultProfile(startMonth), horizonMonths: SAMPLE_MONTHS };
}

export interface SamplePlanProps {
  bonuses: Bonus[];
  /** Injectable so tests and the sample stay deterministic. */
  today?: Date;
}

/** A read-only three-month plan built by the real scheduler from the live dataset.
 *
 * This is the product's actual output, not a mock-up: the same `buildPlan` the Plan page
 * uses, on the same offers, for the wizard's default profile. It is deliberately not the
 * Plan page's `PlanCard` (no skip menu, no warnings) because nothing here is the user's. */
export function SamplePlan({ bonuses, today = new Date() }: SamplePlanProps) {
  const plan = useMemo(
    () => buildPlan(bonuses, sampleProfile(currentMonth()), { today }),
    [bonuses, today],
  );
  const { projected, accounts } = plan.totals;

  return (
    <figure
      aria-label={t.landing.sample.title}
      className="flex flex-col gap-5 rounded-card border border-ink/10 bg-surface p-5 shadow-card md:p-6"
    >
      <figcaption className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-heading text-base font-bold text-ink">
            {t.landing.sample.title}
          </span>
          <span className="text-sm text-muted">{t.landing.sample.profile}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-heading text-3xl font-extrabold tabular-nums leading-none text-primary-dark">
            {money(projected)}
          </span>
          <span className="text-xs text-muted">
            {t.landing.sample.projected}, {t.landing.sample.accounts(accounts)}
          </span>
        </div>
      </figcaption>

      <ol className="flex flex-col divide-y divide-ink/10">
        {plan.months.map((month) => (
          <SampleMonth key={month.month} month={month} />
        ))}
      </ol>

      <p className="text-xs text-muted">{t.landing.sample.note}</p>
    </figure>
  );
}

function SampleMonth({ month }: { month: PlanMonth }) {
  return (
    <li className="grid gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[5.5rem_1fr]">
      <span className="text-sm font-semibold text-ink">{monthLabel(month.month)}</span>
      {month.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {month.items.map(({ bonus }) => (
            <li key={bonus.id} className="flex items-center gap-2.5">
              <BankAvatar name={bonus.bank} size={22} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{bonus.bank}</span>
              <span className="text-sm font-semibold tabular-nums text-ink">
                {money(bonus.bonus_max)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-muted">{t.landing.sample.empty}</span>
      )}
    </li>
  );
}

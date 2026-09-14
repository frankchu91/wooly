import type { PlanMonth } from "../../engine/types";
import { t } from "../../i18n/en";
import { money, monthLabel } from "../../ui";
import { PlanCard } from "./PlanCard";

export interface MonthColumnProps {
  month: PlanMonth;
  monthlyDD: number;
}

/** One month of the timeline: an `<li>` inside the timeline `<ol>`, holding a DD meter
 * and a `<ul>` of `PlanCard`s (or a single muted line when the month is empty — an empty
 * month is normal, not a hole in the plan, so it doesn't get a card-sized void). */
export function MonthColumn({ month, monthlyDD }: MonthColumnProps) {
  const pct = monthlyDD > 0 ? Math.min(100, (month.ddUsed / monthlyDD) * 100) : 0;
  const meterLabel = t.plan.ddUsed(money(month.ddUsed), money(monthlyDD));

  return (
    // `self-start` keeps a column at its natural height instead of stretching to match
    // the tallest one in its grid row, which is what turned a quiet month into a tall
    // empty box.
    <li className="flex flex-col gap-3 self-start rounded-card bg-mint/20 p-3">
      <h3 className="font-heading text-sm font-semibold text-ink">{monthLabel(month.month)}</h3>

      <div className="flex flex-col gap-1">
        <div
          role="meter"
          aria-valuenow={month.ddUsed}
          aria-valuemin={0}
          aria-valuemax={monthlyDD}
          aria-label={meterLabel}
          className="h-2 w-full overflow-hidden rounded-full bg-mint"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted">{meterLabel}</p>
      </div>

      {month.items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {month.items.map((item) => (
            <PlanCard key={item.bonus.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">{t.plan.emptyMonth}</p>
      )}
    </li>
  );
}

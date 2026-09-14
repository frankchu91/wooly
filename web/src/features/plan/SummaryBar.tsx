import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import type { Plan } from "../../engine/types";
import { t } from "../../i18n/en";
import { MoneyText, money } from "../../ui";

export interface SummaryBarProps {
  plan: Plan;
}

const COUNT_UP_DURATION_S = 0.6;

/** Dark hero card summarizing the plan's totals. The projected-earnings figure counts
 * up from zero over ~600ms (skipped when the viewer prefers reduced motion). */
export function SummaryBar({ plan }: SummaryBarProps) {
  const { projected, accounts, avgDDUsed } = plan.totals;
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  // Only ever written from the `animate` subscription below, never synchronously in the
  // effect body — when motion is reduced, `displayValue` below reads `projected`
  // directly instead, so this piece of state simply isn't used for that path.
  const [liveValue, setLiveValue] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    motionValue.set(0);
    const controls = animate(motionValue, projected, {
      duration: COUNT_UP_DURATION_S,
      onUpdate: (value) => setLiveValue(Math.round(value)),
    });
    return () => controls.stop();
  }, [projected, reduceMotion, motionValue]);

  const displayValue = reduceMotion ? projected : liveValue;

  return (
    // A plain element rather than the shared `Card` — `Card`'s own base classes bake in
    // `bg-surface`, and Tailwind's generated stylesheet order (not class order in JSX)
    // decides the winner between two same-specificity background utilities, so
    // `bg-surface` would win over a `bg-ink` override passed via `className` here.
    <div className="flex flex-col gap-4 rounded-card bg-ink p-5 text-cream shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
          {t.plan.projected}
        </p>
        <div className="mt-1">
          <MoneyText value={displayValue} size="xl" />
        </div>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
            {t.plan.accounts}
          </p>
          <p className="mt-1 font-heading text-xl font-bold text-cream">{accounts}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
            {t.plan.avgDD}
          </p>
          <p className="mt-1 font-heading text-xl font-bold text-cream">{money(avgDDUsed)}</p>
        </div>
      </div>
    </div>
  );
}

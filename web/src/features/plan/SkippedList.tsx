import type { Plan } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { BankAvatar, Button } from "../../ui";
import { reasonToText } from "./reasonText";

export interface SkippedListProps {
  skipped: Plan["skipped"];
}

/** Accordion of bonuses left out of the plan — ineligible ones, and ones the viewer
 * skipped by hand (which get a Restore button). */
export function SkippedList({ skipped }: SkippedListProps) {
  const restore = useStore((state) => state.restore);

  return (
    <details className="rounded-card bg-surface p-4 shadow-card">
      <summary className="cursor-pointer font-heading text-sm font-semibold text-ink">
        {t.plan.skipped(skipped.length)}
      </summary>
      <ul className="mt-3 flex flex-col gap-3">
        {skipped.map(({ bonus, reasons, antiChurnUntil }) => {
          const reasonTexts = reasons.map((reason) => reasonToText(reason, bonus, antiChurnUntil));
          return (
            <li key={bonus.id} className="flex items-center gap-3">
              <BankAvatar name={bonus.bank} size={24} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{bonus.title}</p>
                <p className="truncate text-xs text-muted" title={reasonTexts.join("; ")}>
                  {reasonTexts[0]}
                </p>
              </div>
              {reasons.includes("user_skipped") ? (
                <Button variant="ghost" onClick={() => restore(bonus.id)}>
                  {t.plan.restore}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

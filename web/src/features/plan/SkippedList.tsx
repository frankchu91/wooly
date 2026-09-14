import { useState } from "react";
import type { ReactEventHandler } from "react";

import type { Plan, Reason } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { BankAvatar, Button } from "../../ui";
import { reasonToText } from "./reasonText";

export interface SkippedListProps {
  skipped: Plan["skipped"];
}

type SkippedEntry = Plan["skipped"][number];

interface ReasonGroup {
  reason: Reason;
  label: string;
  entries: SkippedEntry[];
}

/**
 * Buckets the skipped list by each bonus's *first* reason.
 *
 * Hundreds of flat rows all saying "Not available in your state" tell the user nothing;
 * one heading saying so, with a count, tells them everything. The rows the user skipped
 * by hand come first — those are the only ones they can act on.
 */
function groupByReason(skipped: SkippedEntry[]): ReasonGroup[] {
  const groups = new Map<Reason, ReasonGroup>();
  for (const entry of skipped) {
    const reason = entry.reasons[0];
    if (!reason) continue;
    const existing = groups.get(reason);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(reason, {
        reason,
        label: reasonToText(reason, entry.bonus, entry.antiChurnUntil),
        entries: [entry],
      });
    }
  }
  const all = Array.from(groups.values());
  return [
    ...all.filter((group) => group.reason === "user_skipped"),
    ...all.filter((group) => group.reason !== "user_skipped"),
  ];
}

/** Accordion of bonuses left out of the plan — ineligible ones, and ones the viewer
 * skipped by hand (which get a Restore button). */
export function SkippedList({ skipped }: SkippedListProps) {
  const restore = useStore((state) => state.restore);
  // Rows (there can be hundreds) are only mounted while the accordion is open — no
  // point keeping them in the DOM while collapsed.
  const [open, setOpen] = useState(false);

  const handleToggle: ReactEventHandler<HTMLDetailsElement> = (event) => {
    setOpen(event.currentTarget.open);
  };

  return (
    <details className="rounded-card bg-surface p-4 shadow-card" onToggle={handleToggle}>
      <summary className="cursor-pointer font-heading text-sm font-semibold text-ink">
        {t.plan.skipped(skipped.length)}
      </summary>
      {open ? (
        <div className="mt-3 flex flex-col gap-5">
          {groupByReason(skipped).map((group) => (
            <section key={group.reason}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {group.label} ({group.entries.length})
              </h3>
              <ul className="flex flex-col gap-2">
                {group.entries.map(({ bonus, reasons, antiChurnUntil }) => (
                  <li key={bonus.id} className="flex items-center gap-3">
                    <BankAvatar name={bonus.bank} size={24} />
                    <p
                      className="min-w-0 flex-1 truncate text-sm text-ink"
                      title={reasons
                        .map((reason) => reasonToText(reason, bonus, antiChurnUntil))
                        .join("; ")}
                    >
                      {bonus.title}
                    </p>
                    {reasons.includes("user_skipped") ? (
                      <Button variant="ghost" onClick={() => restore(bonus.id)}>
                        {t.plan.restore}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </details>
  );
}

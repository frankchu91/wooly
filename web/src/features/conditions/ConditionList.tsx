import { CreditCard, Info, Landmark, Lock, Receipt, UserPlus, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { useId } from "react";

import type { Condition, ConditionKind } from "../../engine/types";
import { t } from "../../i18n/en";
import { Badge, cn, money } from "../../ui";

export interface ConditionListProps {
  /** The checklist: the requirements the user works through. */
  conditions: Condition[];
  /** Facts about the offer that aren't tasks (fees, "new customers only", free text).
   * Rendered read-only under a collapsed "Also note" disclosure, never as checkboxes. */
  notes?: Condition[];
  /** Ids of conditions the user has ticked off. Only read when `onToggle` is given —
   * a read-only list (e.g. `BonusDrawer`) has nothing to check against. */
  done?: ReadonlySet<string>;
  /** Supplying this switches every row from a static kind icon to a real checkbox, so
   * the list becomes interactive (used by the tracker; `BonusDrawer` omits it). */
  onToggle?: (id: string) => void;
  /** Hides the amount/days/count meta line and clamps each condition's text to two
   * lines, for tight spaces like a plan card. */
  compact?: boolean;
}

const KIND_ICONS: Record<ConditionKind, ComponentType<{ size?: number; className?: string }>> = {
  direct_deposit: Landmark,
  deposit: Landmark,
  balance: Wallet,
  transactions: CreditCard,
  keep_open: Lock,
  fee: Receipt,
  new_customer: UserPlus,
  other: Info,
};

function metaLine(condition: Condition): string | null {
  const parts: string[] = [];
  if (condition.amount != null) parts.push(t.conditions.meta.amount(money(condition.amount)));
  if (condition.days != null) parts.push(t.conditions.meta.days(condition.days));
  if (condition.count != null) parts.push(t.conditions.meta.count(condition.count));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * A bonus's requirements — real (doc/bank-sourced) and synthesised — shared by
 * `BonusDrawer` (read-only) and the tracker (interactive, via `onToggle`). The caller
 * splits checklist from notes (`splitConditions`); this renders what it is given.
 *
 * `notes` land under a collapsed "Also note" disclosure rather than in the list itself:
 * a monthly fee or a "new customers only" rule is worth reading once, but counting it as
 * a task makes the checklist impossible to finish.
 */
export function ConditionList({
  conditions,
  notes,
  done,
  onToggle,
  compact = false,
}: ConditionListProps) {
  const baseId = useId();

  return (
    <div className="flex flex-col gap-3">
      {conditions.length === 0 ? (
        <p className="text-sm text-muted">{t.conditions.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conditions.map((condition) => {
            const Icon = KIND_ICONS[condition.kind];
            const inputId = `${baseId}-${condition.id}`;
            const meta = metaLine(condition);

            return (
              <li key={condition.id} className="flex items-start gap-2">
                {onToggle ? (
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={done?.has(condition.id) ?? false}
                    onChange={() => onToggle(condition.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-muted text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                ) : (
                  <Icon size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {onToggle ? (
                      <label
                        htmlFor={inputId}
                        className={cn("break-words text-sm text-ink", compact && "line-clamp-2")}
                      >
                        {condition.text}
                      </label>
                    ) : (
                      <span
                        className={cn("break-words text-sm text-ink", compact && "line-clamp-2")}
                      >
                        {condition.text}
                      </span>
                    )}
                    <Badge tone="neutral">{t.conditions.sources[condition.source]}</Badge>
                  </div>
                  {!compact && meta ? <p className="text-xs text-muted">{meta}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {notes && notes.length > 0 ? (
        <details className="rounded-control border border-mint bg-cream/60 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-ink marker:text-muted">
            {t.conditions.alsoNote(notes.length)}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {notes.map((note) => {
              const Icon = KIND_ICONS[note.kind];
              return (
                <li key={note.id} className="flex items-start gap-2">
                  <Icon size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="break-words text-sm text-ink">{note.text}</span>
                    <Badge tone="neutral">{t.conditions.sources[note.source]}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

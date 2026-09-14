import { CreditCard, Info, Landmark, Lock, Receipt, UserPlus, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { useId } from "react";

import type { Condition, ConditionKind } from "../../engine/types";
import { t } from "../../i18n/en";
import { Badge, cn, money } from "../../ui";

export interface ConditionListProps {
  conditions: Condition[];
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

/**
 * Drops later conditions that just paraphrase an earlier one: doc and bank sources
 * often describe the same requirement in their own words, and showing both reads as
 * two separate tasks. Two conditions collapse when their `kind`, `amount`, and `days`
 * all match and `amount`/`days` are both non-null — a bare "keep the account open"
 * with no figures attached isn't assumed to be a duplicate of anything. The first
 * occurrence (doc-sourced, by `checklistFor`'s ordering) is kept.
 */
export function collapseSimilar(conditions: Condition[]): Condition[] {
  const seen: Array<{ kind: ConditionKind; amount: number; days: number }> = [];
  const result: Condition[] = [];

  for (const condition of conditions) {
    const { kind, amount, days } = condition;
    const isDuplicate =
      amount != null &&
      days != null &&
      seen.some((s) => s.kind === kind && s.amount === amount && s.days === days);

    if (isDuplicate) continue;
    if (amount != null && days != null) seen.push({ kind, amount, days });
    result.push(condition);
  }

  return result;
}

function metaLine(condition: Condition): string | null {
  const parts: string[] = [];
  if (condition.amount != null) parts.push(t.conditions.meta.amount(money(condition.amount)));
  if (condition.days != null) parts.push(t.conditions.meta.days(condition.days));
  if (condition.count != null) parts.push(t.conditions.meta.count(condition.count));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The checklist of a bonus's conditions — real (doc/bank-sourced) and synthesised —
 * shared by `BonusDrawer` (read-only) and the tracker (interactive, via `onToggle`).
 * Similar doc/bank pairs are collapsed via `collapseSimilar` before rendering. */
export function ConditionList({ conditions, done, onToggle, compact = false }: ConditionListProps) {
  const baseId = useId();
  const collapsed = collapseSimilar(conditions);

  if (collapsed.length === 0) {
    return <p className="text-sm text-muted">{t.conditions.none}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {collapsed.map((condition) => {
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
                    className={cn("text-sm text-ink", compact && "line-clamp-2")}
                  >
                    {condition.text}
                  </label>
                ) : (
                  <span className={cn("text-sm text-ink", compact && "line-clamp-2")}>
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
  );
}

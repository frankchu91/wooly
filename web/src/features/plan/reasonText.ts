import type { Bonus, Reason, Warning } from "../../engine/types";
import { t } from "../../i18n/en";
import { monthLabel } from "../../ui";

// Forces a compile error if a new `Reason`/`Warning` member is ever added without a
// matching branch below, instead of silently falling through at runtime.
function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

/** Renders a plan/skip `Reason` as user-facing copy for a specific bonus. */
export function reasonToText(reason: Reason, bonus: Bonus, antiChurnUntil?: string): string {
  switch (reason) {
    case "expired":
      return t.plan.reasons.expired;
    case "not_in_state":
      return t.plan.reasons.not_in_state;
    case "unknown_availability":
      return t.plan.reasons.unknown_availability;
    case "anti_churn":
      return t.plan.reasons.anti_churn(
        bonus.bank,
        antiChurnUntil ? monthLabel(antiChurnUntil) : "—",
      );
    case "account_open":
      return t.plan.reasons.account_open(bonus.bank);
    case "hard_pull":
      return t.plan.reasons.hard_pull;
    case "chex_sensitive":
      return t.plan.reasons.chex_sensitive;
    case "section_excluded":
      return t.plan.reasons.section_excluded;
    case "dd_too_large":
      return t.plan.reasons.dd_too_large;
    case "no_bonus_amount":
      return t.plan.reasons.no_bonus_amount;
    case "no_capacity":
      return t.plan.reasons.no_capacity;
    case "expires_first":
      return t.plan.reasons.expires_first;
    case "user_skipped":
      return t.plan.reasons.user_skipped;
    default:
      return assertNever(reason);
  }
}

/** Renders a `PlanItem` `Warning` as user-facing copy. */
export function warningToText(warning: Warning): string {
  switch (warning) {
    case "not_enriched":
      return t.plan.warnings.not_enriched;
    case "dd_unknown":
      return t.plan.warnings.dd_unknown;
    case "expires_soon":
      return t.plan.warnings.expires_soon;
    case "has_etf":
      return t.plan.warnings.has_etf;
    default:
      return assertNever(warning);
  }
}

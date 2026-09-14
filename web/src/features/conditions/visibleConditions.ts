import { checklistFor } from "../../engine/conditions";
import type { Bonus, Condition, ConditionKind } from "../../engine/types";
import { SYNTH_LABELS } from "./synthLabels";

/** The kinds that name something the user has to *do*. `fee` and `new_customer` describe
 * the offer rather than ask anything of you, so they are never ticked off. `other` is
 * decided per row (see `isActionable`): it is the kind DoC's "Additional requirements"
 * glance field arrives as, and that field is a list of tasks. */
const CHECKLIST_KINDS: ReadonlySet<ConditionKind> = new Set<ConditionKind>([
  "direct_deposit",
  "deposit",
  "balance",
  "transactions",
  "keep_open",
]);

/** The same opening verbs the scraper's bank-source gate uses (`terms.is_actionable`) —
 * minus `Only new`, which names a `new_customer` condition, a kind this list never
 * checks — so a sentence that survived the scrape for reading like an instruction is
 * treated as one here too. */
const REQUIREMENT_VERB =
  /^(?:Set up|Receive|Make|Maintain|Complete|Keep|Deposit|Open|Must|You must)\b/;

/** `must` appearing anywhere, not just as the opening word — a `keep_open` sentence
 * often reads "the account must remain open…" rather than starting with a verb. */
const CONTAINS_MUST = /\bmust\b/i;

/** A sentence opening with "Earn" describes the reward, not a task — DoC and bank pages
 * both use it for headline copy ("Earn $100 cash offer…") that happens to carry a kind
 * keyword and even a stray figure. */
const STARTS_WITH_EARN = /^Earn\b/;

/** A checklist longer than this is a wall, not a list; anything past it is noise the
 * scraper didn't catch. Notes are capped the same way. */
export const MAX_CHECKLIST = 6;
export const MAX_NOTES = 6;

/** `direct_deposit` and `deposit` are the same requirement described two ways — DoC's
 * structured field vs. a bank page's own prose — so the paraphrase collapse (E2) treats
 * them as one family instead of requiring an exact kind match. */
function family(kind: ConditionKind): ConditionKind {
  return kind === "deposit" ? "direct_deposit" : kind;
}

/** A glance row that names a figure of any sort. DoC's "Additional requirements" field is
 * written as a list of tasks ("Deposit $10,000 in new to Chase funds; 5 qualifying
 * transactions"), so a number in it is a requirement, not decoration (X4). */
const OTHER_HAS_FIGURE = /[$\d]/;

/** True when the condition is a task: an actionable kind whose text either names a day
 * window or a count, or reads as an instruction. A bare dollar figure is not enough on
 * its own (E1) — plenty of fee-waiver and marketing sentences carry one — and a sentence
 * that opens with "Earn" is the reward's own headline, never a requirement (E1). A
 * `keep_open` row with no day window gets one more way in: `must` anywhere in the
 * sentence, not only at the start (E3), since "the account must remain open…" reads as a
 * real requirement without opening on a verb.
 *
 * Two rows come in regardless of any of that:
 * - X2: a `direct_deposit` row that states an amount. The glance block's direct-deposit
 *   field is DoC's answer to "what does this offer ask of you", and it often carries no
 *   deadline at all — "Direct deposit of $200" with no `days` is still the whole job.
 *   Left out, an offer whose only requirement is its direct deposit showed an empty
 *   checklist, which reads as "nothing to do" for the one thing you must do.
 * - X4: an `other` row with a figure in it or an instruction's opening verb — see
 *   `OTHER_HAS_FIGURE`. */
function isActionable(condition: Condition): boolean {
  if (condition.kind === "other") {
    return OTHER_HAS_FIGURE.test(condition.text) || REQUIREMENT_VERB.test(condition.text);
  }
  if (!CHECKLIST_KINDS.has(condition.kind)) return false;
  if (condition.kind === "direct_deposit" && condition.amount != null) return true;
  if (STARTS_WITH_EARN.test(condition.text)) return false;
  if (condition.kind === "keep_open" && condition.days == null) {
    return REQUIREMENT_VERB.test(condition.text) || CONTAINS_MUST.test(condition.text);
  }
  return condition.days != null || condition.count != null || REQUIREMENT_VERB.test(condition.text);
}

const numericCount = (c: Condition) =>
  Number(c.amount != null) + Number(c.days != null) + Number(c.count != null);

/** Two rows describe the same requirement when they share a family (E2) and either
 * agree on a non-null amount, or agree on a non-null day window where at least one side
 * has no amount of its own to disagree with. That second clause is deliberately narrower
 * than "same days": two rows that both name a *different* dollar figure but happen to
 * share a day window are not assumed to be the same rule (a $500 figure and a $1,000
 * figure at 90 days are not paraphrases of each other just because the window matches).
 * A bare row with no figures is never assumed to duplicate anything. */
function isParaphrase(a: Condition, b: Condition): boolean {
  if (family(a.kind) !== family(b.kind)) return false;
  if (a.amount != null && a.amount === b.amount) return true;
  return a.days != null && a.days === b.days && (a.amount == null || b.amount == null);
}

/**
 * Collapses paraphrases, keeping the row that says the most: more non-null figures wins;
 * a tie goes to the DoC-sourced row (the bank's own wording is usually the marketing
 * one); a tie between two rows from the same kind of source goes to the shorter text
 * (the plainer statement of the same rule). Order is preserved — the surviving row sits
 * where the first of the pair did.
 */
export function collapseParaphrases(conditions: Condition[]): Condition[] {
  const kept: Condition[] = [];

  for (const condition of conditions) {
    const index = kept.findIndex((k) => isParaphrase(k, condition));
    if (index === -1) {
      kept.push(condition);
      continue;
    }
    const incumbent = kept[index];
    const incumbentFigures = numericCount(incumbent);
    const candidateFigures = numericCount(condition);
    const incumbentIsDoc = incumbent.source === "doc";
    const candidateIsDoc = condition.source === "doc";

    let replace = candidateFigures > incumbentFigures;
    if (!replace && candidateFigures === incumbentFigures) {
      if (candidateIsDoc && !incumbentIsDoc) replace = true;
      else if (candidateIsDoc === incumbentIsDoc)
        replace = condition.text.length < incumbent.text.length;
    }
    if (replace) kept[index] = condition;
  }

  return kept;
}

/**
 * P4: a tiered offer ("$100 when you deposit $5,000, $300 when you deposit $20,000") is
 * one decision, not three tasks. The checklist keeps the lowest tier — the one that earns
 * the bonus the user is guaranteed, and the only one they have to hit — and the rest move
 * to the notes, where the bigger numbers are still there to read.
 *
 * Recognised by two signals together: several deposit-family rows stating *different*
 * amounts, and a bonus whose own range says the payout varies (`bonus_min !== bonus_max`).
 * Either alone is ordinary — an offer can ask for a deposit and a balance of different
 * sizes, and a range can come from a savings/checking pair — so neither triggers this.
 *
 * Returns the trimmed checklist and the rows that were moved, in their original order.
 */
function collapseTiers(
  checklist: Condition[],
  bonus: Bonus,
): { checklist: Condition[]; tiers: Condition[] } {
  const { bonus_min: min, bonus_max: max } = bonus;
  if (min == null || max == null || min === max) return { checklist, tiers: [] };

  const tiered = checklist.filter((c) => family(c.kind) === "direct_deposit" && c.amount != null);
  const amounts = new Set(tiered.map((c) => c.amount));
  if (tiered.length < 2 || amounts.size < 2) return { checklist, tiers: [] };

  const lowest = tiered.reduce((best, c) => ((c.amount ?? 0) < (best.amount ?? 0) ? c : best));
  const moved = new Set(tiered.filter((c) => c !== lowest));
  return {
    checklist: checklist.filter((c) => !moved.has(c)),
    tiers: checklist.filter((c) => moved.has(c)),
  };
}

export interface SplitConditions {
  /** The tickable requirements — what "3/5 done" counts. */
  checklist: Condition[];
  /** Everything else worth reading once: fees, new-customer rules, free text. */
  notes: Condition[];
}

/**
 * Splits a bonus's conditions into the checklist the user works through and the notes
 * they just need to know. Scraped pages mix the two — a fee schedule and a "new customers
 * only" line are facts about the offer, not tasks — and a checklist that counts them
 * reads as work that can never be finished.
 *
 * Every caller that counts or renders conditions goes through here (`PlanCard`'s chip,
 * both drawers, the ledger and pipeline progress chips), so a count can never drift from
 * the rows actually rendered.
 */
export function splitConditions(bonus: Bonus): SplitConditions {
  const checklist: Condition[] = [];
  const notes: Condition[] = [];

  // `checklistFor` orders doc-sourced rows first, so both caps keep the better source.
  for (const condition of checklistFor(bonus, SYNTH_LABELS)) {
    (isActionable(condition) ? checklist : notes).push(condition);
  }

  const collapsed = collapseTiers(collapseParaphrases(checklist), bonus);

  return {
    checklist: collapsed.checklist.slice(0, MAX_CHECKLIST),
    // The tiers the checklist dropped lead the notes: they are the closest thing to a
    // task in there, and they explain the range on the headline amount.
    notes: [...collapsed.tiers, ...notes].slice(0, MAX_NOTES),
  };
}

/** Every condition a bonus shows, checklist first — for callers that want the lot. */
export function visibleConditions(bonus: Bonus): Condition[] {
  const { checklist, notes } = splitConditions(bonus);
  return [...checklist, ...notes];
}

import { checklistFor } from "../../engine/conditions";
import type { Bonus, Condition, ConditionKind } from "../../engine/types";
import { SYNTH_LABELS } from "./synthLabels";

/** The kinds that name something the user has to *do*. `fee`, `new_customer` and `other`
 * describe the offer rather than ask anything of you, so they are never ticked off. */
const CHECKLIST_KINDS: ReadonlySet<ConditionKind> = new Set<ConditionKind>([
  "direct_deposit",
  "deposit",
  "balance",
  "transactions",
  "keep_open",
]);

/** The same opening verbs the scraper's bank-source gate uses (`terms.is_actionable`),
 * so a sentence that survived the scrape for reading like an instruction is treated as
 * one here too. */
const REQUIREMENT_VERB =
  /^(?:Set up|Receive|Make|Maintain|Complete|Keep|Deposit|Open|Only new|Must|You must)\b/;

/** A checklist longer than this is a wall, not a list; anything past it is noise the
 * scraper didn't catch. Notes are capped the same way. */
export const MAX_CHECKLIST = 6;
export const MAX_NOTES = 6;

/** True when the condition is a task: an actionable kind that either carries a figure or
 * reads as an instruction. */
function isActionable(condition: Condition): boolean {
  if (!CHECKLIST_KINDS.has(condition.kind)) return false;
  return (
    condition.amount != null ||
    condition.days != null ||
    condition.count != null ||
    REQUIREMENT_VERB.test(condition.text)
  );
}

const numericCount = (c: Condition) =>
  Number(c.amount != null) + Number(c.days != null) + Number(c.count != null);

/** Two rows describe the same requirement when they share a kind and agree on a figure —
 * the same rule in two voices ("Receive $1,000 in direct deposits within 90 days" from
 * DoC, "Make $1,000 or more in qualifying direct deposits" from the bank). A bare row
 * with no figures is never assumed to duplicate anything. */
function isParaphrase(a: Condition, b: Condition): boolean {
  if (a.kind !== b.kind) return false;
  if (a.amount != null && a.amount === b.amount) return true;
  return a.days != null && a.days === b.days;
}

/**
 * Collapses paraphrases, keeping the row that says the most: more non-null figures wins,
 * and a tie goes to the DoC-sourced row (the bank's own wording is usually the marketing
 * one). Order is preserved — the surviving row sits where the first of the pair did.
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
    const beatsOnFigures = numericCount(condition) > numericCount(incumbent);
    const beatsOnSource =
      numericCount(condition) === numericCount(incumbent) &&
      condition.source === "doc" &&
      incumbent.source !== "doc";
    if (beatsOnFigures || beatsOnSource) kept[index] = condition;
  }

  return kept;
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

  return {
    checklist: collapseParaphrases(checklist).slice(0, MAX_CHECKLIST),
    notes: notes.slice(0, MAX_NOTES),
  };
}

/** Every condition a bonus shows, checklist first — for callers that want the lot. */
export function visibleConditions(bonus: Bonus): Condition[] {
  const { checklist, notes } = splitConditions(bonus);
  return [...checklist, ...notes];
}

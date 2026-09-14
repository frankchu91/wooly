import { checklistFor } from "../../engine/conditions";
import type { Bonus, Condition } from "../../engine/types";
import { collapseSimilar } from "./ConditionList";
import { SYNTH_LABELS } from "./synthLabels";

/**
 * The conditions a bonus actually shows the user: `checklistFor`'s checklist (real
 * conditions plus any synthesised ones) with doc/bank paraphrases collapsed via
 * `collapseSimilar`. Every caller that counts or renders a bonus's conditions —
 * `PlanCard`'s chip, `BonusDrawer`'s `ConditionList` — reads from this single
 * function, so the chip's count can never drift from the rows actually rendered.
 */
export function visibleConditions(bonus: Bonus): Condition[] {
  return collapseSimilar(checklistFor(bonus, SYNTH_LABELS));
}

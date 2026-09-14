import { t } from "../../i18n/en";

/** The engine's `checklistFor` takes its copy from the caller (§ engine pure) — this
 * maps the synthesis labels it needs onto the English strings in `t.conditions.synth`.
 * Shared by every caller (`BonusDrawer`, `PlanCard`, …) so they all synthesise the same
 * wording. */
export const SYNTH_LABELS = {
  dd: t.conditions.synth.dd,
  ddUnknown: t.conditions.synth.ddUnknown,
  keepOpen: t.conditions.synth.keepOpen,
};

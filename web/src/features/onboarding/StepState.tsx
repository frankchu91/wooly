import type { Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { Select } from "../../ui";
import { US_STATES } from "./states";

const STATE_OPTIONS = US_STATES.map((state) => ({ value: state.code, label: state.name }));

export interface StepStateProps {
  draft: Profile;
  onChange: (patch: Partial<Profile>) => void;
  /** Whether the state combobox grabs focus (and so opens its dropdown) on mount.
   * Defaults to `true`, matching the onboarding wizard's original behaviour — pass
   * `false` when this step is reused somewhere that shouldn't steal focus on load
   * (e.g. Settings). */
  autoFocus?: boolean;
  /** Heading level for the step title. Defaults to `2`, matching the onboarding
   * wizard; pass `3` when this step is nested under a page's own `h2` (e.g. Settings'
   * "Your profile" section). */
  headingLevel?: 2 | 3;
}

export function StepState({ draft, onChange, autoFocus = true, headingLevel = 2 }: StepStateProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Heading className="font-heading text-2xl font-semibold text-ink">
          {t.onboarding.state.h}
        </Heading>
        <p className="text-sm text-muted">{t.onboarding.state.help}</p>
      </div>
      {/* The heading above already states the question visibly, so the label here is
          for assistive tech only — it links to the input via htmlFor without
          repeating the same text a second time on screen. */}
      <label htmlFor="onboarding-state" className="sr-only">
        {t.onboarding.state.h}
      </label>
      <Select
        id="onboarding-state"
        options={STATE_OPTIONS}
        value={draft.state}
        onChange={(value) => onChange({ state: value })}
        searchable
        placeholder={t.onboarding.state.placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

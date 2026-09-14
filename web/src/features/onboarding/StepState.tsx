import type { Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { Select } from "../../ui";
import { US_STATES } from "./states";

const STATE_OPTIONS = US_STATES.map((state) => ({ value: state.code, label: state.name }));

export interface StepStateProps {
  draft: Profile;
  onChange: (patch: Partial<Profile>) => void;
}

export function StepState({ draft, onChange }: StepStateProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold text-ink">{t.onboarding.state.h}</h2>
        <p className="text-sm text-muted">{t.onboarding.state.help}</p>
      </div>
      {/* The h2 above already states the question visibly, so the label here is
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
        autoFocus
      />
    </div>
  );
}

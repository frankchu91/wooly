import { UNLIMITED_SPLITS } from "../../engine";
import type { Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { Segmented, Slider, Toggle, money } from "../../ui";

export interface StepPaycheckProps {
  draft: Profile;
  onChange: (patch: Partial<Profile>) => void;
}

const SPLIT_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5+" },
];

const ACH_HELP_URL =
  "https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/";

export function StepPaycheck({ draft, onChange }: StepPaycheckProps) {
  const splitsValue = draft.maxSplits === UNLIMITED_SPLITS ? "5" : String(draft.maxSplits);

  function handleSplitsChange(value: string) {
    onChange({ maxSplits: value === "5" ? UNLIMITED_SPLITS : Number(value) });
  }

  function updatePrefs(patch: Partial<Profile["prefs"]>) {
    onChange({ prefs: { ...draft.prefs, ...patch } });
  }

  return (
    <div className="flex flex-col gap-8">
      <h2 className="font-heading text-2xl font-semibold text-ink">{t.onboarding.paycheck.h}</h2>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">{t.onboarding.paycheck.amount}</span>
        <Slider
          min={0}
          max={20000}
          step={100}
          value={draft.monthlyDD}
          onChange={(value) => onChange({ monthlyDD: value })}
          format={money}
          label={t.onboarding.paycheck.amount}
        />
        <p className="text-xs text-muted">{t.onboarding.paycheck.amountHelp}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">{t.onboarding.paycheck.splits}</span>
        <Segmented options={SPLIT_OPTIONS} value={splitsValue} onChange={handleSplitsChange} />
        <p className="text-xs text-muted">{t.onboarding.paycheck.splitsHelp}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Toggle
          checked={draft.achPushCountsAsDD}
          onChange={(checked) => onChange({ achPushCountsAsDD: checked })}
          label={t.onboarding.paycheck.ach}
        />
        <a
          href={ACH_HELP_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {t.onboarding.paycheck.achLink}
        </a>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-heading text-base font-semibold text-ink">
          {t.onboarding.paycheck.prefs}
        </h3>
        <Toggle
          checked={draft.prefs.avoidHardPull}
          onChange={(checked) => updatePrefs({ avoidHardPull: checked })}
          label={t.onboarding.paycheck.avoidHardPull}
        />
        <Toggle
          checked={draft.prefs.avoidChexSensitive}
          onChange={(checked) => updatePrefs({ avoidChexSensitive: checked })}
          label={t.onboarding.paycheck.avoidChex}
        />
        <Toggle
          checked={draft.prefs.includeSavings}
          onChange={(checked) => updatePrefs({ includeSavings: checked })}
          label={t.onboarding.paycheck.includeSavings}
        />
        <Toggle
          checked={draft.prefs.includeBusiness}
          onChange={(checked) => updatePrefs({ includeBusiness: checked })}
          label={t.onboarding.paycheck.includeBusiness}
        />
      </div>
    </div>
  );
}

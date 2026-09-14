import { useState } from "react";

import { useData } from "../../data/DataContext";
import type { HistoryEntry, Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { BankAvatar, Button, Card, Select, Toggle } from "../../ui";

export interface StepHistoryProps {
  draft: Profile;
  onChange: (patch: Partial<Profile>) => void;
  onSkip: () => void;
}

export function StepHistory({ draft, onChange, onSkip }: StepHistoryProps) {
  const data = useData();
  // Bumping this key forces the searchable Select to remount (and so clear its
  // internal query text) after every selection — the component has no
  // imperative "clear" API of its own.
  const [resetKey, setResetKey] = useState(0);

  const bankOptions = Array.from(new Set(data.bonuses.map((bonus) => bonus.bank)))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }));

  function handleSelectBank(bank: string) {
    if (bank !== "" && !draft.history.some((entry) => entry.bank === bank)) {
      onChange({ history: [...draft.history, { bank, accountOpen: false }] });
    }
    setResetKey((key) => key + 1);
  }

  function updateEntry(index: number, patch: Partial<HistoryEntry>) {
    onChange({
      history: draft.history.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    });
  }

  function removeEntry(index: number) {
    onChange({ history: draft.history.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold text-ink">{t.onboarding.history.h}</h2>
        <p className="text-sm text-muted">{t.onboarding.history.help}</p>
      </div>

      <Select
        key={resetKey}
        options={bankOptions}
        value=""
        onChange={handleSelectBank}
        searchable
        placeholder={t.onboarding.history.search}
      />

      {draft.history.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {draft.history.map((entry, index) => (
            <Card as="li" key={entry.bank} className="flex flex-wrap items-center gap-4">
              <BankAvatar name={entry.bank} />
              <span className="min-w-[8rem] flex-1 font-medium text-ink">{entry.bank}</span>
              <label className="flex flex-col gap-1 text-xs text-muted">
                {t.onboarding.history.lastBonus}
                <input
                  type="month"
                  value={entry.lastBonusAt ?? ""}
                  onChange={(event) =>
                    updateEntry(index, {
                      lastBonusAt: event.target.value === "" ? undefined : event.target.value,
                    })
                  }
                  aria-label={`${t.onboarding.history.lastBonus} — ${entry.bank}`}
                  className="rounded-control border border-muted/25 bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </label>
              <Toggle
                checked={entry.accountOpen}
                onChange={(checked) => updateEntry(index, { accountOpen: checked })}
                label={t.onboarding.history.open}
              />
              <Button variant="ghost" onClick={() => removeEntry(index)}>
                {t.onboarding.history.remove}
                <span className="sr-only"> {entry.bank}</span>
              </Button>
            </Card>
          ))}
        </ul>
      ) : null}

      <div>
        <Button variant="ghost" onClick={onSkip}>
          {t.onboarding.skip}
        </Button>
      </div>
    </div>
  );
}

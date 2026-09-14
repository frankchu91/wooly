import type { ChangeEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { defaultProfile } from "../../engine/types";
import type { Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { currentMonth, useStore } from "../../state/store";
import { Button, Card, toast } from "../../ui";
import { StepHistory } from "../onboarding/StepHistory";
import { StepPaycheck } from "../onboarding/StepPaycheck";
import { StepState } from "../onboarding/StepState";

const DOC_URL = "https://www.doctorofcredit.com/best-bank-account-bonuses/";
const GITHUB_URL = "https://github.com/haobing/lu_sheep_hair";
const EXPORT_FILENAME = "woolly-export.json";
const IMPORT_INPUT_ID = "settings-import-input";

// Visually mirrors the shared `Button`'s secondary variant so the hidden file input's
// native `<label>` trigger looks like a real button — `Button` itself can't render as a
// `<label>`, and a real `<label htmlFor>` (rather than a button + ref click) keeps the
// file input reachable and activatable by keyboard with zero extra JS.
const IMPORT_LABEL_CLASSES =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-mint px-5 py-3 text-sm font-semibold text-primary transition-colors duration-200 ease-out hover:bg-mint/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function noop() {
  // StepHistory requires an onSkip handler, but "skip" has no meaning once a profile
  // already exists — skipDisabled hides its effect, this just satisfies the prop.
}

export function SettingsPage() {
  const navigate = useNavigate();
  const profile = useStore((state) => state.profile);
  const setProfile = useStore((state) => state.setProfile);
  const exportJSON = useStore((state) => state.exportJSON);
  const importJSON = useStore((state) => state.importJSON);
  const clearAll = useStore((state) => state.clearAll);

  const [draft, setDraft] = useState<Profile>(() => profile ?? defaultProfile(currentMonth()));

  function patchDraft(patch: Partial<Profile>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handleSave() {
    setProfile(draft);
    toast(t.settings.saved);
  }

  function handleExport() {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = EXPORT_FILENAME;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function handleImportChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-importing the same filename later — a browser won't fire another
    // `change` event if the input's value never resets.
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      importJSON(text);
      setDraft(useStore.getState().profile ?? defaultProfile(currentMonth()));
      toast(t.settings.imported);
    } catch {
      toast(t.settings.importError);
    }
  }

  function handleClear() {
    if (!window.confirm(t.settings.clearConfirm)) return;
    clearAll();
    navigate("/");
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.settings.title}</h1>

      <Card as="section" className="flex flex-col gap-8">
        <h2 className="font-heading text-xl font-semibold text-ink">{t.settings.profile}</h2>

        <div className="flex flex-col gap-8 divide-y divide-muted/15 [&>*+*]:pt-8">
          <StepState draft={draft} onChange={patchDraft} />
          <StepPaycheck draft={draft} onChange={patchDraft} />
          <StepHistory draft={draft} onChange={patchDraft} onSkip={noop} skipDisabled />
        </div>

        <div>
          <Button onClick={handleSave}>{t.common.save}</Button>
        </div>
      </Card>

      <Card as="section" className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-ink">{t.settings.data}</h2>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={handleExport}>
            {t.settings.exportBtn}
          </Button>

          <label htmlFor={IMPORT_INPUT_ID} className={IMPORT_LABEL_CLASSES}>
            {t.settings.importBtn}
          </label>
          <input
            id={IMPORT_INPUT_ID}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={handleImportChange}
          />
        </div>
      </Card>

      <Card as="section" className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold text-ink">{t.settings.danger}</h2>

        <div>
          <Button variant="danger" onClick={handleClear}>
            {t.settings.clear}
          </Button>
        </div>
      </Card>

      <Card as="section" className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold text-ink">{t.settings.about}</h2>
        <p className="text-sm text-muted">{t.settings.aboutBody}</p>
        <div className="flex flex-col gap-1 text-sm">
          <a
            href={DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t.footer.source}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t.footer.github}
          </a>
        </div>
      </Card>
    </div>
  );
}

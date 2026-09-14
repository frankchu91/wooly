import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { defaultProfile } from "../../engine/types";
import type { Profile } from "../../engine/types";
import { t } from "../../i18n/en";
import { currentMonth, useStore } from "../../state/store";
import { Button, Stepper } from "../../ui";
import { StepHistory } from "./StepHistory";
import { StepPaycheck } from "./StepPaycheck";
import { StepState } from "./StepState";

const STEP_COUNT = 3;
const LOADING_DELAY_MS = 1200;

function clampStep(raw: string | null): number {
  const parsed = raw === null ? 0 : Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(STEP_COUNT - 1, Math.max(0, Math.trunc(parsed)));
}

function LoadingOverlay() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-cream"
    >
      <motion.span
        aria-hidden="true"
        className="text-5xl"
        animate={reduceMotion ? undefined : { y: [0, -16, 0] }}
        transition={
          reduceMotion ? undefined : { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
        }
      >
        🐑
      </motion.span>
      <p className="text-sm font-medium text-muted">{t.onboarding.loading}</p>
    </div>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const setProfile = useStore((state) => state.setProfile);
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<Profile>(
    () => useStore.getState().profile ?? defaultProfile(currentMonth()),
  );
  const [finishing, setFinishing] = useState(false);
  const reduceMotion = useReducedMotion();

  const step = clampStep(searchParams.get("step"));

  // Track the previous step to derive the slide direction. Mirrors the
  // "adjust state during render" pattern used by the Select/Slider
  // primitives instead of reading a ref during render.
  const [previousStep, setPreviousStep] = useState(step);
  const direction = step >= previousStep ? 1 : -1;
  if (step !== previousStep) {
    setPreviousStep(step);
  }

  useEffect(() => {
    if (!finishing) return;
    const id = window.setTimeout(() => navigate("/plan"), LOADING_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [finishing, navigate]);

  if (finishing) {
    return <LoadingOverlay />;
  }

  function goToStep(next: number) {
    setSearchParams({ step: String(Math.min(STEP_COUNT - 1, Math.max(0, next))) });
  }

  function patchDraft(patch: Partial<Profile>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handleFinish() {
    setProfile(draft);
    setFinishing(true);
  }

  function handleNext() {
    if (step < STEP_COUNT - 1) {
      goToStep(step + 1);
    } else {
      handleFinish();
    }
  }

  const stepValid = step === 0 ? draft.state !== "" : true;

  const slideInitial = reduceMotion ? {} : { opacity: 0, x: direction * 24 };
  const slideExit = reduceMotion ? {} : { opacity: 0, x: direction * -24 };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">
          {t.onboarding.title}
        </h1>
        <Stepper steps={[...t.onboarding.steps]} current={step} />
      </div>

      <AnimatePresence initial={false}>
        <motion.div
          key={step}
          initial={slideInitial}
          animate={{ opacity: 1, x: 0 }}
          exit={slideExit}
          transition={{ duration: 0.2 }}
        >
          {step === 0 ? (
            <StepState draft={draft} onChange={patchDraft} />
          ) : step === 1 ? (
            <StepPaycheck draft={draft} onChange={patchDraft} />
          ) : (
            <StepHistory draft={draft} onChange={patchDraft} onSkip={handleFinish} />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => goToStep(step - 1)}>
            {t.onboarding.back}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={handleNext} disabled={!stepValid}>
          {step === STEP_COUNT - 1 ? t.onboarding.finish : t.onboarding.next}
        </Button>
      </div>
    </div>
  );
}

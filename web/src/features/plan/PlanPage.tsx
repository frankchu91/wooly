import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "../../data/DataContext";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { usePlan } from "../../state/usePlan";
import { Button, EmptyState, Segmented, toast } from "../../ui";
import { MonthColumn } from "./MonthColumn";
import { SkippedList } from "./SkippedList";
import { SummaryBar } from "./SummaryBar";

const HORIZON_OPTIONS = [
  { value: "6", label: t.plan.months(6) },
  { value: "12", label: t.plan.months(12) },
];

export function PlanPage() {
  const navigate = useNavigate();
  const data = useData();
  const profile = useStore((state) => state.profile);
  const updateProfile = useStore((state) => state.updateProfile);
  const trackPlan = useStore((state) => state.trackPlan);
  const plan = usePlan(data.bonuses);

  useEffect(() => {
    if (profile) return;
    toast(t.common.needProfile);
    navigate("/start");
  }, [profile, navigate]);

  // No profile means `plan` is null too (see `usePlan`) — nothing to render while the
  // redirect above takes effect.
  if (!profile || !plan) return null;

  const allItems = plan.months.flatMap((month) => month.items);

  function handleTrack() {
    trackPlan(allItems);
    toast(t.plan.tracked);
    navigate("/tracker");
  }

  if (plan.totals.accounts === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.plan.title}</h1>
        <EmptyState
          title={t.plan.empty.h}
          body={t.plan.empty.body}
          action={<Button to="/start?step=1">{t.plan.empty.cta}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.plan.title}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted">{t.plan.horizon}</span>
          <Segmented
            options={HORIZON_OPTIONS}
            value={String(profile.horizonMonths)}
            onChange={(value) => updateProfile({ horizonMonths: Number(value) })}
          />
        </div>
      </div>

      <SummaryBar plan={plan} />

      <ol className="flex flex-col gap-4 md:grid md:grid-cols-3 lg:grid-cols-4">
        {plan.months.map((month) => (
          <MonthColumn key={month.month} month={month} monthlyDD={profile.monthlyDD} />
        ))}
      </ol>

      <SkippedList skipped={plan.skipped} />

      <div className="sticky bottom-20 z-20 flex justify-end md:bottom-4">
        <Button size="lg" onClick={handleTrack} className="shadow-card">
          {t.plan.track}
        </Button>
      </div>
    </div>
  );
}

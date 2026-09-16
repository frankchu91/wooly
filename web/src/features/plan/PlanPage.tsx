import { Download } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "../../data/DataContext";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { usePlan } from "../../state/usePlan";
import { Button, Card, EmptyState, Segmented, toast } from "../../ui";
import { datedFilename, downloadWorkbook } from "../../xlsx";
import { MonthColumn } from "./MonthColumn";
import { buildPlanWorkbook } from "./planXlsx";
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
  // Guards against StrictMode's dev-mode double-invoke of effects (mount → cleanup →
  // mount) firing the toast twice for a single redirect.
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (profile) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    toast(t.common.needProfile);
    navigate("/start");
  }, [profile, navigate]);

  // No profile means `plan` is null too (see `usePlan`) — nothing to render while the
  // redirect above takes effect.
  if (!profile || !plan) return null;

  const allItems = plan.months.flatMap((month) => month.items);
  // Most of the dataset is list-page data only, so the "go and check" instruction is a
  // page-level notice rather than a red line repeated on every card.
  const hasUnverified = allItems.some((item) => !item.bonus.enriched);

  function handleTrack() {
    trackPlan(allItems);
    toast(t.plan.tracked);
    navigate("/tracker");
  }

  async function handleDownload() {
    if (!plan) return;
    await downloadWorkbook(datedFilename("plan", new Date()), await buildPlanWorkbook(plan));
    toast(t.plan.downloaded);
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
            aria-label={t.plan.horizon}
          />
          {/* The horizon control tweaks the plan in place; this is the way back to the
           * answers the plan was built from. */}
          <Button to="/start" variant="secondary" size="sm">
            {t.plan.replan}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleDownload()}
            icon={<Download size={15} aria-hidden="true" />}
          >
            {t.plan.download}
          </Button>
        </div>
      </div>

      <SummaryBar plan={plan} />

      {hasUnverified ? (
        <Card tone="mint">
          <p className="text-sm text-primary-dark">{t.plan.unverifiedNotice}</p>
        </Card>
      ) : null}

      <ol className="flex flex-col gap-4 md:grid md:grid-cols-3 lg:grid-cols-4">
        {plan.months.map((month) => (
          <MonthColumn key={month.month} month={month} monthlyDD={profile.monthlyDD} />
        ))}
      </ol>

      <SkippedList skipped={plan.skipped} />

      {/* The two things you can do with a finished plan: take it with you, or keep it
       * here. Download is the filled one: the plan as a file you can work from is what
       * the product is for, and the owner asked for it to be unmissable. They sit below
       * the plan rather than in the page header because they are an answer to it, not a
       * setting on it; the header carries a second, quieter Download for a long plan.
       *
       * One opaque bar rather than two floating buttons — a translucent secondary button
       * hovering over a card underneath it reads as a rendering mistake, and on a phone
       * the two of them covered half the first month. */}
      <div className="sticky bottom-20 z-20 ml-auto flex w-full flex-col gap-2 rounded-card border border-mint bg-surface p-2 shadow-card sm:w-auto sm:flex-row sm:items-center">
        <Button size="lg" variant="secondary" onClick={handleTrack}>
          {t.plan.track}
        </Button>
        <Button
          size="lg"
          onClick={() => void handleDownload()}
          icon={<Download size={17} aria-hidden="true" />}
        >
          {t.plan.download}
        </Button>
      </div>
    </div>
  );
}

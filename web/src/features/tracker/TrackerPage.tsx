import { useData } from "../../data/DataContext";
import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { STATUS_ORDER, useStore } from "../../state/store";
import type { TrackedItem, TrackStatus } from "../../state/store";
import { Badge, Button, Card, EmptyState, MoneyText } from "../../ui";
import { TrackedCard } from "./TrackedCard";

const STATUSES_COUNTING_AS_EARNED: TrackStatus[] = ["received", "closed"];

/** Sums `bonus_max` (the headline) and `bonus_min` (what a typical user clears) over a
 * set of tracked items, so the caller can show a range where the two diverge. */
function sumBonuses(
  items: TrackedItem[],
  bonuses: Bonus[],
): { min: number; max: number; differs: boolean } {
  let min = 0;
  let max = 0;
  for (const item of items) {
    const bonus = bonuses.find((b) => b.id === item.bonusId);
    max += bonus?.bonus_max ?? 0;
    min += bonus?.bonus_min ?? bonus?.bonus_max ?? 0;
  }
  return { min, max, differs: min !== max };
}

export function TrackerPage() {
  const data = useData();
  const tracker = useStore((state) => state.tracker);
  const profile = useStore((state) => state.profile);

  // A received bonus paid what it paid, so "Earned" shows the max outright; anything
  // still in progress could land anywhere in its range, so that one shows the range.
  const earned = sumBonuses(
    tracker.filter((item) => STATUSES_COUNTING_AS_EARNED.includes(item.status)),
    data.bonuses,
  );
  const inProgress = sumBonuses(
    tracker.filter((item) => !STATUSES_COUNTING_AS_EARNED.includes(item.status)),
    data.bonuses,
  );

  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: tracker.filter((item) => item.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6 pb-4">
      <h1 className="font-heading text-2xl font-bold text-ink md:text-3xl">{t.tracker.title}</h1>

      {tracker.length === 0 ? (
        <EmptyState
          title={t.tracker.empty.h}
          body={t.tracker.empty.body}
          action={<Button to={profile ? "/plan" : "/start"}>{t.tracker.empty.cta}</Button>}
        />
      ) : (
        <>
          <Card tone="ink" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
                {t.tracker.earned}
              </p>
              <div className="mt-1">
                <MoneyText value={earned.max} size="xl" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
                {t.tracker.inProgress}
              </p>
              <div className="mt-1">
                <MoneyText
                  value={inProgress.max}
                  range={inProgress.differs ? [inProgress.min, inProgress.max] : undefined}
                  size="xl"
                />
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {groups.map((group) => (
              <section
                key={group.status}
                // A lone group would otherwise sit in the left half with nothing beside
                // it; two or more share the row.
                className={groups.length === 1 ? "lg:col-span-2" : undefined}
              >
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="font-heading text-lg font-semibold text-ink">
                    {t.tracker.statuses[group.status]}
                  </h2>
                  <Badge>{group.items.length}</Badge>
                </div>
                <ul className="flex flex-col gap-3">
                  {group.items.map((item) => (
                    <TrackedCard
                      key={item.id}
                      item={item}
                      bonus={data.bonuses.find((b) => b.id === item.bonusId)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <Card tone="mint">
        <p className="text-sm text-primary-dark">{t.tracker.pro}</p>
      </Card>
    </div>
  );
}

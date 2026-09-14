import { useData } from "../../data/DataContext";
import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import type { TrackedItem, TrackStatus } from "../../state/store";
import { Badge, Button, EmptyState, MoneyText } from "../../ui";
import { STATUS_ORDER, TrackedCard } from "./TrackedCard";

const STATUSES_COUNTING_AS_EARNED: TrackStatus[] = ["received", "closed"];

function sumBonusMax(items: TrackedItem[], bonuses: Bonus[]): number {
  return items.reduce((sum, item) => {
    const bonus = bonuses.find((b) => b.id === item.bonusId);
    return sum + (bonus?.bonus_max ?? 0);
  }, 0);
}

export function TrackerPage() {
  const data = useData();
  const tracker = useStore((state) => state.tracker);
  const profile = useStore((state) => state.profile);

  const earned = sumBonusMax(
    tracker.filter((item) => STATUSES_COUNTING_AS_EARNED.includes(item.status)),
    data.bonuses,
  );
  const inProgress = sumBonusMax(
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
          {/* A plain element rather than the shared `Card` — see `SummaryBar`'s note on
           * why a `bg-ink` override via `className` doesn't reliably beat `Card`'s own
           * `bg-surface`. */}
          <div className="flex flex-col gap-4 rounded-card bg-ink p-5 text-cream shadow-card sm:flex-row sm:items-center sm:gap-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
                {t.tracker.earned}
              </p>
              <div className="mt-1">
                <MoneyText value={earned} size="xl" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-cream/70">
                {t.tracker.inProgress}
              </p>
              <div className="mt-1">
                <MoneyText value={inProgress} size="xl" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.status}>
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

      {/* Same reasoning as the ink card above — `bg-mint` needs to win outright, so this
       * skips the shared `Card` rather than overriding its background via `className`. */}
      <div className="rounded-card bg-mint p-5 shadow-card">
        <p className="text-sm text-primary-dark">{t.tracker.pro}</p>
      </div>
    </div>
  );
}

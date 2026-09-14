import { t } from "../../i18n/en";
import { Segmented, cn } from "../../ui";
import { CHIP_KEYS, SORT_KEYS } from "./useBonusFilters";
import type { SortKey, UseBonusFiltersResult } from "./useBonusFilters";

export interface FiltersProps {
  filters: UseBonusFiltersResult;
  hasProfile: boolean;
}

/** Search box, AND-combined filter chips, and the sort control for the `/bonuses`
 * browse page. The `myState` chip and `score` sort both need a profile to mean
 * anything, so both are disabled (with a `needProfile` tooltip) until one exists. */
export function Filters({ filters, hasProfile }: FiltersProps) {
  const sortOptions = SORT_KEYS.map((key) => {
    const disabled = key === "score" && !hasProfile;
    return {
      value: key,
      label: t.bonuses.sort[key],
      disabled,
      title: disabled ? t.bonuses.needProfile : undefined,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        aria-label={t.bonuses.search}
        placeholder={t.bonuses.search}
        value={filters.q}
        onChange={(event) => filters.setQ(event.target.value)}
        className="w-full rounded-control border border-muted/25 bg-surface px-3 py-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.bonuses.filtersLabel}>
          {CHIP_KEYS.map((chip) => {
            const disabled = chip === "myState" && !hasProfile;
            const active = filters.chips.has(chip);
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={disabled ? t.bonuses.needProfile : undefined}
                onClick={() => filters.toggleChip(chip)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 ease-out",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  active ? "bg-primary text-white" : "bg-mint/40 text-ink hover:bg-mint/60",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {t.bonuses.filters[chip]}
              </button>
            );
          })}
        </div>

        <Segmented
          options={sortOptions}
          value={filters.sort}
          onChange={(value) => filters.setSort(value as SortKey)}
          aria-label={t.bonuses.sortLabel}
        />
      </div>
    </div>
  );
}

import { differenceInCalendarDays, parseISO } from "date-fns";

import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { Badge, BankAvatar, MoneyText, money } from "../../ui";

export interface BonusCardProps {
  bonus: Bonus;
  onOpen: (id: string) => void;
}

function isFeeAvoidable(bonus: Bonus): boolean {
  return (
    bonus.monthly_fee === null ||
    bonus.monthly_fee.amount === 0 ||
    bonus.monthly_fee.avoidable === true
  );
}

function isExpiringSoon(bonus: Bonus, today: Date): boolean {
  if (!bonus.expiration) return false;
  const days = differenceInCalendarDays(parseISO(bonus.expiration), today);
  return days >= 0 && days <= 30;
}

/**
 * One offer in the `/bonuses` list: a row on a hairline, not a boxed tile.
 *
 * Two hundred and forty white cards in a three-up grid is a wall; a row per offer with
 * the amount pinned to the right edge reads as a list you can run your eye down, and
 * the amounts line up into a column you can compare. The whole row is one `<button>`
 * that opens the `BonusDrawer`, so there is nothing to aim for.
 */
export function BonusCard({ bonus, onOpen }: BonusCardProps) {
  const expiringSoon = isExpiringSoon(bonus, new Date());

  return (
    <li className="border-b border-ink/10">
      <button
        type="button"
        onClick={() => onOpen(bonus.id)}
        className="group flex w-full items-start gap-3 rounded-control px-2 py-4 text-left transition-colors duration-200 ease-out hover:bg-mint/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:gap-4 sm:px-3"
      >
        <BankAvatar name={bonus.bank} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="font-heading text-base font-semibold leading-snug text-ink">
            {bonus.title}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {bonus.pull === "soft" ? <Badge tone="mint">{t.plan.badges.softPull}</Badge> : null}
            {bonus.pull === "hard" ? <Badge tone="coral">{t.plan.badges.hardPull}</Badge> : null}
            {bonus.dd.required === false ? (
              <Badge tone="gold">{t.plan.badges.noDD}</Badge>
            ) : bonus.dd.amount != null ? (
              <Badge tone="neutral">{t.plan.badges.dd(money(bonus.dd.amount))}</Badge>
            ) : null}
            {isFeeAvoidable(bonus) ? <Badge tone="mint">{t.plan.badges.noFee}</Badge> : null}
            {bonus.section === "savings" ? (
              <Badge tone="neutral">{t.bonuses.filters.savings}</Badge>
            ) : null}
            {bonus.section === "business" ? (
              <Badge tone="neutral">{t.bonuses.filters.business}</Badge>
            ) : null}
            {bonus.availability.nationwide ? (
              <Badge tone="neutral">{t.bonuses.nationwide}</Badge>
            ) : bonus.availability.states.length > 0 ? (
              <Badge tone="neutral">{bonus.availability.states.join(", ")}</Badge>
            ) : null}
            {expiringSoon ? <Badge tone="coral">{t.plan.warnings.expires_soon}</Badge> : null}
            {!bonus.enriched ? <Badge tone="neutral">{t.bonuses.verify}</Badge> : null}
          </div>
        </div>
        <MoneyText
          value={bonus.bonus_max}
          range={[bonus.bonus_min, bonus.bonus_max]}
          size="md"
          className="shrink-0 pt-0.5"
        />
      </button>
    </li>
  );
}

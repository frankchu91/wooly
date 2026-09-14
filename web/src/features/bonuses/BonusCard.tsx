import { differenceInCalendarDays, parseISO } from "date-fns";

import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { Badge, BankAvatar, Card, MoneyText, money } from "../../ui";

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

/** A single offer within the `/bonuses` browse grid. Always an `<li>` containing a
 * full-card `<button>` that opens the `BonusDrawer` for this bonus. */
export function BonusCard({ bonus, onOpen }: BonusCardProps) {
  const expiringSoon = isExpiringSoon(bonus, new Date());

  return (
    <Card as="li" className="p-0">
      <button
        type="button"
        onClick={() => onOpen(bonus.id)}
        className="flex w-full flex-col gap-3 rounded-card p-5 text-left transition-colors duration-200 ease-out hover:bg-mint/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex items-start gap-3">
          <BankAvatar name={bonus.bank} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-heading text-sm font-semibold text-ink">
              {bonus.title}
            </h3>
            <MoneyText value={bonus.bonus_max} size="md" />
          </div>
        </div>

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
      </button>
    </Card>
  );
}

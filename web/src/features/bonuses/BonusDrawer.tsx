import { useNavigate } from "react-router-dom";

import { useData } from "../../data/DataContext";
import { evaluate } from "../../engine";
import type { Bonus, Reason } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { usePlan } from "../../state/usePlan";
import { Badge, Button, Drawer, MoneyText, dateLabel, money } from "../../ui";
import { ConditionList } from "../conditions/ConditionList";
import { splitConditions } from "../conditions/visibleConditions";
import { reasonToText } from "../plan/reasonText";

export interface BonusDrawerProps {
  bonus: Bonus | null;
  open: boolean;
  onClose: () => void;
}

// Reasons the user can do something about from the preferences step. Where a bonus is
// available, and whether it has expired, are facts about the world — offering to "change
// preferences" for those would send the user on a pointless errand.
const FIXABLE_BY_PREFERENCES: Reason[] = [
  "hard_pull",
  "chex_sensitive",
  "section_excluded",
  "dd_too_large",
];

function isFeeAvoidable(bonus: Bonus): boolean {
  return (
    bonus.monthly_fee === null ||
    bonus.monthly_fee.amount === 0 ||
    bonus.monthly_fee.avoidable === true
  );
}

interface GlanceRow {
  key: keyof typeof t.bonuses.glance;
  label: string;
  value: string;
}

function glanceRows(bonus: Bonus): GlanceRow[] {
  const bonusValue =
    bonus.bonus_max == null
      ? t.bonuses.unknown
      : bonus.bonus_min != null && bonus.bonus_min !== bonus.bonus_max
        ? `${money(bonus.bonus_min)} – ${money(bonus.bonus_max)}`
        : money(bonus.bonus_max);

  const availabilityValue = bonus.availability.nationwide
    ? t.bonuses.nationwide
    : bonus.availability.states.length > 0
      ? bonus.availability.states.join(", ")
      : t.bonuses.unknown;

  const ddValue =
    bonus.dd.required === false
      ? t.plan.badges.noDD
      : bonus.dd.amount != null
        ? t.plan.badges.dd(money(bonus.dd.amount))
        : t.bonuses.unknown;

  const deadlineValue =
    bonus.dd.deadline_days != null ? t.bonuses.days(bonus.dd.deadline_days) : t.bonuses.unknown;

  const pullValue =
    bonus.pull === "soft"
      ? t.plan.badges.softPull
      : bonus.pull === "hard"
        ? t.plan.badges.hardPull
        : t.bonuses.unknown;

  const feeValue =
    bonus.monthly_fee == null
      ? t.bonuses.unknown
      : isFeeAvoidable(bonus)
        ? t.plan.badges.noFee
        : money(bonus.monthly_fee.amount);

  const etfValue =
    bonus.etf == null
      ? t.bonuses.unknown
      : `${bonus.etf.amount != null ? money(bonus.etf.amount) : t.bonuses.unknown} · ${
          bonus.etf.days != null ? t.bonuses.days(bonus.etf.days) : t.bonuses.unknown
        }`;

  const expiresValue = bonus.expiration ? dateLabel(bonus.expiration) : t.bonuses.unknown;

  const antiChurnValue =
    bonus.anti_churn_months != null ? t.bonuses.months(bonus.anti_churn_months) : t.bonuses.unknown;

  return [
    { key: "bonus", label: t.bonuses.glance.bonus, value: bonusValue },
    { key: "availability", label: t.bonuses.glance.availability, value: availabilityValue },
    { key: "dd", label: t.bonuses.glance.dd, value: ddValue },
    { key: "deadline", label: t.bonuses.glance.deadline, value: deadlineValue },
    { key: "pull", label: t.bonuses.glance.pull, value: pullValue },
    { key: "chex", label: t.bonuses.glance.chex, value: bonus.chexsystems ?? t.bonuses.unknown },
    { key: "cc", label: t.bonuses.glance.cc, value: bonus.cc_funding ?? t.bonuses.unknown },
    { key: "fee", label: t.bonuses.glance.fee, value: feeValue },
    { key: "etf", label: t.bonuses.glance.etf, value: etfValue },
    { key: "expires", label: t.bonuses.glance.expires, value: expiresValue },
    { key: "antiChurn", label: t.bonuses.glance.antiChurn, value: antiChurnValue },
  ];
}

/** The detail view for a single offer, opened from `BonusCard` or `PlanCard`'s
 * "Details" action. Renders nothing (via `Drawer`'s own closed state) unless both
 * `open` and `bonus` are set, so a caller can flip `open` off first without this
 * component reading fields off a `null` bonus. */
export function BonusDrawer({ bonus, open, onClose }: BonusDrawerProps) {
  const navigate = useNavigate();
  const data = useData();
  const profile = useStore((state) => state.profile);
  const skippedIds = useStore((state) => state.skippedIds);
  const restore = useStore((state) => state.restore);
  const plan = usePlan(data.bonuses);

  const isOpen = open && bonus != null;

  if (!bonus) {
    return (
      <Drawer open={false} onClose={onClose} title="">
        {null}
      </Drawer>
    );
  }

  const isSkipped = skippedIds.includes(bonus.id);
  const isInPlan =
    !isSkipped &&
    (plan?.months.some((month) => month.items.some((item) => item.bonus.id === bonus.id)) ?? false);

  const evaluation = profile ? evaluate(bonus, profile, new Date()) : null;
  const isIneligible = evaluation != null && !evaluation.eligible;
  const canChangePrefs =
    isIneligible && evaluation.reasons.some((reason) => FIXABLE_BY_PREFERENCES.includes(reason));
  // Eligible, not skipped, but the scheduler couldn't find it a home (no capacity left,
  // or another offer from the same bank already took the one slot). "Add to plan" would
  // be a lie, so it's shown disabled with the reason instead.
  const notPlaced = evaluation?.eligible === true && plan != null && !isSkipped && !isInPlan;

  const conditions = splitConditions(bonus);

  const bonusId = bonus.id;
  function handleAddToPlan() {
    if (isSkipped) restore(bonusId);
    navigate("/plan");
  }

  return (
    <Drawer open={isOpen} onClose={onClose} title={bonus.title}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <MoneyText value={bonus.bonus_max} range={[bonus.bonus_min, bonus.bonus_max]} size="xl" />
          {!bonus.enriched ? <Badge tone="neutral">{t.bonuses.verify}</Badge> : null}
        </div>

        {/* The chip alone reads as a shrug; paired with this line it's an instruction. */}
        {!bonus.enriched ? <p className="text-sm text-muted">{t.bonuses.verifyBody}</p> : null}

        <p className="text-sm text-muted">{bonus.summary}</p>

        <div className="flex flex-col gap-2">
          <h3 className="font-heading text-sm font-semibold text-ink">
            {t.bonuses.conditionsTitle}
          </h3>
          <ConditionList conditions={conditions.checklist} notes={conditions.notes} />
          {bonus.terms.status === "ok" && bonus.offer_url ? (
            <a
              href={bonus.offer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              {t.bonuses.terms.bankPage}
            </a>
          ) : bonus.terms.status === "blocked" || bonus.terms.status === "error" ? (
            <p className="text-sm text-muted">{t.bonuses.terms.unreadable}</p>
          ) : null}
        </div>

        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
          {glanceRows(bonus).map((row) => (
            <div key={row.key} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        {profile && evaluation ? (
          evaluation.eligible ? (
            <p className="text-sm font-semibold text-primary-dark">{t.bonuses.eligible}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-coral-dark">
              {evaluation.reasons.map((reason) => (
                <li key={reason}>{reasonToText(reason, bonus, evaluation.antiChurnUntil)}</li>
              ))}
            </ul>
          )
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {isIneligible ? (
            // No "Add to plan" for something the user can't open — the only useful action
            // is the one that might make them eligible, and only when there is one.
            canChangePrefs ? (
              <Button variant="secondary" to="/start?step=1">
                {t.bonuses.changePrefs}
              </Button>
            ) : null
          ) : notPlaced ? (
            <Button disabled>{t.bonuses.notPlaced}</Button>
          ) : (
            <Button onClick={handleAddToPlan} disabled={isInPlan}>
              {isInPlan ? t.bonuses.inPlan : t.bonuses.addToPlan}
            </Button>
          )}
          <a
            href={bonus.doc_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t.bonuses.openDoc}
          </a>
        </div>
      </div>
    </Drawer>
  );
}

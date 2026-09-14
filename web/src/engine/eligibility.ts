import { addMonths, differenceInCalendarDays, format, isBefore, parseISO } from "date-fns";
import type { Bonus, Evaluation, Profile, Reason, Warning } from "./types";

export const DEFAULT_ANTI_CHURN_MONTHS = 24;
export const normalizeBankName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function evaluate(bonus: Bonus, profile: Profile, today: Date): Evaluation {
  const reasons: Reason[] = [];
  const warnings: Warning[] = [];
  let antiChurnUntil: string | undefined;

  if (bonus.bonus_max == null) reasons.push("no_bonus_amount");
  if (bonus.expiration && isBefore(parseISO(bonus.expiration), today)) reasons.push("expired");
  const { nationwide, states } = bonus.availability;
  if (!nationwide && states.length === 0) reasons.push("unknown_availability");
  else if (!nationwide && !states.includes(profile.state)) reasons.push("not_in_state");

  const key = normalizeBankName(bonus.bank);
  const hist = profile.history.find((h) => normalizeBankName(h.bank) === key);
  if (hist?.accountOpen) reasons.push("account_open");
  if (hist?.lastBonusAt) {
    const window = bonus.anti_churn_months ?? DEFAULT_ANTI_CHURN_MONTHS;
    const until = addMonths(parseISO(`${hist.lastBonusAt}-01`), window);
    if (isBefore(today, until)) {
      reasons.push("anti_churn");
      antiChurnUntil = format(until, "yyyy-MM");
    }
  }
  if (profile.prefs.avoidHardPull && bonus.pull === "hard") reasons.push("hard_pull");
  if (profile.prefs.avoidChexSensitive && /sensitive/i.test(bonus.chexsystems ?? ""))
    reasons.push("chex_sensitive");
  if (
    (bonus.section === "savings" && !profile.prefs.includeSavings) ||
    (bonus.section === "business" && !profile.prefs.includeBusiness)
  )
    reasons.push("section_excluded");

  const ddMonths = Math.max(
    1,
    Math.min(Math.ceil((bonus.dd.deadline_days ?? 60) / 30), profile.horizonMonths),
  );
  if (
    bonus.dd.required !== false &&
    bonus.dd.amount != null &&
    bonus.dd.amount > profile.monthlyDD * ddMonths
  )
    reasons.push("dd_too_large");

  if (!bonus.enriched) warnings.push("not_enriched");
  if (bonus.dd.required !== false && bonus.dd.amount == null) warnings.push("dd_unknown");
  if (
    bonus.expiration &&
    differenceInCalendarDays(parseISO(bonus.expiration), today) <= 30 &&
    !reasons.includes("expired")
  )
    warnings.push("expires_soon");
  if ((bonus.etf?.amount ?? 0) > 0) warnings.push("has_etf");

  return { eligible: reasons.length === 0, reasons, warnings, antiChurnUntil };
}

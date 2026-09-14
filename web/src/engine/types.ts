export type Section = "checking" | "savings" | "business" | "state" | "regional";
export type Pull = "soft" | "hard" | "unknown";
export interface Bonus {
  id: string;
  bank: string;
  title: string;
  section: Section;
  summary: string;
  doc_url: string;
  offer_url: string | null;
  bonus_min: number | null;
  bonus_max: number | null;
  availability: { nationwide: boolean; states: string[] };
  dd: { required: boolean | null; amount: number | null; deadline_days: number | null };
  pull: Pull;
  chexsystems: string | null;
  cc_funding: string | null;
  monthly_fee: { amount: number; avoidable: boolean | null } | null;
  etf: { amount: number | null; days: number | null } | null;
  household_limit: string | null;
  expiration: string | null;
  anti_churn_months: number | null;
  additional_requirements: string | null;
  enriched: boolean;
  enriched_at: string | null;
  post_modified: string | null;
  last_seen: string;
}
export interface HistoryEntry {
  bank: string;
  lastBonusAt?: string;
  accountOpen: boolean;
}
export interface Profile {
  state: string;
  monthlyDD: number;
  maxSplits: number;
  achPushCountsAsDD: boolean;
  prefs: {
    avoidHardPull: boolean;
    avoidChexSensitive: boolean;
    includeBusiness: boolean;
    includeSavings: boolean;
  };
  history: HistoryEntry[];
  horizonMonths: number;
  startMonth: string;
}
export type Reason =
  | "expired"
  | "not_in_state"
  | "unknown_availability"
  | "anti_churn"
  | "account_open"
  | "hard_pull"
  | "chex_sensitive"
  | "section_excluded"
  | "dd_too_large"
  | "no_bonus_amount"
  | "user_skipped"
  | "no_capacity"
  | "expires_first";
export type Warning = "not_enriched" | "dd_unknown" | "expires_soon" | "has_etf";
export interface Evaluation {
  eligible: boolean;
  reasons: Reason[];
  warnings: Warning[];
  antiChurnUntil?: string;
}
export interface PlanItem {
  bonus: Bonus;
  openMonth: string;
  ddSchedule: { month: string; amount: number }[];
  ddDeadline: string;
  safeCloseDate: string | null;
  warnings: Warning[];
}
export interface PlanMonth {
  month: string;
  items: PlanItem[];
  ddUsed: number;
  slotsUsed: number;
}
export interface Plan {
  months: PlanMonth[];
  skipped: { bonus: Bonus; reasons: Reason[]; antiChurnUntil?: string }[];
  totals: { projected: number; projectedMin: number; accounts: number; avgDDUsed: number };
}
export interface Dataset {
  generated_at: string | null;
  source: string;
  bonuses: Bonus[];
}
export const defaultProfile = (startMonth: string): Profile => ({
  state: "",
  monthlyDD: 5000,
  maxSplits: 2,
  achPushCountsAsDD: false,
  prefs: {
    avoidHardPull: true,
    avoidChexSensitive: false,
    includeBusiness: false,
    includeSavings: true,
  },
  history: [],
  horizonMonths: 12,
  startMonth,
});

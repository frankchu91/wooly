export type Section = "checking" | "savings" | "business" | "state" | "regional";
export type Pull = "soft" | "hard" | "unknown";
export type ConditionKind =
  | "direct_deposit"
  | "deposit"
  | "balance"
  | "transactions"
  | "keep_open"
  | "fee"
  | "new_customer"
  | "other";
export type ConditionSource = "doc" | "bank";
export type TermsStatus = "none" | "ok" | "blocked" | "error";
export interface Condition {
  id: string;
  kind: ConditionKind;
  text: string;
  amount: number | null;
  days: number | null;
  count: number | null;
  source: ConditionSource;
}
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
  conditions: Condition[];
  hold_days: number | null;
  terms: { status: TermsStatus | null; url: string | null; fetched_at: string | null };
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
export type TrackStatus = "planned" | "opened" | "requirements_met" | "received" | "closed";
export interface TrackedItem {
  id: string;
  bonusId: string;
  status: TrackStatus;
  dates: Partial<Record<TrackStatus, string>>;
  openMonth: string;
  /** Ids of the bonus's `Condition`s (see `engine/conditions.ts`) the user has ticked
   * off. Always an array, even when empty. */
  conditionsDone: string[];
  /** The amount the user says actually posted, when it differs from — or simply
   * confirms — the bonus's headline `bonus_max`. Absent until they enter one. */
  bonusReceived?: number;
  /** How many of the offer's required direct deposits have gone out. Absent means none
   * recorded; compared against `depositsNeeded(bonus)`. */
  depositsSent?: number;
  notes?: string;
  /** Who the account is for, in the user's own words ("me", "partner", "joint"). Bonus
   * chasers run the same offer across a household, and the spreadsheet this tracker
   * replaces had a column for it. Absent until they fill it in; never empty. */
  applicant?: string;
}
// The order `advance` walks through; `closed` has no successor, so advancing there is a
// no-op. Also the canonical stage ordering `setStatus` uses to tell a forward move from
// a backward one, and that the tracker UI orders its groups/columns by.
export const STATUS_ORDER: TrackStatus[] = [
  "planned",
  "opened",
  "requirements_met",
  "received",
  "closed",
];
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

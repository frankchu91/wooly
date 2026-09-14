# Woolly Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Vite + React site where a visitor enters state, direct-deposit capacity and bank history, and gets an explainable 12-month bank-bonus plan, a local tracker, and a browsable offer list.

**Architecture:** `engine/` is pure TypeScript (eligibility → scoring → greedy scheduler) with no DOM dependency. A zustand store persists the profile, skipped ids and tracker to localStorage; the plan is derived, never stored. Pages under `features/` compose design-system primitives from `ui/`. Data is `data/bonuses.json` copied into `web/public/` at dev/build time and fetched at runtime.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), Tailwind CSS 3, react-router-dom 6, zustand 4, framer-motion 11, lucide-react, date-fns 3, vitest + @testing-library/react + jsdom, Playwright, eslint + prettier. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-09-13-woolly-mvp-design.md` (§4 Engine, §5 UX/UI, §6 Testing)

## Global Constraints

- All UI strings live in `web/src/i18n/en.ts` and are imported as `t.<key>`; no hard-coded copy in components.
- Design tokens exactly as spec §5.1: bg `#FBF8F3`, surface `#FFFFFF`, ink `#1F2A24`, muted `#6B7A72`, primary `#1E7F5C`, mint `#DDF3E8`, coral `#F28C6B`, gold `#F5C451`; radii 16/12/999; fonts Manrope (headings) + Inter (body).
- `engine/` must never import from React, the store, or the DOM. Engine functions are deterministic and take `today`/`startMonth` as parameters.
- Months are `YYYY-MM` strings; dates are ISO `YYYY-MM-DD`; use `date-fns`.
- Every field of `Bonus` except `id`, `bank`, `title`, `section`, `doc_url`, `last_seen` may be null; components must render gracefully with nulls (show "—" or "verify on DoC").
- Mobile-first; no horizontal page scroll at 400 px.
- Commit after every task with trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Run `pnpm test` and `pnpm typecheck` before each commit.
- Commands run from `web/` unless stated.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `web/package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html` | tooling |
| `web/scripts/copy-data.mjs` | copies `../data/bonuses.json` → `public/bonuses.json` (predev/prebuild) |
| `web/src/i18n/en.ts` | all copy |
| `web/src/styles.css` | Tailwind layers + tokens + font import |
| `web/src/engine/types.ts` | `Bonus`, `Profile`, `Reason`, `Warning`, `Plan`, `PlanItem` |
| `web/src/engine/eligibility.ts` | `evaluate(bonus, profile, today)` |
| `web/src/engine/scoring.ts` | `score(bonus)` |
| `web/src/engine/scheduler.ts` | `buildPlan(bonuses, profile, opts)` |
| `web/src/engine/index.ts` | re-exports |
| `web/src/data/loadBonuses.ts` | fetch + validate `/bonuses.json` |
| `web/src/data/fixture.ts` | 8 hand-written bonuses for tests and Storybook-free dev |
| `web/src/data/useBonuses.ts` | React hook with loading/error state |
| `web/src/state/store.ts` | zustand store (`profile`, `skippedIds`, `tracker`) + persist |
| `web/src/state/usePlan.ts` | derived plan hook |
| `web/src/ui/*.tsx` | Button, Card, Badge, MoneyText, Field, Select, Slider, Toggle, Segmented, Stepper, Drawer, EmptyState, Toast, BankAvatar |
| `web/src/features/layout/{Header,Footer,Layout}.tsx` | shell |
| `web/src/features/landing/Landing.tsx` | `/` |
| `web/src/features/onboarding/{Onboarding,StepState,StepPaycheck,StepHistory}.tsx` | `/start` |
| `web/src/features/plan/{PlanPage,MonthColumn,PlanCard,SkippedList,SummaryBar}.tsx` | `/plan` |
| `web/src/features/tracker/{TrackerPage,TrackedCard}.tsx` | `/tracker` |
| `web/src/features/bonuses/{BonusesPage,BonusCard,BonusDrawer,Filters}.tsx` | `/bonuses` |
| `web/src/features/settings/SettingsPage.tsx` | `/settings` |
| `web/src/router.tsx`, `app.tsx`, `main.tsx` | wiring |
| `web/tests/e2e/smoke.spec.ts` | Playwright |

---

### Task 1: Scaffold, tokens, i18n, router shell

**Files:**
- Create: everything under "tooling" above, `src/styles.css`, `src/i18n/en.ts`, `src/main.tsx`, `src/app.tsx`, `src/router.tsx`, `src/features/layout/Layout.tsx` (placeholder shell only), `tests/setup.ts`, `src/app.test.tsx`

**Interfaces:**
- Produces: `t` (typed copy object), Tailwind theme colours `cream, surface, ink, muted, primary, mint, coral, gold`, font families `heading`, `body`; route table in `router.tsx`.

- [ ] **Step 1: Scaffold with Vite and add deps**

```bash
cd /Users/chuhaobing/repo/lu_sheep_hair
pnpm create vite@latest web --template react-ts
cd web
pnpm add react-router-dom zustand framer-motion lucide-react date-fns clsx
pnpm add -D tailwindcss@3 postcss autoprefixer vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/node prettier eslint-config-prettier @playwright/test
pnpm exec tailwindcss init -p --ts
```

- [ ] **Step 2: `package.json` scripts and data copy**

Add to `scripts`:

```json
{
  "predev": "node scripts/copy-data.mjs",
  "prebuild": "node scripts/copy-data.mjs",
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit -p tsconfig.app.json",
  "lint": "eslint . && prettier --check src",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test"
}
```

`scripts/copy-data.mjs`:

```js
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const src = resolve("../data/bonuses.json");
const dst = resolve("public/bonuses.json");
mkdirSync("public", { recursive: true });
if (!existsSync(src)) {
  console.warn("data/bonuses.json missing; run the scraper first. Using empty dataset.");
  copyFileSync(resolve("src/data/empty.json"), dst);
} else {
  copyFileSync(src, dst);
}
```

Create `src/data/empty.json`: `{"generated_at":null,"source":"","bonuses":[]}`.

- [ ] **Step 3: Tailwind + tokens**

`tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FBF8F3", surface: "#FFFFFF", ink: "#1F2A24", muted: "#6B7A72",
        primary: { DEFAULT: "#1E7F5C", dark: "#176549" }, mint: "#DDF3E8",
        coral: "#F28C6B", gold: "#F5C451",
      },
      fontFamily: { heading: ["Manrope", "Inter", "system-ui", "sans-serif"], body: ["Inter", "system-ui", "sans-serif"] },
      borderRadius: { card: "16px", control: "12px" },
      boxShadow: { card: "0 1px 2px rgba(31,42,36,.06), 0 8px 24px rgba(31,42,36,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
```

`src/styles.css`:

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap");
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  html { background: #fbf8f3; color: #1f2a24; }
  body { @apply font-body antialiased; }
  h1, h2, h3 { @apply font-heading; }
  :focus-visible { outline: 2px solid #1e7f5c; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
}
```

`index.html`: set `<title>Woolly — bank bonus planner</title>`, `<html lang="en">`, and an inline SVG favicon with 🐑 (`<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐑</text></svg>">`).

- [ ] **Step 4: `src/i18n/en.ts`** (complete copy for all pages; later tasks reference these keys)

```ts
export const t = {
  brand: "Woolly",
  nav: { plan: "Plan", tracker: "Tracker", bonuses: "Bonuses", settings: "Settings" },
  updated: (date: string, n: number) => `Updated ${date} · ${n} offers`,
  footer: {
    source: "Data from Doctor of Credit",
    github: "Open source on GitHub",
    disclaimer: "Not financial advice. Read every offer's terms before opening an account.",
  },
  landing: {
    h1: "Turn your paycheck into bank bonuses.",
    sub: "Tell Woolly your state, your direct deposit, and the banks you've had. It finds the bonuses you qualify for and schedules them around your paycheck.",
    cta: "Plan my bonuses",
    browse: "Browse offers",
    welcomeBack: "Welcome back — your plan is ready.",
    viewPlan: "View my plan",
    how: [
      { title: "Tell us", body: "Your state, how much direct deposit you can send, and which banks you've used." },
      { title: "We match", body: "Woolly checks every offer against your eligibility and paycheck capacity." },
      { title: "You collect", body: "Follow the month-by-month plan and track each bonus until it pays." },
    ],
    trust: "Runs in your browser. Nothing is uploaded. Free and open source.",
  },
  onboarding: {
    title: "Let's build your plan",
    steps: ["Location", "Paycheck", "History"],
    back: "Back", next: "Next", finish: "Build my plan", skip: "I'm new to this — skip",
    state: { h: "Where do you bank?", help: "Many bonuses are regional. We'll only show ones you can actually open.", placeholder: "Search your state" },
    paycheck: {
      h: "Your paycheck",
      amount: "Monthly direct deposit", amountHelp: "Total payroll you can route to new accounts each month.",
      splits: "How many accounts can your payroll split into?", splitsHelp: "Check with HR or your payroll portal.",
      ach: "I can send ACH pushes that count as direct deposit (Fidelity, Schwab…)", achLink: "See which methods count",
      prefs: "Preferences",
      avoidHardPull: "Avoid hard credit pulls", avoidChex: "Avoid ChexSystems-sensitive banks",
      includeSavings: "Include savings bonuses", includeBusiness: "Include business bonuses",
    },
    history: {
      h: "Your bank history", help: "Which of these banks have you had in the last 2 years? This keeps you clear of \"new customers only\" rules.",
      search: "Add a bank", lastBonus: "Last bonus received", never: "Never", open: "Account still open", remove: "Remove",
    },
    loading: "Counting sheep…",
  },
  plan: {
    title: "Your plan",
    projected: "Projected earnings", accounts: "Accounts to open", avgDD: "Avg. DD used / month",
    horizon: "Horizon", months: (n: number) => `${n} months`,
    ddBy: "Direct deposit by", safeClose: "Safe to close", ddUsed: (used: string, cap: string) => `${used} of ${cap} DD`,
    skip: "Skip this one", details: "Details", track: "Track this plan", tracked: "Added to tracker",
    skipped: (n: number) => `Skipped (${n})`, restore: "Restore",
    empty: { h: "Nothing fits yet", body: "Try raising your direct deposit, allowing hard pulls, or including savings bonuses.", cta: "Edit preferences" },
    reasons: {
      expired: "Offer has expired",
      not_in_state: "Not available in your state",
      unknown_availability: "Availability unknown — check the offer",
      anti_churn: (bank: string, until: string) => `You got a ${bank} bonus recently; wait until ${until}`,
      account_open: (bank: string) => `You already have an open ${bank} account`,
      hard_pull: "Requires a hard pull (you asked to avoid these)",
      chex_sensitive: "ChexSystems-sensitive (you asked to avoid these)",
      section_excluded: "Excluded by your preferences",
      dd_too_large: "Direct deposit requirement is more than you can send in time",
      no_bonus_amount: "Bonus amount not listed",
      user_skipped: "You skipped this",
    },
    warnings: {
      not_enriched: "Details not verified yet — check the offer",
      dd_unknown: "Direct deposit amount unknown",
      expires_soon: "Expires soon",
      has_etf: "Early closure fee",
    },
  },
  tracker: {
    title: "My bonuses", earned: "Earned", inProgress: "In progress",
    statuses: { planned: "Planned", opened: "Opened", dd_sent: "DD sent", received: "Bonus received", closed: "Closed" },
    advance: "Mark next step", dateFor: (s: string) => `When did you mark "${s}"?`, daysLeft: (n: number) => `${n} days left`, overdue: "Overdue",
    empty: { h: "No bonuses tracked yet", body: "Build a plan and press \"Track this plan\" to start.", cta: "Build a plan" },
    pro: "Pro (coming soon): reminders, a direct-deposit manager, and automatic tracking via bank sync.",
  },
  bonuses: {
    title: "All offers", search: "Search banks or offers",
    filters: { nationwide: "Nationwide", myState: "My state", noDD: "No DD", softPull: "Soft pull", noFee: "No fee", checking: "Checking", savings: "Savings", business: "Business" },
    sort: { bonus: "Bonus", score: "Score for me", expiring: "Expiring" },
    addToPlan: "Add to plan", inPlan: "In your plan", openDoc: "Open on Doctor of Credit", needProfile: "Set up your profile to see your score",
    glance: { bonus: "Bonus", availability: "Availability", dd: "Direct deposit", deadline: "DD deadline", pull: "Credit pull", chex: "ChexSystems", cc: "Card funding", fee: "Monthly fee", etf: "Early closure fee", expires: "Expires", antiChurn: "New-customer rule" },
    unknown: "—", verify: "verify on DoC", nationwide: "Nationwide", days: (n: number) => `${n} days`, months: (n: number) => `${n} months`,
  },
  settings: {
    title: "Settings", profile: "Your profile", exportBtn: "Export JSON", importBtn: "Import JSON", clear: "Clear all data", clearConfirm: "This deletes your profile and tracker from this browser. Continue?",
    about: "About", aboutBody: "Woolly is open source under the MIT licence. Offer data is scraped nightly from Doctor of Credit and may be incomplete or out of date.",
  },
  common: { yes: "Yes", no: "No", save: "Save", cancel: "Cancel", loading: "Loading offers…", error: "Couldn't load offers.", retry: "Retry", needProfile: "Set up your profile first." },
} as const;
```

- [ ] **Step 5: Router + placeholder pages + test setup**

`src/router.tsx`:

```tsx
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./features/layout/Layout";
const Placeholder = ({ name }: { name: string }) => <h1 className="text-2xl">{name}</h1>;
export const router = createBrowserRouter([
  {
    path: "/", element: <Layout />,
    children: [
      { index: true, element: <Placeholder name="Landing" /> },
      { path: "start", element: <Placeholder name="Start" /> },
      { path: "plan", element: <Placeholder name="Plan" /> },
      { path: "tracker", element: <Placeholder name="Tracker" /> },
      { path: "bonuses", element: <Placeholder name="Bonuses" /> },
      { path: "settings", element: <Placeholder name="Settings" /> },
    ],
  },
]);
```

`src/features/layout/Layout.tsx` (temporary): `<div className="min-h-screen bg-cream text-ink"><main className="mx-auto max-w-6xl px-4 py-8"><Outlet /></main></div>`.

`src/app.tsx`: `<RouterProvider router={router} />`. `src/main.tsx` imports `./styles.css` and renders `<App />` in StrictMode.

`vite.config.ts` add `test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"], globals: true }` (use `/// <reference types="vitest" />`). `tests/setup.ts`: `import "@testing-library/jest-dom/vitest";`.

`src/app.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { router } from "./router";

test("renders landing route", () => {
  const mem = createMemoryRouter(router.routes, { initialEntries: ["/"] });
  render(<RouterProvider router={mem} />);
  expect(screen.getByText("Landing")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run** `pnpm test && pnpm typecheck && pnpm build` → all green; `pnpm dev` shows the cream page with "Landing".

- [ ] **Step 7: Commit** `git add web && git commit -m "feat(web): scaffold Vite app with tokens, copy, and router shell"`

---

### Task 2: Types, fixture, data loader

**Files:**
- Create: `src/engine/types.ts`, `src/data/fixture.ts`, `src/data/loadBonuses.ts`, `src/data/loadBonuses.test.ts`, `src/data/useBonuses.ts`

**Interfaces:**
- Produces:

```ts
export type Section = "checking" | "savings" | "business" | "state" | "regional";
export type Pull = "soft" | "hard" | "unknown";
export interface Bonus {
  id: string; bank: string; title: string; section: Section; summary: string;
  doc_url: string; offer_url: string | null; bonus_min: number | null; bonus_max: number | null;
  availability: { nationwide: boolean; states: string[] };
  dd: { required: boolean | null; amount: number | null; deadline_days: number | null };
  pull: Pull; chexsystems: string | null; cc_funding: string | null;
  monthly_fee: { amount: number; avoidable: boolean | null } | null;
  etf: { amount: number | null; days: number | null } | null;
  household_limit: string | null; expiration: string | null; anti_churn_months: number | null;
  additional_requirements: string | null; enriched: boolean; post_modified: string | null; last_seen: string;
}
export interface HistoryEntry { bank: string; lastBonusAt?: string; accountOpen: boolean }
export interface Profile {
  state: string; monthlyDD: number; maxSplits: number; achPushCountsAsDD: boolean;
  prefs: { avoidHardPull: boolean; avoidChexSensitive: boolean; includeBusiness: boolean; includeSavings: boolean };
  history: HistoryEntry[]; horizonMonths: number; startMonth: string;
}
export type Reason = "expired" | "not_in_state" | "unknown_availability" | "anti_churn" | "account_open" | "hard_pull" | "chex_sensitive" | "section_excluded" | "dd_too_large" | "no_bonus_amount" | "user_skipped";
export type Warning = "not_enriched" | "dd_unknown" | "expires_soon" | "has_etf";
export interface Evaluation { eligible: boolean; reasons: Reason[]; warnings: Warning[]; antiChurnUntil?: string }
export interface PlanItem { bonus: Bonus; openMonth: string; ddSchedule: { month: string; amount: number }[]; ddDeadline: string; safeCloseDate: string | null; warnings: Warning[] }
export interface PlanMonth { month: string; items: PlanItem[]; ddUsed: number; slotsUsed: number }
export interface Plan { months: PlanMonth[]; skipped: { bonus: Bonus; reasons: Reason[]; antiChurnUntil?: string }[]; totals: { projected: number; accounts: number; avgDDUsed: number } }
export interface Dataset { generated_at: string | null; source: string; bonuses: Bonus[] }
export const defaultProfile = (startMonth: string): Profile => ({ state: "", monthlyDD: 5000, maxSplits: 2, achPushCountsAsDD: false, prefs: { avoidHardPull: true, avoidChexSensitive: false, includeBusiness: false, includeSavings: true }, history: [], horizonMonths: 12, startMonth });
```

  - `loadBonuses(fetchImpl = fetch): Promise<Dataset>` — throws `Error("bad dataset")` if `bonuses` is not an array or an item lacks `id`/`bank`/`title`.
  - `useBonuses(): { data: Dataset | null; error: string | null; retry(): void }`
  - `fixture: Bonus[]` with these 8 entries (write them out fully, all fields present):
    1. `wells-fargo-500` Wells Fargo, checking, nationwide, bonus 500, dd required 1000 / 90 days, soft, fee 15 avoidable, etf null, expiration `2026-10-06`, anti_churn 12, enriched.
    2. `chase-400` Chase, checking, nationwide, 400, dd required amount null / 90 days, soft, etf {0, 180}, expiration `2026-12-31`, anti_churn 24, enriched.
    3. `us-bank-450` US Bank, checking, nationwide, 450, dd 2000 / 90, soft, expiration `2026-11-30`, anti_churn 12, enriched.
    4. `bmo-400` BMO, checking, nationwide, 400, dd 4000 / 90, soft, expiration null, anti_churn null, enriched false.
    5. `sofi-675` SoFi, savings, nationwide, 675, dd 5000 / 30, soft, expiration `2027-01-31`, anti_churn null, enriched.
    6. `eastern-750` Eastern Bank, state, states `["MA","NH","ME","RI"]`, 750, dd 500 / 60, soft, expiration `2026-10-31`, enriched.
    7. `fourfront-400` 4Front Credit Union, state, `["MI"]`, 400, dd required false, hard pull, expiration null, enriched.
    8. `expired-100` Old Bank, checking, nationwide, 100, dd 100 / 60, soft, expiration `2026-01-01`, enriched.

- [ ] **Step 1: Write failing test `src/data/loadBonuses.test.ts`**

```ts
import { loadBonuses } from "./loadBonuses";
import { fixture } from "./fixture";

const ok = (body: unknown) => (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

test("loads and validates dataset", async () => {
  const ds = await loadBonuses(ok({ generated_at: "2026-09-13T00:00:00Z", source: "s", bonuses: fixture }));
  expect(ds.bonuses).toHaveLength(8);
});

test("rejects malformed dataset", async () => {
  await expect(loadBonuses(ok({ bonuses: [{ id: "x" }] }))).rejects.toThrow("bad dataset");
  await expect(loadBonuses(ok({ nope: true }))).rejects.toThrow("bad dataset");
});
```

- [ ] **Step 2: Run** `pnpm test src/data` → FAIL

- [ ] **Step 3: Implement `types.ts`, `fixture.ts`, `loadBonuses.ts`, `useBonuses.ts`**

`loadBonuses.ts`:

```ts
import type { Bonus, Dataset } from "../engine/types";
export async function loadBonuses(fetchImpl: typeof fetch = fetch): Promise<Dataset> {
  const res = await fetchImpl("/bonuses.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("bad dataset");
  const doc = (await res.json()) as Partial<Dataset>;
  if (!Array.isArray(doc.bonuses)) throw new Error("bad dataset");
  for (const b of doc.bonuses as Partial<Bonus>[]) {
    if (!b || typeof b.id !== "string" || typeof b.bank !== "string" || typeof b.title !== "string") throw new Error("bad dataset");
  }
  return { generated_at: doc.generated_at ?? null, source: doc.source ?? "", bonuses: doc.bonuses as Bonus[] };
}
```

`useBonuses.ts`: `useState` for data/error, `useEffect` calling `loadBonuses`, `retry` increments a counter. Cache the promise in a module-level variable so navigating between pages doesn't refetch.

- [ ] **Step 4: Run** `pnpm test src/data && pnpm typecheck` → PASS

- [ ] **Step 5: Commit** `git commit -am "feat(web): engine types, fixture dataset, bonus loader"` (add new files first)

---

### Task 3: Engine — eligibility

**Files:**
- Create: `src/engine/eligibility.ts`, `src/engine/eligibility.test.ts`

**Interfaces:**
- Produces: `evaluate(bonus: Bonus, profile: Profile, today: Date): Evaluation`, `normalizeBankName(s: string): string` (lowercase, strip non-alphanumerics; used for history matching), `DEFAULT_ANTI_CHURN_MONTHS = 24`.

Rules (spec §4.2):
- `no_bonus_amount` if `bonus_max` null.
- `expired` if `expiration` < today.
- `not_in_state` if `!nationwide && states.length && !states.includes(profile.state)`.
- `unknown_availability` if `!nationwide && states.length === 0`.
- `anti_churn`: history entry matches bank (normalised) and has `lastBonusAt`; window = `bonus.anti_churn_months ?? 24`; if `lastBonusAt + window months` > today → ineligible, `antiChurnUntil = YYYY-MM`.
- `account_open`: history entry matches and `accountOpen`.
- `hard_pull` if pref and `pull === "hard"`.
- `chex_sensitive` if pref and `chexsystems` contains "sensitive" (case-insensitive).
- `section_excluded`: savings when `!includeSavings`; business when `!includeBusiness`.
- `dd_too_large`: `dd.required !== false && dd.amount != null && dd.amount > profile.monthlyDD * Math.max(1, Math.min(Math.ceil((dd.deadline_days ?? 60) / 30), profile.horizonMonths))`.
- Warnings: `not_enriched` if `!enriched`; `dd_unknown` if `dd.required !== false && dd.amount == null`; `expires_soon` if expiration within 30 days; `has_etf` if `etf?.amount` > 0.

- [ ] **Step 1: Write failing tests `src/engine/eligibility.test.ts`** (table-driven, one case per Reason and Warning, using `fixture` and `defaultProfile("2026-09")`, `today = new Date("2026-09-13")`; include: MA user sees `eastern-750` eligible and MI user sees `not_in_state`; history `{bank:"Wells Fargo", lastBonusAt:"2026-01", accountOpen:false}` → `anti_churn` with `antiChurnUntil === "2027-01"`; `{bank:"chase", lastBonusAt:"2023-01", accountOpen:false}` → eligible (24-month window elapsed); `monthlyDD: 1000` → `bmo-400` gets `dd_too_large`; `avoidHardPull` → `fourfront-400` has `hard_pull` for MI user; `bmo-400` has warning `not_enriched`; `chase-400` has warning `dd_unknown`.)

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implement `eligibility.ts`**

```ts
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
    if (isBefore(today, until)) { reasons.push("anti_churn"); antiChurnUntil = format(until, "yyyy-MM"); }
  }
  if (profile.prefs.avoidHardPull && bonus.pull === "hard") reasons.push("hard_pull");
  if (profile.prefs.avoidChexSensitive && /sensitive/i.test(bonus.chexsystems ?? "")) reasons.push("chex_sensitive");
  if ((bonus.section === "savings" && !profile.prefs.includeSavings) || (bonus.section === "business" && !profile.prefs.includeBusiness)) reasons.push("section_excluded");

  const ddMonths = Math.max(1, Math.min(Math.ceil((bonus.dd.deadline_days ?? 60) / 30), profile.horizonMonths));
  if (bonus.dd.required !== false && bonus.dd.amount != null && bonus.dd.amount > profile.monthlyDD * ddMonths) reasons.push("dd_too_large");

  if (!bonus.enriched) warnings.push("not_enriched");
  if (bonus.dd.required !== false && bonus.dd.amount == null) warnings.push("dd_unknown");
  if (bonus.expiration && differenceInCalendarDays(parseISO(bonus.expiration), today) <= 30 && !reasons.includes("expired")) warnings.push("expires_soon");
  if ((bonus.etf?.amount ?? 0) > 0) warnings.push("has_etf");

  return { eligible: reasons.length === 0, reasons, warnings, antiChurnUntil };
}
```

- [ ] **Step 4: Run** `pnpm test src/engine/eligibility` → PASS
- [ ] **Step 5: Commit** `feat(web): eligibility engine`

---

### Task 4: Engine — scoring

**Files:** `src/engine/scoring.ts`, `src/engine/scoring.test.ts`

**Interfaces:** `score(bonus: Bonus): number`, `holdMonths(bonus): number`, `ddCost(bonus): number`, `compareByScore(a, b): number` (score desc, bonus_max desc, bank asc).

Formula (spec §4.3):

```ts
export const holdMonths = (b: Bonus) => Math.ceil((b.etf?.days ?? 180) / 30);
export const ddCost = (b: Bonus) => (b.dd.required === false ? 0 : (b.dd.amount ?? 500));
export function score(b: Bonus): number {
  const fee = b.monthly_fee && b.monthly_fee.avoidable === false ? b.monthly_fee.amount * holdMonths(b) : 0;
  const net = (b.bonus_max ?? 0) - fee;
  const timeCost = Math.max(b.etf?.days ?? 0, b.dd.deadline_days ?? 60) / 30;
  return net / (1 + ddCost(b) / 1000) / (1 + timeCost / 6);
}
export const compareByScore = (a: Bonus, b: Bonus) => score(b) - score(a) || (b.bonus_max ?? 0) - (a.bonus_max ?? 0) || a.bank.localeCompare(b.bank);
```

- [ ] Tests: no-DD bonus scores higher than same-amount DD bonus; unavoidable fee reduces score; `compareByScore` orders fixture with `fourfront-400` (no DD) above `chase-400`; deterministic ordering for equal scores.
- [ ] Implement, run, commit `feat(web): scoring`.

---

### Task 5: Engine — scheduler and index

**Files:** `src/engine/scheduler.ts`, `src/engine/scheduler.test.ts`, `src/engine/index.ts`

**Interfaces:**
- `buildPlan(bonuses: Bonus[], profile: Profile, opts: { today: Date; skippedIds?: string[] }): Plan`
- `monthAdd(month: string, n: number): string`, `monthStartDate(month: string): string` (ISO `YYYY-MM-01`)
- `NO_DD_CAP_PER_MONTH = 3`, `UNLIMITED_SPLITS = 6`, `DEFAULT_DD_DEADLINE_DAYS = 60`, `DEFAULT_SAFE_CLOSE_DAYS = 180`

Algorithm (spec §4.4):

```ts
export function buildPlan(bonuses, profile, { today, skippedIds = [] }): Plan {
  const months = Array.from({ length: profile.horizonMonths }, (_, i) => ({ month: monthAdd(profile.startMonth, i), items: [], ddUsed: 0, slotsUsed: 0, noDD: 0 }));
  const slots = profile.achPushCountsAsDD ? UNLIMITED_SPLITS : profile.maxSplits;
  const skipped: Plan["skipped"] = [];
  const candidates: Bonus[] = [];
  for (const b of bonuses) {
    if (skippedIds.includes(b.id)) { skipped.push({ bonus: b, reasons: ["user_skipped"] }); continue; }
    const ev = evaluate(b, profile, today);
    if (ev.eligible) candidates.push(b); else skipped.push({ bonus: b, reasons: ev.reasons, antiChurnUntil: ev.antiChurnUntil });
  }
  candidates.sort(compareByScore);
  const usedBanks = new Set<string>();
  for (const b of candidates) {
    const bankKey = normalizeBankName(b.bank);
    if (usedBanks.has(bankKey)) continue;
    const needsDD = b.dd.required !== false;
    const amount = needsDD ? (b.dd.amount ?? 0) : 0;
    const span = Math.max(1, Math.ceil((b.dd.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS) / 30));
    for (let m = 0; m < months.length; m++) {
      const window = months.slice(m, m + span);
      if (window.length < span) break;
      if (!needsDD && months[m].noDD >= NO_DD_CAP_PER_MONTH) continue;
      if (window.some((w) => w.slotsUsed >= slots)) continue;
      const free = window.reduce((s, w) => s + (profile.monthlyDD - w.ddUsed), 0);
      if (amount > free) continue;
      // allocate greedily month by month within the window
      let remaining = amount; const ddSchedule = [];
      for (const w of window) {
        const take = Math.min(remaining, profile.monthlyDD - w.ddUsed);
        if (take > 0) { w.ddUsed += take; ddSchedule.push({ month: w.month, amount: take }); remaining -= take; }
        w.slotsUsed += 1;
      }
      if (!needsDD) months[m].noDD += 1;
      const open = parseISO(monthStartDate(months[m].month));
      const item: PlanItem = {
        bonus: b, openMonth: months[m].month, ddSchedule,
        ddDeadline: format(addDays(open, b.dd.deadline_days ?? DEFAULT_DD_DEADLINE_DAYS), "yyyy-MM-dd"),
        safeCloseDate: format(addDays(open, Math.max(b.etf?.days ?? DEFAULT_SAFE_CLOSE_DAYS, DEFAULT_SAFE_CLOSE_DAYS)), "yyyy-MM-dd"),
        warnings: evaluate(b, profile, today).warnings,
      };
      months[m].items.push(item); usedBanks.add(bankKey); break;
    }
  }
  const items = months.flatMap((m) => m.items);
  const projected = items.reduce((s, i) => s + (i.bonus.bonus_max ?? 0), 0);
  const avgDDUsed = months.length ? months.reduce((s, m) => s + m.ddUsed, 0) / months.length : 0;
  return { months: months.map(({ noDD, ...m }) => m), skipped, totals: { projected, accounts: items.length, avgDDUsed } };
}
```

- [ ] **Tests** (all with `today = 2026-09-13`, `startMonth "2026-09"`):
  - capacity overflow: `monthlyDD 1000, maxSplits 6` with fixture → `sofi-675` (5000 in 30 days) is skipped with `dd_too_large`; `wells-fargo-500` lands in month 1 and `us-bank-450` (2000/90) is spread across months and lands later.
  - splits limit: `maxSplits 1` → no two DD items share a month.
  - no-DD cap: 5 no-DD nationwide bonuses → at most 3 open in the same month.
  - one per bank: two Chase bonuses in input → only one placed.
  - deadline spanning two months: `dd.amount 1500, deadline 60, monthlyDD 1000` → `ddSchedule` `[1000, 500]`.
  - empty history + MA state → `eastern-750` placed; skipped list contains `expired-100` with `expired`, `fourfront-400` with `not_in_state`.
  - skippedIds → `user_skipped` reason and not placed.
  - totals sum correctly; `avgDDUsed` averaged over horizon.
- [ ] `index.ts`: `export * from "./types"; export * from "./eligibility"; export * from "./scoring"; export * from "./scheduler";`
- [ ] Run `pnpm test src/engine` (target ≥ 90 % coverage: add `--coverage` with `@vitest/coverage-v8` if desired), commit `feat(web): greedy plan scheduler`.

---

### Task 6: Store and derived plan hook

**Files:** `src/state/store.ts`, `src/state/store.test.ts`, `src/state/usePlan.ts`

**Interfaces:**

```ts
export type TrackStatus = "planned" | "opened" | "dd_sent" | "received" | "closed";
export interface TrackedItem { id: string; bonusId: string; status: TrackStatus; dates: Partial<Record<TrackStatus, string>>; openMonth: string }
interface State {
  profile: Profile | null; skippedIds: string[]; tracker: TrackedItem[];
  setProfile(p: Profile): void; updateProfile(patch: Partial<Profile>): void;
  skip(id: string): void; restore(id: string): void;
  trackPlan(items: PlanItem[]): void; advance(id: string, date: string): void; untrack(id: string): void;
  clearAll(): void; exportJSON(): string; importJSON(json: string): void;
}
export const useStore = create<State>()(persist((set, get) => ({ ... }), { name: "woolly.v1", version: 1 }));
export const currentMonth = () => format(new Date(), "yyyy-MM");
```

- `trackPlan` is idempotent per `bonusId` (does not duplicate). `advance` moves to the next status in order and records the date. `importJSON` validates shape (`profile` object or null, arrays) else throws.
- `usePlan(bonuses: Bonus[] | undefined): Plan | null` → `useMemo(() => profile && bonuses ? buildPlan(bonuses, profile, { today: new Date(), skippedIds }) : null, [...])`.

- [ ] Tests: setProfile/updateProfile; skip/restore; trackPlan idempotent; advance sequence planned→opened→dd_sent→received→closed and stays at closed; export→clearAll→import restores; persisted to `localStorage["woolly.v1"]` (jsdom).
- [ ] Implement, run, commit `feat(web): persisted store and plan hook`.

---

### Task 7: UI primitives

**Files:** `src/ui/{Button,Card,Badge,MoneyText,Field,Select,Slider,Toggle,Segmented,Stepper,Drawer,EmptyState,Toast,BankAvatar}.tsx`, `src/ui/index.ts`, `src/ui/ui.test.tsx`, `src/ui/format.ts`

**Interfaces (props):**
- `Button { variant?: "primary"|"secondary"|"ghost"; size?: "md"|"lg"; as?: "button"|"link"; to?: string; icon?: ReactNode; disabled?; onClick?; children }` — primary: `bg-primary text-white hover:bg-primary-dark rounded-control px-5 py-3 font-semibold`; secondary: `bg-mint text-primary`; ghost: `text-primary hover:bg-mint/60`.
- `Card { className?; children; as?: "div"|"section"|"li" }` — `bg-surface rounded-card shadow-card p-5`.
- `Badge { tone?: "neutral"|"mint"|"coral"|"gold"; icon?; children }` — pill `rounded-full px-2.5 py-1 text-xs font-medium`.
- `MoneyText { value: number | null; size?: "sm"|"md"|"xl" }` — gold-on-ink for xl (`text-gold` on dark chip), tabular nums; null → "—".
- `Field { label; help?; error?; htmlFor; children }`.
- `Select { options: {value,label}[]; value; onChange; searchable?; placeholder? }` — searchable uses a text input + listbox with keyboard nav (ArrowUp/Down/Enter/Escape), `role="listbox"`/`option`.
- `Slider { min; max; step; value; onChange; format?(v): string }` — native `<input type="range">` styled with `accent-primary`, plus a numeric input beside it.
- `Toggle { checked; onChange; label }` — `role="switch"`.
- `Segmented { options: {value,label}[]; value; onChange }` — `role="radiogroup"`.
- `Stepper { steps: string[]; current: number }` — progress bar + labels.
- `Drawer { open; onClose; title; children }` — right-side panel on ≥768 px, bottom sheet below; framer-motion slide; closes on Escape and backdrop click; traps initial focus on the close button.
- `EmptyState { emoji?: string; title; body; action?: ReactNode }` — centred, 🐑 default.
- `Toast` — `useToast()` hook + `<Toaster />` mounted once in Layout; `toast(message)` shows for 3 s.
- `BankAvatar { name: string; size?: number }` — circle with initials (first letters of first two words) and a background chosen from a fixed 8-colour pastel palette by string hash.
- `format.ts`: `money(n: number | null): string` (`$1,000`), `monthLabel("2026-09") → "Sep 2026"`, `dateLabel("2026-10-06") → "Oct 6, 2026"`.

- [ ] Tests (`ui.test.tsx`): Button renders as link when `to` given; Select searchable filters options and selects with keyboard; Toggle toggles via click and reports `aria-checked`; Drawer closes on Escape; `money(1500) === "$1,500"`; `BankAvatar` initials "WF" for "Wells Fargo".
- [ ] Implement, run, commit `feat(web): design-system primitives`.

---

### Task 8: Layout (Header, Footer) and Landing

**Files:** `src/features/layout/{Header,Footer,Layout}.tsx`, `src/features/landing/Landing.tsx`, `src/features/landing/Landing.test.tsx`, modify `src/router.tsx`

- Header: sticky, `bg-cream/80 backdrop-blur`, left: 🐑 + `t.brand` (link `/`), centre/right nav links Plan · Tracker · Bonuses (active link `text-primary font-semibold`), right chip `t.updated(dateLabel(generated_at), n)` when data loaded, settings gear icon → `/settings`. Mobile: nav collapses into a bottom tab bar (Plan / Tracker / Bonuses / Settings) fixed at the bottom with icons from lucide (`CalendarDays, ListChecks, Landmark, Settings`).
- Footer: three muted lines from `t.footer`; GitHub link `https://github.com/haobing/lu_sheep_hair`; DoC link.
- Layout: `<Header/><main className="mx-auto max-w-6xl px-4 pb-24 pt-8 md:pb-12"><Outlet/></main><Footer/><Toaster/>`. Layout fetches `useBonuses()` once and provides it through `React.createContext<Dataset|null>` (`DataContext`) so pages don't refetch; shows `t.common.loading` skeleton and error+retry states.
- Landing: hero section two-column on ≥md (copy left, illustration right: a large rounded mint card containing a fake "plan preview" of three PlanCard-like tiles with sample numbers using `Card`/`MoneyText`), `h1` `text-4xl md:text-6xl font-heading font-extrabold tracking-tight`, sub `text-lg text-muted max-w-xl`, CTA primary lg → `/start`, secondary → `/bonuses`. If `useStore().profile` exists, replace h1 with `t.landing.welcomeBack` and CTA `t.landing.viewPlan` → `/plan`. Below: three `Card`s from `t.landing.how` with numerals 1–3 in mint circles. Trust strip: `t.landing.trust` with a `ShieldCheck` icon.

- [ ] Test: renders h1 and CTA linking to `/start`; with a profile in the store shows welcome-back CTA linking to `/plan`.
- [ ] Wire route `/` → `<Landing/>`; run tests/typecheck; `pnpm dev` and eyeball at 400 px and 1280 px; commit `feat(web): layout and landing page`.

---

### Task 9: Onboarding wizard

**Files:** `src/features/onboarding/{Onboarding,StepState,StepPaycheck,StepHistory,states.ts}.tsx`, `Onboarding.test.tsx`; modify `router.tsx`

- `states.ts`: array of `{ code, name }` for all 50 states + DC.
- `Onboarding`: local `draft: Profile` initialised from `store.profile ?? defaultProfile(currentMonth())`; `step` 0..2 in `useSearchParams` (`?step=`) so back button works; `Stepper` on top; `AnimatePresence` slide between steps (x: ±24, 200 ms); footer buttons Back (ghost, hidden on step 0) / Next (primary, disabled until step valid) / on last step `t.onboarding.finish`. Validity: step 0 requires `state`; step 1 requires `monthlyDD >= 0`; step 2 always valid. Finish → `setProfile(draft)`, show full-screen overlay with animated 🐑 bouncing and `t.onboarding.loading` for 1200 ms, then `navigate("/plan")`.
- `StepState`: `Field` + searchable `Select` of states, `autoFocus`.
- `StepPaycheck`: `Slider` 0–20000 step 100 for `monthlyDD`; `Segmented` `[1,2,3,4,5]` labels "1","2","3","4","5+" (5 stores as `UNLIMITED_SPLITS`); `Toggle` ach with helper link to `https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/`; "Preferences" group with four `Toggle`s.
- `StepHistory`: searchable `Select` over unique `bank` names from `DataContext` (fallback to free text when data missing); on select push `{bank, accountOpen: false}`; each row is a `Card` with `BankAvatar`, bank name, month input `<input type="month">` for `lastBonusAt` (blank = never), `Toggle` accountOpen, remove button. Button `t.onboarding.skip` (ghost) jumps to finish.

- [ ] Tests: wizard navigates 0→1→2 with Next, Back returns; Next disabled on step 0 until a state is chosen; finishing calls `setProfile` with the chosen state and `monthlyDD` and navigates to `/plan` (use fake timers for the 1200 ms).
- [ ] Wire `/start`; run; commit `feat(web): onboarding wizard`.

---

### Task 10: Plan page

**Files:** `src/features/plan/{PlanPage,SummaryBar,MonthColumn,PlanCard,SkippedList,reasonText.ts}.tsx`, `PlanPage.test.tsx`; modify `router.tsx`

- `reasonText.ts`: `reasonToText(reason, bonus, antiChurnUntil?) → string` mapping via `t.plan.reasons` (function entries called with `bonus.bank`, `monthLabel(antiChurnUntil)`); `warningToText(w)`.
- `PlanPage`: if no profile → `navigate("/start")` + toast `t.common.needProfile`. `plan = usePlan(data.bonuses)`. Render `SummaryBar`, horizon `Segmented` 6/12 (calls `updateProfile({horizonMonths})`), timeline, `SkippedList`, sticky bottom CTA `t.plan.track` → `trackPlan(items)` + toast `t.plan.tracked` + navigate `/tracker`. If `plan.totals.accounts === 0` → `EmptyState` from `t.plan.empty` with action → `/start?step=1`.
- `SummaryBar`: dark ink card with three stats: `MoneyText xl` projected, accounts, `money(avgDDUsed)`; `motion.div` count-up on projected (animate number over 600 ms).
- Timeline: `<ol className="flex gap-4 overflow-x-auto snap-x md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible">` — on mobile a vertical list (`flex-col`) instead; each `MonthColumn` shows `monthLabel`, a DD meter (`mint` track, `primary` fill, label `t.plan.ddUsed`), and `PlanCard`s; months with no items render a muted "—".
- `PlanCard`: `BankAvatar`, title (`line-clamp-2`), `MoneyText md` `bonus_max`, badges: pull (`Soft pull` mint / `Hard pull` coral / none), DD (`money(dd.amount)` + " DD" or `No DD` gold), fee (`No fee` when `monthly_fee?.amount === 0` or avoidable); lines `t.plan.ddBy dateLabel(ddDeadline)` and `t.plan.safeClose dateLabel(safeCloseDate)`; warnings as small coral text; kebab menu (`MoreHorizontal`) with `t.plan.details` (opens `BonusDrawer` from Task 12 — until then, link to `doc_url`) and `t.plan.skip` → `skip(id)`.
- `SkippedList`: `<details>` accordion `t.plan.skipped(n)`; rows: `BankAvatar` small, title, reason text (first reason, plus "+n more" title attr), and for `user_skipped` a `t.plan.restore` ghost button → `restore(id)`.

- [ ] Tests with fixture + MA profile: renders projected total equal to the sum of placed items; skip button removes a card and the item appears under Skipped with restore; empty state shown when `monthlyDD 0` and all excluded; redirects to `/start` without profile.
- [ ] Wire `/plan`; run; eyeball; commit `feat(web): plan page`.

---

### Task 11: Tracker page

**Files:** `src/features/tracker/{TrackerPage,TrackedCard}.tsx`, `TrackerPage.test.tsx`; modify `router.tsx`

- Header stats: `t.tracker.earned` = sum of `bonus_max` for status `received`/`closed`; `t.tracker.inProgress` = sum for other statuses.
- Group by status in order planned → opened → dd_sent → received → closed; each group a heading with count.
- `TrackedCard`: `BankAvatar`, title, `MoneyText`, 5-dot status stepper (filled up to current), computed dates: if `dates.opened` exists, `ddDeadline = opened + (dd.deadline_days ?? 60)` and `safeClose = opened + max(etf.days ?? 180, 180)`; days-left `Badge` (coral if < 14, `t.tracker.overdue` if negative); primary small button `t.tracker.advance` → `window.prompt`-free inline date picker: reveals an `<input type="date">` defaulting to today and a confirm button, then `advance(id, date)`; ghost `untrack`; link to `doc_url`.
- Empty state from `t.tracker.empty` → `/start` or `/plan` if profile exists.
- Bottom `Card` mint with `t.tracker.pro` (static).

- [ ] Tests: renders grouped items from store; advance moves item to next group and stores date; earned/in-progress totals; empty state.
- [ ] Wire `/tracker`; run; commit `feat(web): tracker page`.

---

### Task 12: Bonuses browse page and drawer

**Files:** `src/features/bonuses/{BonusesPage,Filters,BonusCard,BonusDrawer,useBonusFilters.ts}.tsx`, `BonusesPage.test.tsx`; modify `router.tsx` and `PlanCard` (Details now opens `BonusDrawer`)

- `useBonusFilters(bonuses, profile)`: state `{ q, chips: Set<Chip>, sort }`; chips from `t.bonuses.filters` keys; filtering: `nationwide` → `availability.nationwide`; `myState` → eligible by state (needs profile); `noDD` → `dd.required === false`; `softPull` → `pull === "soft"`; `noFee` → `monthly_fee == null || amount === 0 || avoidable`; section chips by `section` (state/regional count as "checking" for the section chips). Sort: `bonus` by `bonus_max` desc; `score` by `compareByScore` (disabled without profile, tooltip `t.bonuses.needProfile`); `expiring` by nearest `expiration` (nulls last). Search matches `bank`/`title` case-insensitive. Result count shown.
- `BonusCard`: like `PlanCard` without dates; state badges (`MA, NH`) or `Nationwide`; `expires_soon` badge; click → drawer.
- `BonusDrawer(bonus, open, onClose)`: title, `MoneyText xl`, summary paragraph, glance table (`<dl>` two columns) using `t.bonuses.glance` labels and values with `t.bonuses.unknown` for nulls and `t.bonuses.verify` chip when `!enriched`; eligibility block when profile exists: green "You're eligible" or the reason texts; buttons: `t.bonuses.addToPlan` (if in `skippedIds` → `restore`; if already in plan → disabled `t.bonuses.inPlan`; otherwise navigates to `/plan` since eligible bonuses are auto-placed) and `t.bonuses.openDoc` (external link, `rel="noopener"`).

- [ ] Tests: search filters; `noDD` chip leaves only `fourfront-400`; clicking a card opens drawer with glance labels; sort by expiring puts `wells-fargo-500` before `chase-400`.
- [ ] Wire `/bonuses`; update `PlanCard` Details; run; commit `feat(web): bonuses browser and detail drawer`.

---

### Task 13: Settings page

**Files:** `src/features/settings/SettingsPage.tsx`, `SettingsPage.test.tsx`; modify `router.tsx`

- Sections as `Card`s: Profile (re-uses `StepState`, `StepPaycheck`, `StepHistory` in read/write mode with a Save button calling `setProfile`), Data (Export: `Blob` download `woolly-export.json`; Import: `<input type="file">` → `importJSON`, toast on error), Danger (`t.settings.clear` → `window.confirm(t.settings.clearConfirm)` → `clearAll()` → navigate `/`), About (`t.settings.aboutBody`, links).
- [ ] Tests: save updates store; clear with confirm empties store; import invalid JSON shows error toast.
- [ ] Wire `/settings`; run; commit `feat(web): settings page`.

---

### Task 14: E2E smoke, CI, README

**Files:** `web/playwright.config.ts`, `web/tests/e2e/smoke.spec.ts`, modify `.github/workflows/ci.yml`, `README.md`

- `playwright.config.ts`: `webServer: { command: "pnpm dev --port 5173", url: "http://localhost:5173", reuseExistingServer: true }`, chromium only, `baseURL`.
- `smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
test("landing → wizard → plan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Plan my bonuses" }).click();
  await page.getByPlaceholder("Search your state").fill("Massachusetts");
  await page.getByRole("option", { name: "Massachusetts" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Build my plan" }).click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 10000 });
  await expect(page.getByText("Projected earnings")).toBeVisible();
  await expect(page.locator("li", { hasText: "DD" }).first()).toBeVisible();
});
```

- `ci.yml`: add job `web` (`pnpm/action-setup@v4`, `actions/setup-node@v4` node 20, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm exec playwright install --with-deps chromium`, `pnpm e2e`).
- README: add "Web app" section (`cd web && pnpm install && pnpm dev`), screenshots placeholder line removed — instead describe the four pages in one sentence each, and a "Contributing data fixes" note pointing to the scraper.

- [ ] Run `pnpm e2e` locally → PASS; commit `ci: web checks and e2e smoke; docs`.

---

## Self-review

- Spec §4 engine → Tasks 3–5 (all Reasons/Warnings, formula, greedy rules, Plan type). §5.2 routes → Tasks 8–13; header chip/footer → Task 8; wizard copy/steps → Task 9; plan timeline/skipped/track CTA → Task 10; tracker groups/deadlines/pro banner → Task 11; browse filters/sort/drawer → Task 12; settings export/import/clear → Task 13. §5.3 store shape/persist key → Task 6. §5.4 error/empty/redirect handling → Tasks 8, 10, 11. §6 tests/CI/Playwright → every task + Task 14. §7 i18n file and engine purity → Global constraints.
- Placeholders: none; each UI task states components, props, copy keys, behaviours and tests.
- Type consistency: `Profile`, `Plan`, `PlanItem`, `Reason`, `Warning`, `TrackedItem`, `TrackStatus`, `Dataset` defined in Tasks 2 and 6 and used unchanged afterwards; `usePlan`, `useStore`, `DataContext`, `compareByScore`, `normalizeBankName`, `UNLIMITED_SPLITS` names match across tasks.

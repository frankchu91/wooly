# Woolly — Bank Bonus Planner MVP Design

Date: 2026-09-13
Status: approved for implementation (owner waived review; design decisions made autonomously)

## 1. Product

**Woolly** (撸羊毛 → wool) is an open-source web app that tells a US consumer which bank
account sign-up bonuses they qualify for and the best order to open them, given their
paycheck (direct deposit capacity), their state, and their bank history.

Tagline: *"Turn your paycheck into bank bonuses. Planned for you."*

### 1.1 Positioning

Doctor of Credit (DoC) answers "what bonuses exist". Woolly answers "which ones should
*I* do, in what order, and how do I spread my direct deposit across them". Woolly reads
DoC's public list, credits it prominently, and never hides the source link.

### 1.2 Tiers

| Tier | Scope | Status |
|------|-------|--------|
| Free (this MVP) | Planner + browse + local tracker. No account. All data stays in the browser. | Build now |
| Pro (later) | Accounts, deadline reminders (email/push), DD split manager, bank linking (Plaid) to auto-detect DD posting and bonus payout, household/P2 planning, mobile app. | Not built; MVP keeps the door open (see §7) |

### 1.3 MVP success criteria

1. A new visitor can go from landing page to a personalised 12-month plan in under 2 minutes with no signup.
2. The plan respects: state availability, expiration, the user's monthly DD capacity and split count, bank anti-churn rules from history, and user preferences (no hard pull, etc.).
3. The plan explains itself: every skipped bonus shows *why*; every scheduled bonus shows DD amount, deadline, and safe-to-close date.
4. Data refreshes automatically from DoC without a human touching it.
5. The UI is warm, friendly, and polished enough to share publicly.

## 2. Architecture

Monorepo, MIT licence, GitHub.

```
lu_sheep_hair/
  README.md  LICENSE
  data/bonuses.json            # generated; committed; the single data contract
  scraper/                     # Python 3.12, requests + beautifulsoup4
    pyproject.toml
    woolly_scraper/
      __init__.py  models.py  fetch.py  list_page.py  post_page.py  merge.py  cli.py
    tests/  (pytest; fixtures are saved HTML)
  web/                         # Vite + React 18 + TypeScript + Tailwind
    src/
      engine/                  # pure TS, zero DOM deps (shareable with a future RN app)
        types.ts  eligibility.ts  scoring.ts  scheduler.ts  index.ts
      data/                    # loader + bank name normaliser
      state/                   # zustand store + localStorage persistence
      ui/                      # design-system primitives (Button, Card, Badge, Field, Drawer…)
      features/
        landing/  onboarding/  plan/  tracker/  bonuses/  settings/
      app.tsx  main.tsx  router.tsx
    tests/  (vitest for engine + components; playwright smoke)
  .github/workflows/
    scrape.yml                 # nightly: run scraper, commit data/bonuses.json if changed
    ci.yml                     # lint, typecheck, unit tests for scraper + web
  docs/superpowers/specs/  docs/superpowers/plans/
```

Data flow: `DoC list page (+ posts)` → scraper → `data/bonuses.json` → committed → web app
fetches `/bonuses.json` at runtime (copied into `web/public` at build) → engine → UI.

No backend. No accounts. No analytics in MVP.

## 3. Data: `data/bonuses.json`

### 3.1 Sources (verified 2026-09-13)

- List page `https://www.doctorofcredit.com/best-bank-account-bonuses/`: 247 entries.
  `h2` = section (Checking / Savings / Business / State Specific / Region Specific),
  `h3` = one bonus. Under each `h3`: free text + a "Read our full post" link + inline
  chips (pull type, CC funding, DD requirement).
- Post page (one per bonus): "Offer at a glance" block with fixed labels
  (`Maximum bonus amount`, `Availability`, `Direct deposit required`,
  `Additional requirements`, `Hard/soft pull`, `ChexSystems`, `Credit card funding`,
  `Monthly fees`, `Early account termination fee`, `Household limit`, `Expiration date`),
  then sections `The Offer`, `The Fine Print`, `Avoiding Fees`, `Our Verdict`.
- `robots.txt`: `Crawl-delay: 600`. We respect it (default delay 600 s, configurable).
- The DoC Google Sheet "quick reference table" stopped updating in 2021. Not used.

### 3.2 Schema

```jsonc
{
  "generated_at": "2026-09-13T00:00:00Z",
  "source": "https://www.doctorofcredit.com/best-bank-account-bonuses/",
  "bonuses": [
    {
      "id": "wells-fargo-500-checking-bonus",       // slug of doc_url; when one doc_url is
                                                     // listed under more than one section in
                                                     // the same run, each section gets its own
                                                     // id ("slug--section"); when it's listed
                                                     // more than once in the *same* section,
                                                     // only the entry with the highest bonus_max
                                                     // survives under the plain slug id
      "bank": "Wells Fargo",                         // normalised bank name (see §3.4)
      "title": "Wells Fargo $500 Checking Bonus",    // h3 text
      "section": "checking" | "savings" | "business" | "state" | "regional",
      "summary": "Can be opened online. Requires $1,000 direct deposit.",  // list-page text
      "doc_url": "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/",
      "offer_url": "https://…" | null,               // "Direct link to offer"
      "bonus_min": 500, "bonus_max": 500,             // parsed from title; glance overrides
      "availability": { "nationwide": true, "states": [] },   // states = 2-letter codes
      "dd": { "required": true | false | null, "amount": 1000 | null, "deadline_days": 90 | null },
      "pull": "soft" | "hard" | "unknown",
      "chexsystems": "string | null",
      "cc_funding": "string | null",
      "monthly_fee": { "amount": 15, "avoidable": true } | null,
      "etf": { "amount": 0, "days": 180 } | null,     // early termination fee, and the window
      "household_limit": "string | null",
      "expiration": "2026-10-06" | null,
      "anti_churn_months": 12 | null,                 // "no bonus in past N months"
      "additional_requirements": "string | null",
      "enriched": true,                               // post page parsed successfully
      "post_modified": "2026-08-23" | null,
      "last_seen": "2026-09-13"
    }
  ]
}
```

Graceful degradation is a hard requirement: every field except `id`, `bank`, `title`,
`section`, `doc_url`, `last_seen` may be null. The engine and UI must work with list-page
data alone (`enriched: false`) and simply show "verify on DoC" for unknowns.

### 3.3 Scraper behaviour

- `woolly-scrape list` — fetch the list page once, parse all entries, merge into
  `bonuses.json` (add new, update `summary`/`last_seen`, drop entries not seen for 14 days).
- `woolly-scrape enrich [--limit N] [--delay S] [--only-nationwide]` — for entries where
  `enriched` is false or `post_modified` is older than the list-page hint, fetch the post,
  parse glance + fine print, write back. Raw HTML cached in `scraper/.cache/` (gitignored)
  so re-parsing is free.
- Parsing rules: glance labels matched case-insensitively; money via regex `\$[\d,]+`;
  DD deadline via `within (\d+) (calendar )?days`; anti-churn via
  `(past|within|last) (\d+) months` in the fine print; expiration via glance line parsed
  with `dateutil`. Anything unparsed → null, never a guess.
- Bank name normalisation: strip bonus text from `h3` (`Wells Fargo $500 Checking Bonus`
  → `Wells Fargo`) via regex on the first `$`/`Up To`/`Checking`/`Savings` token, then a
  small alias map (`BMO Harris` → `BMO`, `U.S. Bank` → `US Bank`).
- Politeness: single-threaded, custom User-Agent naming the repo, delay between requests,
  stop on HTTP 403/429.
- GitHub Action `scrape.yml`: nightly cron; runs `list` then `enrich --limit 5`
  (≈ 50 min at 600 s delay); commits if `bonuses.json` changed. The first full backfill is
  run locally by the maintainer.

### 3.4 State codes

`availability.states` uses USPS codes. List-page `section == state` entries carry the
state(s) in the `h3` prefix (e.g. `[PA only]`, `[IL, WI]`) or in the post's `Availability`
line; the parser extracts codes from both. Unknown → `nationwide: false, states: []` which
the engine treats as "unknown availability, show with a warning, don't schedule".

## 4. Engine (`web/src/engine`)

Pure functions, fully unit-tested, no I/O.

### 4.1 Inputs

```ts
type Profile = {
  state: string;                        // USPS code
  monthlyDD: number;                    // total $ of payroll DD per month
  maxSplits: number;                    // how many accounts payroll can split into (1..6, 6 = "unlimited")
  achPushCountsAsDD: boolean;           // user has Fidelity/Schwab-style pushes → treat maxSplits as 6
  prefs: { avoidHardPull: boolean; avoidChexSensitive: boolean; includeBusiness: boolean; includeSavings: boolean; };
  history: Array<{ bank: string; lastBonusAt?: string /* YYYY-MM */; accountOpen: boolean }>;
  horizonMonths: number;                // default 12
  startMonth: string;                   // YYYY-MM; the app always passes the *current* month
                                        // to buildPlan (a persisted value is never reused)
};
```

### 4.2 Eligibility (`eligibility.ts`)

`evaluate(bonus, profile) → { eligible: boolean; reasons: Reason[]; warnings: Warning[] }`

Reasons (hard exclusions): `expired`, `not_in_state`, `unknown_availability`,
`anti_churn` (history.lastBonusAt within `anti_churn_months`, default 24 when null and the
user *has* a history entry for that bank), `account_open` (history says open and bonus is
"new customers only", which we assume for all), `hard_pull` (pref), `chex_sensitive` (pref),
`section_excluded` (pref), `dd_too_large` (dd.amount > monthlyDD × min(deadline_days/30, horizon)).

Warnings (soft): `not_enriched`, `dd_unknown`, `expires_soon` (< 30 days), `has_etf`.

### 4.3 Scoring (`scoring.ts`)

```
hold_months = ceil((etf.days ?? 180) / 30)
net      = (bonus_min ?? bonus_max) − (monthly_fee.avoidable ? 0 : monthly_fee.amount × hold_months)
                                                                     // conservative: tiered "up to" offers
                                                                     // score on their floor
ddCost   = dd.required === false ? 0 : (dd.amount ?? ASSUMED_DD_AMOUNT)  // unknown DD → assume $500;
                                                                     // the scheduler uses the same constant
timeCost = max(etf.days ?? 0, dd.deadline_days ?? 60) / 30           // months the slot is busy
score    = net / (1 + ddCost / 1000) / (1 + timeCost / 6)
```

Deterministic; ties broken by `bonus_max` desc then `bank` asc. The formula is
intentionally simple and lives in one place so it can be tuned.

### 4.4 Scheduler (`scheduler.ts`)

Greedy month-by-month over `horizonMonths`:

1. Candidates = eligible bonuses sorted by score desc.
2. Each month has `capacity = monthlyDD` and `slots = maxSplits` (6 if achPushCountsAsDD).
3. Iterate candidates; a candidate is placed in the earliest month `m` where it can
   receive its full `dd.amount` across months `m … m + ceil(deadline_days/30) − 1` without
   exceeding any month's remaining capacity or slots. A DD bonus consumes a payroll slot
   only in the months where it actually receives DD (`take > 0`); unknown DD amounts are
   scheduled as `ASSUMED_DD_AMOUNT` ($500). Bonuses with `dd.required === false` consume
   neither capacity nor a slot; they are capped at `3` openings per month.
   A start month whose first day is after the bonus's `expiration` is never used; a bonus
   with no valid start month is skipped with reason `expires_first`. A candidate that fits
   no window at all is skipped with reason `no_capacity`.
4. One bonus per bank per plan; a bank in the plan re-becomes available only after its
   `anti_churn_months` (out of horizon for MVP, so effectively one per bank).
5. Output:

```ts
type Plan = {
  months: Array<{ month: string; items: PlanItem[]; ddUsed: number; slotsUsed: number }>;
  skipped: Array<{ bonus: Bonus; reasons: Reason[] }>;
  totals: { projected: number; projectedMin: number; accounts: number; avgDDUsed: number };
  // projected = sum of bonus_max; projectedMin = sum of (bonus_min ?? bonus_max). The UI
  // shows a range when they differ and labels it "up to".
};
type PlanItem = {
  bonus: Bonus; openMonth: string; ddSchedule: Array<{ month: string; amount: number }>;
  ddDeadline: string /* ISO date */; safeCloseDate: string | null; warnings: Warning[];
};
```

`ddDeadline = openDate + deadline_days (default 60)`; `safeCloseDate = openDate + max(etf.days, 180 if etf unknown)`.
Dates use day 1 of `openMonth` as the assumed open date; the tracker replaces it with the real date.

### 4.5 Tests

Vitest. Table-driven cases for each Reason; scheduler cases: capacity overflow, splits
limit, no-DD cap, one-per-bank, deadline spanning two months, empty history, all skipped.

## 5. UX and UI

### 5.1 Design language

- **Mood**: warm, friendly, a little playful, never "fintech dark". Think a well-designed
  personal-finance app, not a spreadsheet.
- **Mascot**: 🐑 used sparingly (logo mark, empty states, loading).
- **Tokens** (`web/src/ui/tokens.css`, Tailwind theme):
  - Background cream `#FBF8F3`; surface white; ink `#1F2A24`; muted `#6B7A72`.
  - Primary green `#1E7F5C` (money, actions); mint `#DDF3E8` (soft fills);
    accent coral `#F28C6B` (highlights, warnings); gold `#F5C451` (bonus amounts).
  - Radius 16 px cards / 12 px controls / 999 px chips. Shadows: `0 1px 2px rgba(31,42,36,.06), 0 8px 24px rgba(31,42,36,.06)`.
  - Type: Manrope (headings, 700) + Inter (body) via Google Fonts, system fallback.
  - Motion: framer-motion, 150–250 ms ease-out, reduced-motion respected.
- **Components** (`web/src/ui`): Button (primary/secondary/ghost), Card, Badge (pull type,
  DD, fee), MoneyText (gold, tabular numbers), Field/Select/Slider, Stepper, Drawer,
  EmptyState, Toast.
- Responsive: mobile-first; the plan timeline becomes a vertical list under 768 px.
- Accessibility: keyboard-navigable wizard, labelled inputs, contrast ≥ 4.5:1, focus rings.

### 5.2 Routes and flow

```
/            Landing
/start       Onboarding wizard (3 steps)
/plan        Your plan (timeline + skipped + summary)
/tracker     My bonuses (status per item, deadlines)
/bonuses     Browse all bonuses (filters, search, detail drawer)
/settings    Edit profile, export/import JSON, clear data, about/credits
```

Header: logo (🐑 Woolly), nav (Plan · Tracker · Bonuses), "Updated <date> · <n> offers"
chip. Footer: "Data from Doctor of Credit · Open source on GitHub · Not financial advice".

**Landing** — Hero headline "Turn your paycheck into bank bonuses." Sub-copy explains the
three inputs. Primary CTA "Plan my bonuses" → `/start`; secondary "Browse offers". Three
"how it works" cards (Tell us · We match · You collect). Trust strip: "Runs in your
browser. Nothing is uploaded. Free and open source." If a saved plan exists, hero swaps to
"Welcome back — your plan is ready" with CTA → `/plan`.

**Onboarding** — Stepper with 3 steps, back/next, progress bar, autosave to store.
1. *Where do you bank?* Searchable state select with big touch targets. Helper copy:
   "Many bonuses are regional. We'll only show ones you can actually open."
2. *Your paycheck.* Monthly DD amount (input + slider $0–$20k, default $5,000).
   "How many accounts can your payroll split into?" segmented 1 / 2 / 3 / 4 / 5+.
   Toggle "I can send ACH pushes that count as direct deposit (Fidelity, Schwab…)" with
   a link to DoC's DD-methods page. Preferences: avoid hard pulls (default on), avoid
   ChexSystems-sensitive banks (default off), include savings (on), include business (off).
3. *Bank history.* "Which of these banks have you had in the last 2 years?" Type-ahead
   over bank names from the data. Each row: bank · last bonus received (month picker or
   "never") · account still open (toggle). Skip allowed ("I'm new to this").
   Finish → full-screen 1.2 s "Counting sheep…" animation → `/plan`.

**Plan** — Summary bar: **$X projected** (gold), N accounts, avg DD used/month, horizon
toggle 6 / 12 months. Timeline: one column per month (horizontal scroll on desktop,
vertical on mobile), each with month label, DD used / capacity meter, and bonus cards.
Bonus card: bank avatar (initials, colour hashed from name), title, **$bonus**, chips
(Soft pull · $1,000 DD · No fee), "DD by <date>", "Safe to close <date>". Card menu:
Details · Skip this one (recomputes plan). Below: "Skipped (n)" accordion listing each
excluded bonus with a plain-English reason ("You got a Chase bonus in 2025-03; wait until
2027-03"). CTA "Track this plan" → copies items to tracker → `/tracker`.

**Tracker** — List of tracked items grouped by status: Planned · Opened · DD sent ·
Bonus received · Closed. Each item: status stepper (click to advance, asks for the date),
computed deadlines from the real open date, days-left badge (coral when < 14 days), link
to DoC post. Header stat: "$X earned · $Y in progress". Empty state with 🐑.
Bottom banner: "Pro (coming soon): reminders, DD manager, bank sync." (static, no form).

**Bonuses** — Search + filter chips (Nationwide / My state / No DD / Soft pull / No fee /
Checking / Savings / Business) + sort (Bonus · Score for me · Expiring). Card grid.
Click → Drawer with glance table, summary, warnings, buttons "Add to plan" and
"Open on Doctor of Credit". "Score for me" and "Add to plan" require a profile; if none,
prompt to `/start`.

**Settings** — Edit each onboarding step inline; Export JSON / Import JSON; "Clear all
data" (confirm); About: data source, licence, disclaimer.

### 5.3 State and persistence

zustand store with `persist` middleware → `localStorage` key `woolly.v1`:
`{ profile, planOverrides: { skippedIds: string[] }, tracker: TrackedItem[] }`.
Plan is derived (`useMemo`) from `profile + bonuses + skippedIds`, never stored.
Bonus data cached in memory; fetched from `/bonuses.json` with a loading skeleton.

### 5.4 Error and edge handling

- Data fetch fails → friendly error with retry inside the persistent shell; app never crashes.
- Any render error → router `errorElement` (friendly card with "Go home" and "Clear local
  data"); unknown paths → a not-found page. Persisted state is normalised on hydration and
  migrated across `version` bumps rather than dropped.
- Colour contrast: text on light backgrounds uses `coral-dark` (#B9482A) / `primary-dark`,
  never the decorative `coral`/`primary` on `mint` — spec §5.1's 4.5:1 applies to text.
- Profile missing on `/plan` or `/tracker` → redirect to `/start` with a toast.
- Plan empty (everything skipped) → EmptyState explaining the top three reasons and a
  button to relax preferences.
- Dates: all in the user's local timezone via `date-fns`; months as `YYYY-MM`.

## 6. Testing and quality gates

- Scraper: pytest with saved HTML fixtures for the list page and two posts (Wells Fargo,
  a state-specific one). Parsers must be deterministic on fixtures.
- Engine: vitest, ≥ 90 % line coverage on `engine/`.
- UI: vitest + testing-library for wizard navigation and plan rendering with a fixture
  dataset; Playwright smoke test: landing → wizard → plan renders ≥ 1 item.
- CI runs all of the above on push and PR.
- Lint: ruff (scraper), eslint + prettier (web), `tsc --noEmit`.

## 7. Future (explicitly out of scope, but shaped for)

- **Accounts + Pro**: the store shape (`profile`, `tracker`) is the future server model;
  export/import JSON is the migration path.
- **Reminders**: tracker already computes every deadline date.
- **DD manager / bank linking**: `ddSchedule` per PlanItem is the input a Plaid-backed
  verifier would reconcile against.
- **Mobile app**: `engine/` has no DOM dependency and can be published as a package.
- **LLM enrichment**: for fine-print fields regex can't reach; the schema already has the
  fields, so this is an additive scraper change.
- **i18n**: UI strings live in `web/src/i18n/en.ts` from day one; Chinese is the first
  planned locale.

## 8. Decisions log

- Static site + JSON over backend: zero ops, privacy story, open-source friendly.
- Respect `Crawl-delay: 600`: an open-source scraper that gets DoC to block it is worse
  than a slow one. Incremental enrichment makes the delay irrelevant after backfill.
- Greedy scheduler over ILP: explainable, deterministic, fast, good enough for ≤ 250
  candidates and a 12-month horizon. Can be swapped later behind the same `Plan` type.
- Vite + React over Next.js: no server features needed; simplest static build.
- English-only UI at launch with strings externalised.
- Amendments from the 2026-09-14 whole-branch review: scoring on `bonus_min` (honest
  headline), slot released once DD is satisfied (the earlier "slot for the whole window"
  reading halved throughput), `expires_first` reason, `startMonth` always current, error
  boundary + 404, hydration migration, `coral-dark` for text contrast, `tailwind-merge` for
  primitive class overrides.

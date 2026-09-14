# Woolly — Tracker v2, Ledger, and Offer Conditions

Date: 2026-09-14
Status: approved for implementation (owner delegated design decisions; see the MVP spec for everything not restated here)
Supersedes: MVP spec §5.2 "Tracker" and adds §3.2 fields.

## 1. What the owner asked for (and why the v1 tracker fails it)

The v1 tracker is a flat list of heavy cards grouped by status. The owner keeps a spreadsheet
with one row per bank: bonus, conditions, who applied, fee condition, when the bonus arrived,
how long the account must stay open, notes. Looking at v1 they cannot answer "how much have I
actually collected?" or "what do I still have to do for each account?" at a glance, and v1
lets you mark an account Closed the moment the bonus lands even though many banks claw the
bonus back or charge a fee if you close within N days.

Three requirements:

1. **Five stages as a pipeline** the user can see at once, kanban-style.
2. **A ledger on the same screen**: totals (earned / pending / planned) and one compact row
   per tracked offer, like the spreadsheet.
3. **Real conditions per offer**, read from Doctor of Credit *and* from the bank's own offer
   page: how many deposits, how much, by when, how long to keep the account open, fees. Shown
   as a checklist on the tracked item and as an overview in the offer drawer; "earliest safe
   close" is computed from them.

## 2. Stages

| key | label | meaning | typical date |
|-----|-------|---------|--------------|
| `planned` | Planned | in the plan, not opened | `openMonth` |
| `opened` | Opened | account opened, working on requirements | `dates.opened` |
| `requirements_met` | Requirements done | every condition ticked (DD landed, deposits made) | `dates.requirements_met` |
| `received` | Bonus received | bonus posted; account must stay open until `earliestClose` | `dates.received`, `bonusReceived` |
| `closed` | Closed | account closed (or kept open deliberately — same column, "kept" flag not needed for MVP) | `dates.closed` |

`dd_sent` (v1) migrates to `requirements_met`. Moving to `closed` before `earliestClose` is
allowed but shows a warning banner first ("Closing before Mar 30, 2027 may forfeit the bonus
or trigger an early-closure fee").

## 3. Data: offer conditions

### 3.1 Schema additions (`data/bonuses.json`, additive)

```jsonc
"conditions": [
  { "id": "c7f2…",                       // sha1(kind + normalised text)[:8]
    "kind": "direct_deposit" | "deposit" | "balance" | "transactions" | "keep_open" | "fee" | "new_customer" | "other",
    "text": "Receive a total of $1,000 or more in qualifying direct deposits within 90 calendar days",
    "amount": 1000 | null, "days": 90 | null, "count": 2 | null,
    "source": "doc" | "bank" }
],
"hold_days": 180 | null,                   // derived: keep_open.days ?? etf.days
"terms": { "status": "ok" | "blocked" | "error" | "none", "url": "https://…" | null, "fetched_at": "2026-09-14" | null }
```

- `conditions` may be empty; the web app then synthesises a checklist from the structured
  fields (`dd`, `etf`) so every tracked item has at least one condition when DD is required.
- `terms.status`: `none` = no `offer_url`; `blocked` = HTTP 403/429/connection refused;
  `error` = other failure; `ok` = page fetched (even if zero sentences matched).

### 3.2 Extraction

Two sources, same sentence classifier:

- **DoC post** (`post_page.py`): the glance block gives structured conditions
  (`direct_deposit` from `dd`, `keep_open`/`fee` from the ETF line, `other` from
  `Additional requirements` unless "None"); the *Fine Print* section is split into sentences
  and each sentence matching the requirement patterns becomes a condition with `source: "doc"`.
- **Bank offer page** (`terms.py`, new): fetch `offer_url` with a browser-like User-Agent,
  20 s timeout, at most one request per host every 5 s, cached under `scraper/.cache/terms/`,
  never retried within 30 days after `blocked`/`error`. Strip `script/style/noscript`, take
  visible text, split into sentences, keep those matching the patterns (40–400 chars), dedupe
  by normalised text, cap 12 per source, `source: "bank"`.

Patterns → kind (first match wins): `direct deposit` → `direct_deposit`; `deposit(s)|fund` +
`$` → `deposit`; `balance|maintain` → `balance`; `transaction|purchase|debit card` →
`transactions`; `keep.*open|remain open|must be open|maintained for` → `keep_open`;
`fee|closure|closing` → `fee`; `new (checking )?customer|not (had|held)|previous` →
`new_customer`; else `other`. `amount` = first `$` figure, `days` = first `within|for N days`
(months × 30), `count` = first `N (qualifying )?(direct deposits|deposits|transactions)`.

CLI: `woolly-scrape terms [--limit N] [--cached-only] [--delay 5]`. Nightly workflow adds
`terms --limit 20` after `enrich`. `list`/`enrich` are unchanged except that `apply_post` now
also fills `conditions` (doc) and `hold_days`, and re-enrichment preserves `bank` conditions.

## 4. Web

### 4.1 Engine additions (`engine/conditions.ts`, pure)

- `checklistFor(bonus): Condition[]` — `bonus.conditions` deduped by `id`, doc conditions
  first; if none of kind `direct_deposit` and `dd.required !== false`, synthesise one from
  `dd` ("Direct deposit of $X within N days" / "Direct deposit required — amount not listed");
  if none of kind `keep_open` and `etf?.days`, synthesise "Keep the account open for N days".
- `earliestCloseDate(bonus, openedISO): string` — `opened + (hold_days ?? etf.days ?? 180)`.
- `receivedAmount(item, bonus)` — `item.bonusReceived ?? bonus.bonus_max ?? 0`.
- `ledgerTotals(items, bonuses)` — `{ earned, pending, planned, counts }` where earned sums
  `received`+`closed`, pending sums `opened`+`requirements_met`, planned sums `planned`.

### 4.2 Store v2

`version: 2`, `migrate`: v1 `dd_sent` → `requirements_met`; new optional fields on
`TrackedItem`: `conditionsDone: string[]` (condition ids), `bonusReceived?: number`,
`notes?: string`. New actions: `setStatus(id, status, dateISO)` (records the date, allows
moving to any stage), `toggleCondition(id, conditionId)`, `setBonusReceived(id, amount|undefined)`,
`setNotes(id, text)`. `advance` stays (next stage + date).

### 4.3 Tracker page (`/tracker`)

Top to bottom, one screen:

1. **Ledger totals** (dark card): `Earned $X` (gold, big) · `Pending $Y` · `Planned $Z`, each
   with a count ("3 accounts"). Earned uses `bonusReceived` when the user entered it.
2. **Ledger table** (`<table>` in an `overflow-x-auto` card; on mobile it scrolls
   horizontally inside the card). Columns: Offer (avatar + bank + short title) · Bonus ·
   Requirements (`2/3 ✓` chip, coral-dark when the DD deadline is < 14 days) · Opened ·
   DD by · Received (date and amount) · Close after (date; lock icon + countdown while status
   is `received`) · Stage (badge). Rows sorted by stage order then open date. Clicking a row
   opens the item drawer. Toggle "Show closed" (default on).
3. **Pipeline** (kanban): five columns in an `overflow-x-auto snap-x` row, each
   `min-w-[260px] md:min-w-[280px]`, header = stage label · count · sum. Cards (compact):
   avatar, one-line title, amount, one context line by stage (Planned: "Planned for Sep 2026";
   Opened: "DD by Nov 30 · 77 days left" or "Overdue"; Requirements done: "Waiting for bonus";
   Received: "Close after Mar 30, 2027 · 120 days"; Closed: "Closed Mar 31, 2027"), a
   requirements chip (`2/3`), primary-small "Next" button (inline date confirm, as v1) and a
   kebab menu: Details, Move to… (stage submenu), Open on Doctor of Credit, Remove. Empty
   column shows a muted hint. Cards are `<li>`s.
4. **Item drawer** (reuse `Drawer`): title + amount; **Conditions** checklist (checkbox per
   condition; text; `source` badge "DoC"/"Bank"; ticking the last one offers a "Mark
   requirements done" button); **Dates** (one `<input type="date">` per reached stage,
   editable); **Bonus received** amount input (prefilled with `bonus_max`); **Earliest safe
   close** line with the reason ("keep-open condition: 180 days" / "early-closure window" /
   "default 6 months"); **Notes** textarea (autosaves on blur); links: Open on Doctor of
   Credit, Bank offer page (when `offer_url`); Remove.
5. Empty state and Pro banner as v1.

### 4.4 Offer drawer (`/bonuses`) and plan cards

- `BonusDrawer` gains a **Conditions** section (read-only `checklistFor` list with source
  badges) above the glance table, and a "Bank offer page" link when `offer_url` exists; the
  terms status renders a one-line note when `blocked`/`error` ("We couldn't read the bank's
  page — check the conditions on Doctor of Credit").
- `PlanCard` shows a compact "N conditions" chip that opens the drawer.

### 4.5 Copy

All new strings in `en.ts` under `t.tracker.*` (stages, ledger, table headers, drawer),
`t.conditions.*` (kinds, sources, synthesised texts), `t.bonuses.terms.*`.

## 5. Testing

- Scraper: sentence classifier unit tests (kind/amount/days/count on 12 sample sentences);
  `parse_post` yields doc conditions for the Wells Fargo fixture (`direct_deposit` 1000/90,
  `new_customer`); `terms` extraction on a saved Bank of America page fixture yields ≥ 3
  conditions incl. `direct_deposit` with `days 90`; blocked/none statuses.
- Web engine: `checklistFor` synthesis rules; `earliestCloseDate` precedence; `ledgerTotals`.
- Store: v1 → v2 migration; new actions; persistence.
- Tracker: ledger totals; table rows; kanban columns; move via menu; condition toggle;
  close-early warning; drawer autosave of notes.
- E2E: track a plan → tracker shows five columns and the ledger.

## 6. Self-evaluation loop (owner's instruction)

After implementation the controller walks the app with Playwright at 1280 and 400 px as a
first-time user (landing → wizard → plan → track → tracker → drawer → bonuses → settings),
writes a UX findings list (confusing, cramped, noisy, inconsistent, unfinished), fixes what
is fixable in one wave, and repeats until a walkthrough produces no Important findings.

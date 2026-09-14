# Woolly Tracker v2 + Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tracker into a five-stage pipeline with a ledger, and give every offer a real conditions checklist sourced from Doctor of Credit and the bank's own offer page.

**Architecture:** The scraper gains a sentence classifier shared by the DoC post parser and a new `terms` command that fetches bank offer pages; both write `conditions[]`, `hold_days`, `terms{}` onto each bonus. The web engine gets a pure `conditions.ts` (checklist synthesis, earliest close, ledger totals); the store moves to v2 (new stage key, per-item checklist state, received amount, notes); the tracker page is rebuilt as ledger + table + kanban + item drawer; the offer drawer shows conditions.

**Tech Stack:** unchanged (Python 3.12 scraper; Vite + React 19 + TS strict + Tailwind 3 web; vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-14-woolly-tracker-v2-design.md` (binding) on top of `docs/superpowers/specs/2026-09-13-woolly-mvp-design.md`.

## Global Constraints

- Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` regardless of the implementing model. Stage only files you changed.
- Scraper: never guess (unparsed → null); DoC crawl delay 600 s unchanged; bank pages: browser-like UA, 20 s timeout, ≥ 5 s between requests to the same host, cache under `scraper/.cache/terms/`, no retry within 30 days after `blocked`/`error`. Schema additions are additive; `Bonus.to_dict()` gains `conditions`, `hold_days`, `terms` exactly as spec §3.1.
- Web: all copy in `web/src/i18n/en.ts`; engine pure; mobile-first (the ledger table may scroll horizontally inside its own container; nothing else may); contrast via `coral-dark`/`primary-dark` for text; run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` before each commit.
- Stage keys: `planned | opened | requirements_met | received | closed`; v1 `dd_sent` migrates to `requirements_met`.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `scraper/woolly_scraper/conditions.py` | `classify_sentence(text) -> Condition|None`, `split_sentences`, `condition_id`, `extract_conditions(text, source, cap=12)` |
| `scraper/woolly_scraper/models.py` | `Condition` dataclass; `Bonus.conditions`, `hold_days`, `terms_status/url/fetched_at` |
| `scraper/woolly_scraper/post_page.py` | `PostData.conditions` from glance + fine print |
| `scraper/woolly_scraper/merge.py` | `apply_post` fills doc conditions + `hold_days`, preserves bank conditions |
| `scraper/woolly_scraper/terms.py` | `TermsFetcher` (per-host delay, cache, statuses), `parse_terms_page(html) -> list[Condition]` |
| `scraper/woolly_scraper/cli.py` | `terms` subcommand |
| `web/src/engine/conditions.ts` | `checklistFor`, `earliestCloseDate`, `receivedAmount`, `ledgerTotals` |
| `web/src/state/store.ts` | v2 migration, new fields/actions, `STATUS_ORDER` update |
| `web/src/features/conditions/ConditionList.tsx` | read-only or checkable list with source badges |
| `web/src/features/tracker/{TrackerPage,LedgerTotals,LedgerTable,Pipeline,PipelineCard,ItemDrawer}.tsx` | tracker v2 |
| `web/src/features/bonuses/BonusDrawer.tsx`, `web/src/features/plan/PlanCard.tsx` | conditions section / chip |

---

### Task S1: Sentence classifier + DoC conditions

**Files:** create `scraper/woolly_scraper/conditions.py`, `scraper/tests/test_conditions.py`; modify `models.py`, `post_page.py`, `merge.py`, `tests/test_models.py`, `tests/test_post_page.py`, `tests/test_merge.py`.

**Interfaces:**
- `Condition(kind: str, text: str, amount: int|None, days: int|None, count: int|None, source: str)` with `id` property = `sha1(f"{kind}|{normalised text}").hexdigest()[:8]`; `to_dict`/`from_dict` include `id`.
- `classify_sentence(text: str, source: str) -> Condition | None` per spec §3.2 patterns; `split_sentences(text) -> list[str]` on `.;` followed by whitespace and on bullet/newline boundaries; `extract_conditions(text, source, cap=12) -> list[Condition]` (dedupe by id, preserve order).
- `PostData.conditions: list[Condition]` (glance-derived structured ones first, then fine-print sentences); `Bonus.conditions`, `Bonus.hold_days`, `Bonus.terms_status/terms_url/terms_fetched_at` → `to_dict` keys `conditions`, `hold_days`, `terms {status,url,fetched_at}` (terms `status` defaults `"none"` when no `offer_url`, else `null` until fetched).
- `apply_post`: `bonus.conditions = doc_conditions + [c for c in old if c.source == "bank"]`; `hold_days = keep_open.days ?? post.etf_days`.

- [ ] Tests first: 12 classifier cases (Wells Fargo DD sentence → direct_deposit 1000/90; "Account must be kept open for three months" → keep_open days 90; "$12 monthly maintenance fee" → fee amount 12; "Offer is for new consumer checking customers only" → new_customer; "Make at least 2 qualifying direct deposits totaling $500" → count 2 amount 500; a marketing sentence → None); `parse_post` on the Wells Fargo fixture yields ≥ 2 doc conditions incl. direct_deposit 1000/90; `apply_post` preserves a prior bank condition; round-trip in `test_models`.
- [ ] Implement; `scraper/.venv/bin/pytest scraper -q`; ruff clean; commit `feat(scraper): offer conditions from DoC posts`.

### Task S2: Bank terms fetcher + `terms` command + live run

**Files:** create `scraper/woolly_scraper/terms.py`, `scraper/tests/test_terms.py`, fixture `scraper/tests/fixtures/terms-bank-of-america.html` (copy from the scratchpad probe file `b654a846.html`); modify `cli.py`, `tests/test_cli.py`, `.github/workflows/scrape.yml`, `README.md`.

**Interfaces:**
- `TermsFetcher(cache_dir, delay=5.0, session=None, sleep=time.sleep, clock=time.time)`: `get(url) -> tuple[str, str]` returning `(status, html)` where status ∈ `ok|blocked|error`; per-host last-request timestamps; cache file per URL; UA `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36`; 403/429 → blocked; connection errors/timeouts → error.
- `parse_terms_page(html: str) -> list[Condition]` (source `bank`, cap 12).
- CLI `terms [--limit N] [--cached-only] [--delay 5] [--data] [--cache]`: candidates = enriched bonuses with `offer_url` whose `terms_status` is null, or `ok` older than 30 days; skip `blocked`/`error` younger than 30 days; per bonus: fetch, parse, set `conditions = doc + bank`, `terms_*`; checkpoint save; print one line per bonus.
- `scrape.yml`: add `woolly-scrape terms --limit 20` after `enrich`. README: describe `terms`.

- [ ] Tests: fixture yields ≥ 3 conditions incl. direct_deposit days 90; fetcher statuses via fake session; per-host delay via fake clock; CLI with fake fetcher marks `ok`, `blocked`, and `none` (no offer_url) correctly and skips recently-blocked.
- [ ] Live run (allowed, polite): `scraper/.venv/bin/woolly-scrape terms --limit 30 --delay 5` — ~24 requests to different bank hosts. Report the status distribution. Commit code + `data/bonuses.json`: `feat(scraper): read bank offer pages for conditions`.

### Task W1: Engine conditions + store v2

**Files:** create `web/src/engine/conditions.ts`, `conditions.test.ts`; modify `web/src/engine/types.ts` (add `Condition`, `Bonus.conditions`, `hold_days`, `terms`), `index.ts`, `web/src/data/fixture.ts` (add conditions to 3 entries; `terms` on all), `web/src/state/store.ts`, `store.test.ts`, `web/src/i18n/en.ts` (stage labels: `requirements_met: "Requirements done"`; `t.conditions.*`).

**Interfaces:** per spec §4.1–4.2. `TrackStatus = "planned" | "opened" | "requirements_met" | "received" | "closed"`; `STATUS_ORDER` updated; `TrackedItem` gains `conditionsDone: string[]` (default `[]`), `bonusReceived?: number`, `notes?: string`; actions `setStatus`, `toggleCondition`, `setBonusReceived`, `setNotes`; persist `version: 2` with `migrate` mapping `dd_sent`.

- [ ] Tests: synthesis rules (no conditions + dd 1000/90 → one direct_deposit; etf days → keep_open; existing conditions untouched, deduped); `earliestCloseDate` precedence (hold_days > etf.days > 180); `ledgerTotals` with `bonusReceived` override; migration of a v1 blob with `dd_sent`; each new action; `advance` still walks the new order.
- [ ] Update any existing tests referencing `dd_sent`. Commit `feat(web): conditions engine and store v2`.

### Task W2: ConditionList + drawer/plan integration

**Files:** create `web/src/features/conditions/ConditionList.tsx` + test; modify `BonusDrawer.tsx`, `PlanCard.tsx`, `en.ts`, their tests.

- `ConditionList({ conditions, done?: Set<string>, onToggle?, compact? })`: `<ul>`; each row: checkbox (when `onToggle`) or bullet, text, `Badge` source (`DoC`/`Bank`), kind icon optional. Read-only in `BonusDrawer` (section "Conditions" above the glance table, with the terms-status note and a "Bank offer page" link); `PlanCard` chip `t.plan.badges.conditions(n)` → "3 conditions" that opens the drawer (same navigation as Details).
- [ ] Tests: renders sources; toggle calls back; drawer shows synthesised DD condition for a fixture without conditions. Commit `feat(web): condition lists in offer drawer and plan cards`.

### Task W3: Tracker v2 page

**Files:** replace `web/src/features/tracker/TrackerPage.tsx`, `TrackedCard.tsx` with `TrackerPage.tsx`, `LedgerTotals.tsx`, `LedgerTable.tsx`, `Pipeline.tsx`, `PipelineCard.tsx`, `ItemDrawer.tsx`; tests `TrackerPage.test.tsx`, `ItemDrawer.test.tsx`; `en.ts`; e2e addition in `web/tests/e2e/smoke.spec.ts`.

- Layout and behaviour per spec §4.3 exactly. Item drawer selection via `?item=<id>`. Close-early warning: when moving to `closed` (menu or Next) and `today < earliestCloseDate`, show a confirm panel inside the date form ("Closing before {date} may forfeit the bonus or trigger a fee. Close anyway?") before applying.
- [ ] Tests per spec §5 (tracker bullets). E2E: after "Track this plan", `/tracker` shows the five column headings and the ledger "Earned" label. Commit `feat(web): tracker v2 — ledger, table, pipeline, item drawer`.

### Task W4: Controller UX walkthrough + fix wave

Controller-run (see spec §6): Playwright walkthrough at 1280/400 with a seeded profile and tracked items in every stage; findings list → one fix dispatch → re-walk. Repeat until no Important findings.

---

## Self-review

- Spec §2 stages → W1 (keys, migration) + W3 (UI). §3 schema/extraction → S1, S2. §4.1 engine → W1. §4.2 store → W1. §4.3 tracker → W3. §4.4 drawer/plan → W2. §5 tests → each task. §6 loop → W4.
- Type consistency: `Condition{id,kind,text,amount,days,count,source}` identical in Python `to_dict` and TS `Condition`; `terms{status,url,fetched_at}`; `TrackStatus` keys shared by store, ledger, pipeline, e2e.

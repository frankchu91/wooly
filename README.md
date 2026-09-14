# 🐑 Woolly — bank bonus planner

Turn your paycheck into bank account bonuses. Tell Woolly your state, your direct-deposit
capacity, and the banks you've had; it finds the bonuses you qualify for and schedules them.

- Free, open source (MIT), runs entirely in your browser. Nothing is uploaded.
- Data comes from [Doctor of Credit](https://www.doctorofcredit.com/best-bank-account-bonuses/), refreshed nightly.
- Not financial advice. Always read the offer terms on Doctor of Credit before opening an account.

## Repo layout

- `scraper/` — Python scraper that produces `data/bonuses.json` (see the Scraper section below)
- `web/` — Vite + React app
- `data/bonuses.json` — the dataset the app reads

## Web app

```bash
cd web && pnpm install && pnpm dev      # http://localhost:5173
pnpm test                               # unit tests (Vitest)
pnpm e2e                                # Playwright smoke test (starts its own dev server)
```

- **Plan** (`/plan`) — the month-by-month schedule of bonuses to open, with projected earnings, direct-deposit deadlines, and safe-to-close dates.
- **Tracker** (`/tracker`) — the bonuses you've committed to, grouped by status, so you don't miss a direct-deposit or closing deadline.
- **Bonuses** (`/bonuses`) — every offer in the dataset, searchable and filterable, independent of your plan.
- **Settings** (`/settings`) — edit your profile (state, direct deposit, history) and export, import, or clear your locally-stored data.

### How the plan is built

Woolly builds your plan entirely in your browser, in three steps: it checks each offer's **eligibility** against your state, bank history, and preferences (excluding expired offers, ones you don't qualify for, or ones you've asked to avoid); it **scores** the remaining offers by expected value against how much direct deposit they need; and it **greedily schedules** them into a month-by-month plan, filling each month's direct-deposit capacity with the highest-scoring bonuses that still fit before moving to the next month. Nothing about your profile or plan ever leaves your machine.

### Contributing data fixes

The bonus data itself comes from the scraper — see the [Scraper](#scraper) section below for how to refresh it or fix a parsing issue.

## Scraper

```bash
cd scraper && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
cd .. && scraper/.venv/bin/woolly-scrape list            # refresh the list (1 request)
scraper/.venv/bin/woolly-scrape enrich --limit 5         # fetch 5 posts, 600 s apart
scraper/.venv/bin/pytest scraper -q
```

The scraper honours DoC's `Crawl-delay: 600`. A full backfill of ~250 posts takes
~2 days; run it locally with `enrich` in the background, or let the nightly action
chip away at 5 posts per run.

`enrich` also takes:

- `--cached-only` — re-parse everything already in `scraper/.cache` (e.g. after a parser
  fix) without making any network requests.
- `--no-cache` — bypass the cache and always re-fetch, like `list --no-cache`.

`woolly-scrape terms --limit 20` reads each enriched offer's own bank page (`offer_url`) for
conditions — DoC's post is a summary, but the bank's page is the actual offer terms, and often
has requirements DoC doesn't restate. It's polite per host rather than globally: a browser-like
User-Agent, a 20s timeout, and at least 5 seconds between requests to the same bank, with pages
cached under `scraper/.cache/terms/` (one file per URL). Each offer gets a `terms.status` —
`ok` (fetched, conditions extracted, even if zero matched), `blocked` (403/429), `error`
(timeout, connection failure, or other non-2xx), or `none` (no `offer_url` to fetch) — and
`blocked`/`error` results are never retried for 30 days; `ok` results are refreshed after 30
days. Bank-sourced conditions (`source: "bank"`) are merged with the DoC-sourced ones already
on the offer; a fetch that isn't `ok` leaves existing conditions untouched. `--cached-only`
re-parses cached pages without any network requests.

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

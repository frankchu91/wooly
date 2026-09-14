from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from datetime import UTC, date, datetime
from pathlib import Path

from .conditions import dedupe_conditions
from .fetch import DEFAULT_DELAY, BlockedError, Fetcher
from .list_page import parse_list_page
from .merge import apply_post, merge_list, needs_enrich
from .models import Bonus
from .post_page import parse_post
from .terms import DEFAULT_DELAY as TERMS_DEFAULT_DELAY
from .terms import TermsFetcher, parse_terms_page

LIST_URL = "https://www.doctorofcredit.com/best-bank-account-bonuses/"
DEFAULT_DATA = Path("data/bonuses.json")
DEFAULT_CACHE = Path("scraper/.cache")
DEFAULT_TERMS_CACHE = DEFAULT_CACHE / "terms"
TERMS_RECHECK_DAYS = 30


def today() -> date:
    return datetime.now(UTC).date()


def make_fetcher(cache: Path, delay: float) -> Fetcher:
    return Fetcher(cache_dir=cache, delay=delay)


def make_terms_fetcher(cache: Path, delay: float) -> TermsFetcher:
    return TermsFetcher(cache_dir=cache, delay=delay)


def load(path: Path) -> list[Bonus]:
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    return [Bonus.from_dict(d) for d in doc.get("bonuses", [])]


def save(path: Path, bonuses: list[Bonus]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "source": LIST_URL,
        "bonuses": [b.to_dict() for b in sorted(bonuses, key=lambda b: b.id)],
    }
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def cmd_list(args) -> int:
    fetcher = make_fetcher(Path(args.cache), args.delay)
    try:
        html = fetcher.get(LIST_URL, use_cache=not args.no_cache)
    except BlockedError as e:
        print(str(e), file=sys.stderr)
        return 3
    entries = parse_list_page(html)
    if len(entries) < 50:
        print(f"refusing to save: only {len(entries)} entries parsed (page layout changed?)", file=sys.stderr)
        return 2
    merged = merge_list(load(Path(args.data)), entries, today())
    save(Path(args.data), merged)
    print(f"list: {len(entries)} entries parsed, {len(merged)} bonuses saved to {args.data}")
    return 0


def cmd_enrich(args) -> int:
    path = Path(args.data)
    bonuses = load(path)
    fetcher = make_fetcher(Path(args.cache), args.delay)
    t = today()
    if args.cached_only:
        # "Re-parse everything already cached" (e.g. after a parser fix), like
        # `terms --cached-only`: this bypasses the 30-day freshness gate entirely,
        # not just the "is it cached" check, since the whole point is reprocessing
        # pages we already have regardless of when they were last enriched.
        todo = [b for b in bonuses if fetcher.has_cached(b.doc_url)]
    else:
        todo = [b for b in bonuses if needs_enrich(b, t)]
    if args.only_nationwide:
        todo = [b for b in todo if b.nationwide]
    if args.ids:
        wanted = set(args.ids.split(","))
        todo = [b for b in todo if b.id in wanted]
    # never-enriched entries first, then the ones enriched longest ago
    todo.sort(key=lambda b: (b.enriched_at is not None, b.enriched_at or date.min))
    todo = todo[: args.limit] if args.limit else todo
    done = 0
    by_id = {b.id: b for b in bonuses}
    for b in todo:
        try:
            html = fetcher.get(b.doc_url, use_cache=not args.no_cache)
            by_id[b.id] = apply_post(b, parse_post(html, t), t)
        except BlockedError as e:
            print(str(e), file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001 - one bad post must not kill the run
            print(f"skip {b.id}: {e}", file=sys.stderr)
            continue
        done += 1
        print(f"enriched {b.id}")
        save(path, list(by_id.values()))  # checkpoint after every post (runs are slow)
    print(f"enrich: {done}/{len(todo)} posts processed")
    return 0


def _terms_candidate(b: Bonus, today: date) -> bool:
    """True if `b` should be (re)fetched for bank terms this run.

    `terms_status == "none"` (no `offer_url` at enrichment time) is deliberately not a
    candidate here even if `offer_url` has since appeared — spec's candidate predicate
    only names `None`/`ok`/`blocked`/`error`.
    """
    if not (b.enriched and b.offer_url):
        return False
    if b.terms_status is None:
        return True
    if b.terms_status not in ("ok", "blocked", "error"):
        return False
    if b.terms_fetched_at is None:
        return True
    return (today - b.terms_fetched_at).days > TERMS_RECHECK_DAYS


def cmd_terms(args) -> int:
    path = Path(args.data)
    bonuses = load(path)
    fetcher = make_terms_fetcher(Path(args.cache), args.delay)
    t = today()
    if args.cached_only:
        # "Re-parse everything already cached" (e.g. after a parser fix), like
        # `enrich --cached-only`: this bypasses the 30-day freshness gate entirely,
        # not just the "is it cached" check, since the whole point is reprocessing
        # pages we already have regardless of when they were last fetched.
        todo = [
            b for b in bonuses if b.enriched and b.offer_url and fetcher.has_cached(b.offer_url)
        ]
    else:
        todo = [b for b in bonuses if _terms_candidate(b, t)]
    todo = todo[: args.limit] if args.limit else todo
    done = 0
    by_id = {b.id: b for b in bonuses}
    for b in todo:
        try:
            status, html = fetcher.get(b.offer_url)
            bank_conditions = parse_terms_page(html) if status == "ok" else []
            conditions = (
                dedupe_conditions([c for c in b.conditions if c.source == "doc"] + bank_conditions)
                if status == "ok"
                else b.conditions
            )
        except Exception as e:  # noqa: BLE001 - one bad page must not kill the run
            print(f"skip {b.id}: {e}", file=sys.stderr)
            continue
        by_id[b.id] = dataclasses.replace(
            b,
            terms_status=status,
            terms_url=b.offer_url,
            terms_fetched_at=t,
            conditions=conditions,
        )
        done += 1
        print(f"terms {b.id}: {status} ({len(bank_conditions)} conditions)")
        save(path, list(by_id.values()))  # checkpoint after every fetch (runs are slow)
    print(f"terms: {done}/{len(todo)} bonuses processed")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="woolly-scrape")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("list", "enrich"):
        sp = sub.add_parser(name)
        sp.add_argument("--data", default=str(DEFAULT_DATA))
        sp.add_argument("--cache", default=str(DEFAULT_CACHE))
        sp.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    sub.choices["list"].add_argument("--no-cache", action="store_true")
    en = sub.choices["enrich"]
    en.add_argument("--limit", type=int, default=0)
    en.add_argument("--only-nationwide", action="store_true")
    en.add_argument("--ids", default="")
    en.add_argument("--no-cache", action="store_true")
    en.add_argument(
        "--cached-only",
        action="store_true",
        help=(
            "re-parse every entry whose post HTML is already cached, bypassing the 30-day "
            "freshness gate (e.g. after a parser fix); makes zero network requests"
        ),
    )
    tp = sub.add_parser("terms")
    tp.add_argument("--data", default=str(DEFAULT_DATA))
    tp.add_argument("--cache", default=str(DEFAULT_TERMS_CACHE))
    tp.add_argument("--delay", type=float, default=TERMS_DEFAULT_DELAY)
    tp.add_argument("--limit", type=int, default=0)
    tp.add_argument(
        "--cached-only",
        action="store_true",
        help="only process offer_urls already cached under scraper/.cache/terms; makes zero network requests",
    )
    args = ap.parse_args(argv)
    if args.cmd == "list":
        return cmd_list(args)
    if args.cmd == "enrich":
        return cmd_enrich(args)
    return cmd_terms(args)


if __name__ == "__main__":
    raise SystemExit(main())

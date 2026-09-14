import json
from datetime import date
from pathlib import Path

from woolly_scraper import cli

FIX = Path(__file__).parent / "fixtures"


class FakeFetcher:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def get(self, url, use_cache=True):
        self.calls.append(url)
        return self.pages[url]


def test_list_then_enrich(tmp_path, monkeypatch):
    data = tmp_path / "bonuses.json"
    list_html = (FIX / "best-bank-account-bonuses.html").read_text(encoding="utf-8", errors="ignore")
    wf_html = (FIX / "post-wells-fargo-500.html").read_text(encoding="utf-8", errors="ignore")
    pages = {cli.LIST_URL: list_html, "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/": wf_html}
    fake = FakeFetcher(pages)
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: fake)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 13))

    assert cli.main(["list", "--data", str(data)]) == 0
    doc = json.loads(data.read_text())
    # 247 raw entries collapse to ~237 unique bonuses: several DoC posts (e.g. Citi's
    # checking and savings variants) are listed under two sections but share one doc_url,
    # so merge_list's id-based dedup correctly folds them into a single bonus.
    assert doc["source"] == cli.LIST_URL and len(doc["bonuses"]) >= 230
    wf = next(b for b in doc["bonuses"] if b["id"] == "wells-fargo-500-checking-bonus")
    assert wf["enriched"] is False

    # enrich only nationwide, limit 1, and make the fake only know Wells Fargo:
    # entries whose post is not in `pages` must be skipped gracefully, not crash.
    assert cli.main(["enrich", "--data", str(data), "--limit", "1", "--only-nationwide", "--ids", "wells-fargo-500-checking-bonus"]) == 0
    doc = json.loads(data.read_text())
    wf = next(b for b in doc["bonuses"] if b["id"] == "wells-fargo-500-checking-bonus")
    assert wf["enriched"] is True and wf["expiration"] == "2026-10-06" and wf["dd"]["deadline_days"] == 90

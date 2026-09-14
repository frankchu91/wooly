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


class BlockedFetcher:
    """Serves the list page normally but raises BlockedError for any post."""

    def __init__(self, pages):
        self.pages = pages

    def get(self, url, use_cache=True):
        if url == cli.LIST_URL:
            return self.pages[url]
        raise cli.BlockedError(f"403 from {url}; stopping to stay polite")


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


def test_enrich_skips_bad_post_and_continues(tmp_path, monkeypatch):
    data = tmp_path / "bonuses.json"
    list_html = (FIX / "best-bank-account-bonuses.html").read_text(encoding="utf-8", errors="ignore")
    wf_html = (FIX / "post-wells-fargo-500.html").read_text(encoding="utf-8", errors="ignore")
    # the fake only knows the Wells Fargo post; any other doc_url raises KeyError,
    # simulating a fetch/parse failure that must not kill the run.
    pages = {cli.LIST_URL: list_html, "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/": wf_html}
    fake = FakeFetcher(pages)
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: fake)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 13))

    assert cli.main(["list", "--data", str(data)]) == 0

    good_id = "wells-fargo-500-checking-bonus"
    bad_id = "affinity-federal-credit-union-100-referral-bonus"
    assert cli.main(["enrich", "--data", str(data), "--ids", f"{good_id},{bad_id}"]) == 0

    doc = json.loads(data.read_text())
    by_id = {b["id"]: b for b in doc["bonuses"]}
    assert by_id[good_id]["enriched"] is True
    assert by_id[bad_id]["enriched"] is False


def test_enrich_stops_on_blocked_error(tmp_path, monkeypatch, capsys):
    data = tmp_path / "bonuses.json"
    list_html = (FIX / "best-bank-account-bonuses.html").read_text(encoding="utf-8", errors="ignore")
    pages = {cli.LIST_URL: list_html}
    fake = BlockedFetcher(pages)
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: fake)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 13))

    assert cli.main(["list", "--data", str(data)]) == 0
    assert cli.main(["enrich", "--data", str(data), "--limit", "1"]) == 0

    doc = json.loads(data.read_text())
    assert not any(b["enriched"] for b in doc["bonuses"])
    err = capsys.readouterr().err
    assert "stopping to stay polite" in err


def test_list_refuses_to_save_when_too_few_entries(tmp_path, monkeypatch):
    data = tmp_path / "bonuses.json"
    small_html = (
        '<html><div class="entry-content"><h2>Best Checking Account Bonuses</h2>'
        '<h3>X $100</h3><p><a href="https://www.doctorofcredit.com/x/">Read our full post</a></p>'
        "</div></html>"
    )
    pages = {cli.LIST_URL: small_html}
    fake = FakeFetcher(pages)
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: fake)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 13))

    assert cli.main(["list", "--data", str(data)]) == 2
    assert not data.exists()

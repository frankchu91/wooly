import json
from datetime import date
from pathlib import Path

from woolly_scraper import cli
from woolly_scraper.models import Bonus

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


class AlwaysBlockedFetcher:
    """Raises BlockedError for every request, including the list page itself."""

    def get(self, url, use_cache=True):
        raise cli.BlockedError(f"403 from {url}; stopping to stay polite")


class CachedOnlyFetcher:
    """A fetcher that knows which urls are already cached, for --cached-only."""

    def __init__(self, pages, cached_urls):
        self.pages = pages
        self.cached_urls = set(cached_urls)
        self.calls = []

    def has_cached(self, url):
        return url in self.cached_urls

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


def test_list_returns_3_and_prints_error_when_blocked(tmp_path, monkeypatch, capsys):
    data = tmp_path / "bonuses.json"
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: AlwaysBlockedFetcher())
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 13))

    assert cli.main(["list", "--data", str(data)]) == 3
    assert not data.exists()
    err = capsys.readouterr().err
    assert "stopping to stay polite" in err


def test_enrich_cached_only_skips_uncached_entries(tmp_path, monkeypatch):
    data = tmp_path / "bonuses.json"
    list_html = (FIX / "best-bank-account-bonuses.html").read_text(encoding="utf-8", errors="ignore")
    wf_html = (FIX / "post-wells-fargo-500.html").read_text(encoding="utf-8", errors="ignore")
    wf_url = "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/"
    pages = {cli.LIST_URL: list_html, wf_url: wf_html}
    fake = FakeFetcher(pages)
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: fake)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 13))
    assert cli.main(["list", "--data", str(data)]) == 0

    # a fresh fetcher that only reports the Wells Fargo post as cached
    cached = CachedOnlyFetcher(pages, cached_urls={wf_url})
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: cached)
    good_id = "wells-fargo-500-checking-bonus"
    uncached_id = "affinity-federal-credit-union-100-referral-bonus"
    assert cli.main(
        ["enrich", "--data", str(data), "--cached-only", "--ids", f"{good_id},{uncached_id}"]
    ) == 0

    doc = json.loads(data.read_text())
    by_id = {b["id"]: b for b in doc["bonuses"]}
    assert by_id[good_id]["enriched"] is True
    assert by_id[uncached_id]["enriched"] is False
    assert cached.calls == [wf_url]


class FakeTermsFetcher:
    """Serves canned (status, html) responses for offer_urls, for the `terms` command."""

    def __init__(self, responses, cached_urls=None):
        self.responses = responses
        self.cached_urls = set(cached_urls or [])
        self.calls = []

    def has_cached(self, url):
        return url in self.cached_urls

    def get(self, url):
        self.calls.append(url)
        return self.responses[url]


def _terms_bonus(id_, offer_url=None, terms_status=None, terms_fetched_at=None, conditions=None):
    return Bonus(
        id=id_,
        bank="Bank",
        title=f"{id_} $100",
        section="checking",
        doc_url=f"https://www.doctorofcredit.com/{id_}/",
        last_seen=date(2026, 9, 13),
        enriched=True,
        enriched_at=date(2026, 9, 1),
        offer_url=offer_url,
        terms_status=terms_status,
        terms_fetched_at=terms_fetched_at,
        conditions=conditions or [],
    )


def test_terms_marks_ok_blocked_and_skips_no_offer_url_and_recent_blocked(tmp_path, monkeypatch, capsys):
    from woolly_scraper.models import Condition

    data = tmp_path / "bonuses.json"
    doc_cond = Condition(kind="direct_deposit", text="Direct deposit of $500", amount=500, source="doc")
    bofa_html = (FIX / "terms-bank-of-america.html").read_text(encoding="utf-8", errors="ignore")
    bonuses = [
        _terms_bonus("a", offer_url="https://bank-a.test/offer/", conditions=[doc_cond]),
        _terms_bonus("b", offer_url="https://bank-b.test/offer/"),
        _terms_bonus("c", offer_url=None, terms_status="none"),
        _terms_bonus(
            "d",
            offer_url="https://bank-d.test/offer/",
            terms_status="blocked",
            terms_fetched_at=date(2026, 9, 10),  # 4 days ago: within the 30-day cooldown
        ),
        _terms_bonus(
            "e",
            offer_url="https://bank-e.test/offer/",
            terms_status="ok",
            terms_fetched_at=date(2026, 7, 1),  # >30 days ago: due for a refresh
        ),
    ]
    cli.save(data, bonuses)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 14))
    responses = {
        "https://bank-a.test/offer/": ("ok", bofa_html),
        "https://bank-b.test/offer/": ("blocked", ""),
        "https://bank-e.test/offer/": ("error", ""),
    }
    fake = FakeTermsFetcher(responses)
    monkeypatch.setattr(cli, "make_terms_fetcher", lambda cache, delay: fake)

    assert cli.main(["terms", "--data", str(data)]) == 0

    doc = json.loads(data.read_text())
    by_id = {b["id"]: b for b in doc["bonuses"]}

    assert by_id["a"]["terms"] == {
        "status": "ok",
        "url": "https://bank-a.test/offer/",
        "fetched_at": "2026-09-14",
    }
    sources = {c["source"] for c in by_id["a"]["conditions"]}
    assert sources == {"doc", "bank"}  # doc conditions preserved, bank conditions added
    assert any(c["kind"] == "direct_deposit" and c["days"] == 90 for c in by_id["a"]["conditions"])

    assert by_id["b"]["terms"]["status"] == "blocked"
    assert by_id["b"]["conditions"] == []  # unchanged: not ok, so conditions are left alone

    assert by_id["c"]["terms"]["status"] == "none"  # no offer_url: never a candidate
    assert by_id["d"]["terms"]["status"] == "blocked"  # recently blocked: not retried
    assert by_id["d"]["terms"]["fetched_at"] == "2026-09-10"  # untouched

    assert by_id["e"]["terms"]["status"] == "error"  # stale ok refreshed, this time errored

    assert set(fake.calls) == {
        "https://bank-a.test/offer/",
        "https://bank-b.test/offer/",
        "https://bank-e.test/offer/",
    }
    out = capsys.readouterr().out
    assert "terms b: blocked (0 conditions)" in out
    assert any(line.startswith("terms a: ok (") and line.endswith(" conditions)") for line in out.splitlines())


def test_terms_cached_only_skips_uncached(tmp_path, monkeypatch):
    data = tmp_path / "bonuses.json"
    bonuses = [
        _terms_bonus("a", offer_url="https://bank-a.test/offer/"),
        _terms_bonus("b", offer_url="https://bank-b.test/offer/"),
    ]
    cli.save(data, bonuses)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 14))
    responses = {"https://bank-a.test/offer/": ("ok", "<html><p>no requirement sentences here</p></html>")}
    fake = FakeTermsFetcher(responses, cached_urls={"https://bank-a.test/offer/"})
    monkeypatch.setattr(cli, "make_terms_fetcher", lambda cache, delay: fake)

    assert cli.main(["terms", "--data", str(data), "--cached-only"]) == 0

    doc = json.loads(data.read_text())
    by_id = {b["id"]: b for b in doc["bonuses"]}
    assert by_id["a"]["terms"]["status"] == "ok"
    assert by_id["b"]["terms"]["status"] is None  # not cached: skipped, no network call made
    assert fake.calls == ["https://bank-a.test/offer/"]


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

from pathlib import Path

import pytest
import requests

from woolly_scraper.terms import TermsFetcher, parse_terms_page

FIX = Path(__file__).parent / "fixtures"


class FakeResp:
    def __init__(self, status, text):
        self.status_code = status
        self.text = text


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, headers=None, timeout=None):
        self.calls.append((url, headers, timeout))
        resp = self.responses.pop(0)
        if isinstance(resp, Exception):
            raise resp
        return resp


# --- parse_terms_page ---


def test_parse_terms_page_bank_of_america_fixture_yields_direct_deposit_and_others():
    html = (FIX / "terms-bank-of-america.html").read_text(encoding="utf-8", errors="ignore")
    conditions = parse_terms_page(html)
    assert len(conditions) >= 3
    assert all(c.source == "bank" for c in conditions)
    dd = next(c for c in conditions if c.kind == "direct_deposit" and c.days == 90)
    assert "90 days" in dd.text


def test_parse_terms_page_empty_html_yields_no_conditions():
    assert parse_terms_page("<html><body></body></html>") == []


# --- TermsFetcher.get: statuses ---


def test_get_ok_caches_and_returns_html(tmp_path: Path):
    s = FakeSession([FakeResp(200, "<html>hi</html>")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, html = f.get("https://bank.test/offer/")
    assert (status, html) == ("ok", "<html>hi</html>")
    assert f._path("https://bank.test/offer/").exists()
    assert s.calls[0][1]["User-Agent"].startswith("Mozilla/5.0")
    assert s.calls[0][2] == 20


@pytest.mark.parametrize("code", [403, 429])
def test_get_blocked_status_codes(tmp_path: Path, code):
    s = FakeSession([FakeResp(code, "go away")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, _html = f.get("https://bank.test/offer/")
    assert status == "blocked"
    assert not f._path("https://bank.test/offer/").exists()


def test_get_other_non_2xx_status_is_error(tmp_path: Path):
    s = FakeSession([FakeResp(500, "boom")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, _html = f.get("https://bank.test/offer/")
    assert status == "error"


def test_get_connection_error_is_error(tmp_path: Path):
    s = FakeSession([requests.exceptions.ConnectionError("refused")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, html = f.get("https://bank.test/offer/")
    assert status == "error"
    assert html == ""


def test_get_timeout_is_error(tmp_path: Path):
    s = FakeSession([requests.exceptions.Timeout("slow")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, _html = f.get("https://bank.test/offer/")
    assert status == "error"


def test_cache_hit_returns_ok_without_network(tmp_path: Path):
    s = FakeSession([FakeResp(200, "<html>a</html>")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    assert f.get("https://bank.test/offer/") == ("ok", "<html>a</html>")
    assert f.get("https://bank.test/offer/") == ("ok", "<html>a</html>")
    assert len(s.calls) == 1  # second call was a cache hit


# --- per-host delay ---


def test_per_host_delay_different_hosts_no_sleep(tmp_path: Path):
    clock = {"t": 0.0}
    slept = []
    s = FakeSession([FakeResp(200, "a"), FakeResp(200, "b")])
    f = TermsFetcher(
        cache_dir=tmp_path, delay=5, session=s, sleep=slept.append, clock=lambda: clock["t"]
    )
    f.get("https://bank-a.test/offer/")
    clock["t"] = 0.1  # a moment later, but a different host
    f.get("https://bank-b.test/offer/")
    assert slept == []


def test_per_host_delay_same_host_within_window_sleeps(tmp_path: Path):
    clock = {"t": 0.0}
    slept = []
    s = FakeSession([FakeResp(200, "a"), FakeResp(200, "b")])
    f = TermsFetcher(
        cache_dir=tmp_path, delay=5, session=s, sleep=slept.append, clock=lambda: clock["t"]
    )
    f.get("https://bank-a.test/offer1/")
    clock["t"] = 2.0  # only 2s later, same host, needs to wait 3 more
    f.get("https://bank-a.test/offer2/")
    assert slept == [3.0]


def test_first_request_to_a_host_never_sleeps(tmp_path: Path):
    slept = []
    s = FakeSession([FakeResp(200, "a")])
    f = TermsFetcher(cache_dir=tmp_path, delay=5, session=s, sleep=slept.append)
    f.get("https://bank-a.test/offer/")
    assert slept == []

from pathlib import Path

import pytest

from woolly_scraper.fetch import BlockedError, Fetcher


class FakeResp:
    def __init__(self, status, text):
        self.status_code = status
        self.text = text

    def raise_for_status(self):
        pass


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, headers=None, timeout=None):
        self.calls.append((url, headers))
        return self.responses.pop(0)


class RaisingSession:
    def get(self, url, headers=None, timeout=None):
        raise TimeoutError("boom")


def test_caches_and_delays(tmp_path: Path):
    slept = []
    s = FakeSession([FakeResp(200, "<html>a</html>"), FakeResp(200, "<html>b</html>")])
    f = Fetcher(cache_dir=tmp_path, delay=5, session=s, sleep=slept.append)
    assert f.get("https://x.test/a/") == "<html>a</html>"
    assert f.get("https://x.test/a/") == "<html>a</html>"  # cache hit, no request
    assert f.get("https://x.test/b/") == "<html>b</html>"
    assert len(s.calls) == 2
    assert slept == [5]  # first request has no delay, second waits
    assert s.calls[0][1]["User-Agent"].startswith("woolly-scraper/")


def test_blocked_raises(tmp_path: Path):
    s = FakeSession([FakeResp(429, "slow down")])
    f = Fetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    with pytest.raises(BlockedError):
        f.get("https://x.test/a/")


def test_bypass_cache(tmp_path: Path):
    s = FakeSession([FakeResp(200, "1"), FakeResp(200, "2")])
    f = Fetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    assert f.get("https://x.test/a/") == "1"
    assert f.get("https://x.test/a/", use_cache=False) == "2"


def test_cross_process_delay_from_last_request_file(tmp_path: Path):
    clock = {"t": 1_000.0}

    def fake_clock():
        return clock["t"]

    s1 = FakeSession([FakeResp(200, "<html>a</html>")])
    f1 = Fetcher(cache_dir=tmp_path, delay=10, session=s1, sleep=lambda _: None, clock=fake_clock)
    f1.get("https://x.test/a/")

    clock["t"] = 1_004.0  # 4s later, in a fresh process sharing the same cache dir
    slept = []
    s2 = FakeSession([FakeResp(200, "<html>b</html>")])
    f2 = Fetcher(cache_dir=tmp_path, delay=10, session=s2, sleep=slept.append, clock=fake_clock)
    f2.get("https://x.test/b/")
    assert slept == [6]  # 10 - 4 elapsed


def test_requests_made_and_last_request_bumped_even_on_exception(tmp_path: Path):
    f = Fetcher(cache_dir=tmp_path, delay=0, session=RaisingSession(), sleep=lambda _: None)
    with pytest.raises(TimeoutError):
        f.get("https://x.test/a/")
    assert f._requests_made == 1
    assert (tmp_path / ".last_request").exists()

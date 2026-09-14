from pathlib import Path

import pytest

from woolly_scraper.fetch import BlockedError, Fetcher


class FakeResp:
    def __init__(self, status, text):
        self.status_code = status
        self.text = text


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, headers=None, timeout=None):
        self.calls.append((url, headers))
        return self.responses.pop(0)


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

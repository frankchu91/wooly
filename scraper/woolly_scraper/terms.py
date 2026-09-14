"""Fetch and parse bank offer pages for conditions (spec §3.2).

`TermsFetcher` is a separate, per-host-polite fetcher from `fetch.Fetcher` (which is
DoC-specific and single-host): bank offer pages live on ~two dozen different hosts, so
the crawl delay is tracked per host rather than globally, and there is no cross-process
".last_request" file since a 5s-per-host delay does not need to survive one process.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from .conditions import extract_conditions
from .models import Condition

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)
DEFAULT_DELAY = 5.0
TIMEOUT = 20
_STRIP_TAGS = ("script", "style", "noscript", "nav", "footer", "header")


class TermsFetcher:
    def __init__(
        self,
        cache_dir: Path,
        delay: float = DEFAULT_DELAY,
        session=None,
        sleep=time.sleep,
        clock=time.time,
    ):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.session = session or requests.Session()
        self.sleep = sleep
        self.clock = clock
        self._last_request: dict[str, float] = {}

    def _path(self, url: str) -> Path:
        return self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".html")

    def has_cached(self, url: str) -> bool:
        return self._path(url).exists()

    def get(self, url: str) -> tuple[str, str]:
        """Fetch `url`, returning `(status, html)` with `status` in `ok|blocked|error`.

        A cache hit short-circuits everything below — no network call, no sleep, no
        per-host bookkeeping — and returns `("ok", cached_html)`. Some `offer_url`s are
        tracking redirects; `requests` follows them by default, and the response is
        cached under the *original* url so a repeat run still hits the cache.
        """
        p = self._path(url)
        if p.exists():
            return "ok", p.read_text(encoding="utf-8")
        host = urlparse(url).netloc
        last = self._last_request.get(host)
        if last is not None and self.delay > 0:
            remaining = self.delay - (self.clock() - last)
            if remaining > 0:
                self.sleep(remaining)
        try:
            resp = self.session.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        except requests.exceptions.RequestException:
            self._last_request[host] = self.clock()
            return "error", ""
        self._last_request[host] = self.clock()
        if resp.status_code in (403, 429):
            return "blocked", ""
        if not (200 <= resp.status_code < 300):
            return "error", ""
        p.write_text(resp.text, encoding="utf-8")
        return "ok", resp.text


def parse_terms_page(html: str) -> list[Condition]:
    """Extract bank-sourced conditions from a fetched offer page's visible text."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(_STRIP_TAGS):
        tag.decompose()
    text = " ".join(soup.get_text(" ").split())
    return extract_conditions(text, "bank", cap=12)

from __future__ import annotations

import hashlib
import time
from pathlib import Path

import requests

USER_AGENT = "woolly-scraper/0.1 (+https://github.com/haobing/lu_sheep_hair)"
DEFAULT_DELAY = 600.0


class BlockedError(RuntimeError):
    pass


class Fetcher:
    def __init__(self, cache_dir: Path, delay: float = DEFAULT_DELAY, session=None, sleep=time.sleep):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.session = session or requests.Session()
        self.sleep = sleep
        self._requests_made = 0

    def _path(self, url: str) -> Path:
        return self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".html")

    def get(self, url: str, *, use_cache: bool = True) -> str:
        p = self._path(url)
        if use_cache and p.exists():
            return p.read_text(encoding="utf-8")
        if self._requests_made > 0 and self.delay > 0:
            self.sleep(self.delay)
        resp = self.session.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        self._requests_made += 1
        if resp.status_code in (403, 429):
            raise BlockedError(f"{resp.status_code} from {url}; stopping to stay polite")
        if hasattr(resp, "raise_for_status"):
            resp.raise_for_status()
        p.write_text(resp.text, encoding="utf-8")
        return resp.text

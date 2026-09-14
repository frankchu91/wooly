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
        self._requests_made = 0

    def _path(self, url: str) -> Path:
        return self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".html")

    def has_cached(self, url: str) -> bool:
        return self._path(url).exists()

    def _last_request_path(self) -> Path:
        return self.cache_dir / ".last_request"

    def _read_last_request(self) -> float | None:
        try:
            return float(self._last_request_path().read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            return None

    def _write_last_request(self) -> None:
        self._last_request_path().write_text(str(self.clock()), encoding="utf-8")

    def get(self, url: str, *, use_cache: bool = True) -> str:
        p = self._path(url)
        if use_cache and p.exists():
            return p.read_text(encoding="utf-8")
        if self._requests_made > 0 and self.delay > 0:
            # This process has already made a request; keep spacing them out.
            self.sleep(self.delay)
        elif self.delay > 0:
            # First network request in this process: another process sharing the
            # same cache dir may have made one recently, so honour that too.
            last = self._read_last_request()
            if last is not None:
                remaining = self.delay - (self.clock() - last)
                if remaining > 0:
                    self.sleep(remaining)
        try:
            resp = self.session.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        finally:
            # Even a request that raises (timeout, connection error) counted against
            # the crawl delay budget, so both bookkeeping steps happen unconditionally.
            self._requests_made += 1
            self._write_last_request()
        if resp.status_code in (403, 429):
            raise BlockedError(f"{resp.status_code} from {url}; stopping to stay polite")
        resp.raise_for_status()
        p.write_text(resp.text, encoding="utf-8")
        return resp.text

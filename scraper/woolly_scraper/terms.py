"""Fetch and parse bank offer pages for conditions (spec §3.2).

`TermsFetcher` is a separate, per-host-polite fetcher from `fetch.Fetcher` (which is
DoC-specific and single-host): bank offer pages live on ~two dozen different hosts, so
the crawl delay is tracked per host rather than globally, and there is no cross-process
".last_request" file since a 5s-per-host delay does not need to survive one process.
"""

from __future__ import annotations

import hashlib
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from .conditions import classify_sentence, split_sentences
from .models import Condition

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)
DEFAULT_DELAY = 5.0
TIMEOUT = 20
CAP = 12
_STRIP_TAGS = ("script", "style", "noscript", "nav", "footer", "header", "title")

# Sentences that survive `extract_conditions`'s generic 40-400 char window but are
# clearly page furniture, not requirement text, on a *bank* page specifically (this
# filter is bank-only — the `doc` extraction path in `post_page.py` is untouched).
# Review round 1 found these in the wild: nav breadcrumbs joined by "|", UI chrome
# ("Select an offer", "Learn more", "Give feedback", "Site map", "AdChoices",
# accessibility-toggle links), pricing-table fragments with more than a few "$"
# figures crammed together, and all-caps/mixed-case navigation labels (high
# uppercase-letter ratio).
_REJECT_SUBSTRINGS = (
    "select an offer",
    "learn more",
    "give feedback",
    "site map",
    "adchoices",
    "change to accessible version",
    "skip to content",
)
_DOLLAR_RE = re.compile(r"\$")
_MAX_DOLLAR_FIGURES = 3
_MAX_UPPER_RATIO = 0.3

# A6: a banner headline shouted in caps ("BANK OF AMERICA ADVANTAGE BANKING New checking
# customers …") runs on into ordinary sentence case, so the whole-sentence uppercase
# ratio above never catches it. Look at the opening words instead.
_LEADING_WINDOW = 40
_MIN_CAPS_RUN = 3
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’]*")
_ALL_CAPS_WORD_RE = re.compile(r"[A-Z]{3,}$")

# A5: a bank sentence with no figure attached is only a requirement if it reads like an
# instruction; anything else on those pages is prose about the product. Shared, verbatim,
# with the web's `splitConditions` so the two agree on what "actionable" means.
_REQUIREMENT_VERB_RE = re.compile(
    r"^(?:Set up|Receive|Make|Maintain|Complete|Keep|Deposit|Open|Only new|Must|You must)\b"
)


def _has_leading_caps_run(sentence: str) -> bool:
    """True when the sentence opens with a run of >= 3 all-caps words of >= 3 letters."""
    run = 0
    for word in _WORD_RE.findall(sentence[:_LEADING_WINDOW]):
        run = run + 1 if _ALL_CAPS_WORD_RE.match(word) else 0
        if run >= _MIN_CAPS_RUN:
            return True
    return False


def _is_bank_noise(sentence: str) -> bool:
    if "|" in sentence:
        return True
    low = sentence.lower()
    if any(s in low for s in _REJECT_SUBSTRINGS):
        return True
    if len(_DOLLAR_RE.findall(sentence)) > _MAX_DOLLAR_FIGURES:
        return True
    if _has_leading_caps_run(sentence):
        return True
    letters = [ch for ch in sentence if ch.isalpha()]
    return bool(letters) and sum(1 for ch in letters if ch.isupper()) / len(letters) > _MAX_UPPER_RATIO


def is_actionable(condition: Condition) -> bool:
    """A5: keep a bank condition only if it carries a figure or reads as an instruction."""
    if condition.amount is not None or condition.days is not None or condition.count is not None:
        return True
    return bool(_REQUIREMENT_VERB_RE.match(condition.text))


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
        # origin host -> final (post-redirect) host, learned the first time that
        # origin host is actually fetched; used so a shared tracking/CDN host that
        # several different bank origins redirect to gets throttled too, not just
        # each origin host in isolation.
        self._redirects: dict[str, str] = {}

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
        wait_hosts = [host]
        dest_host = self._redirects.get(host)
        if dest_host and dest_host != host:
            wait_hosts.append(dest_host)
        if self.delay > 0:
            remaining = 0.0
            for h in wait_hosts:
                last = self._last_request.get(h)
                if last is not None:
                    r = self.delay - (self.clock() - last)
                    remaining = max(remaining, r)
            if remaining > 0:
                self.sleep(remaining)
        try:
            resp = self.session.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        except requests.exceptions.RequestException:
            self._last_request[host] = self.clock()
            return "error", ""
        now = self.clock()
        self._last_request[host] = now
        final_host = urlparse(getattr(resp, "url", None) or url).netloc or host
        if final_host != host:
            # This origin host redirects elsewhere; remember it so a later fetch of a
            # different url under the same origin also respects the destination's
            # cooldown, not just the origin's.
            self._redirects[host] = final_host
            self._last_request[final_host] = now
        if resp.status_code in (403, 429):
            return "blocked", ""
        if not (200 <= resp.status_code < 300):
            return "error", ""
        p.write_text(resp.text, encoding="utf-8")
        return "ok", resp.text


def parse_terms_page(html: str) -> list[Condition]:
    """Extract bank-sourced conditions from a fetched offer page's visible text.

    This duplicates `conditions.extract_conditions`'s split/classify/dedupe/cap loop
    rather than calling it, so `_is_bank_noise` can reject page-furniture sentences
    (nav breadcrumbs, UI chrome, pricing-table fragments, caps-run banner headlines)
    before classification, and `is_actionable` can drop everything that classified but
    names no figure and issues no instruction — both bank-only; the `doc` extraction path
    in `post_page.py` still calls `extract_conditions` directly and is unaffected.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(_STRIP_TAGS):
        tag.decompose()
    text = " ".join(soup.get_text(" ").split())
    out: list[Condition] = []
    seen: set[str] = set()
    for sentence in split_sentences(text):
        if _is_bank_noise(sentence):
            continue
        c = classify_sentence(sentence, "bank")
        if c is None or not is_actionable(c) or c.id in seen:
            continue
        seen.add(c.id)
        out.append(c)
        if len(out) >= CAP:
            break
    return out

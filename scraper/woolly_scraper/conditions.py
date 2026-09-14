"""Sentence classifier for Doctor of Credit / bank offer requirement text.

`classify_sentence` maps one sentence to a `Condition` using the ordered pattern
table from spec §3.2 (first match wins). A sentence that matches none of the
kind patterns is not a requirement sentence and yields `None` — we never fall
back to a generic "other" kind here; "other" is reserved for structured,
already-known-to-be-a-requirement text (e.g. the DoC glance block's
"Additional requirements" field), which is built directly by the caller.
"""

from __future__ import annotations

import re

from .models import Condition
from .text import parse_money

WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "twelve": 12}

_MIN_LEN = 40
_MAX_LEN = 400

_DAYS_RE = re.compile(
    r"\b(?:within|for)\s+(\d+|one|two|three|four|five|six|twelve)\s+(?:calendar\s+)?(day|month)s?\b",
    re.IGNORECASE,
)
_COUNT_RE = re.compile(
    r"(\d+)\s+(?:\w+\s+){0,2}(direct deposits|deposits|transactions)",
    re.IGNORECASE,
)

# Ordered (kind, matcher) pairs — first match wins, per spec §3.2.
_KIND_CHECKS: list[tuple[str, re.Pattern[str] | None]] = [
    ("direct_deposit", re.compile(r"direct deposit", re.IGNORECASE)),
    ("deposit", None),  # special-cased below: deposit/fund word + a "$" figure
    ("balance", re.compile(r"balance|maintain", re.IGNORECASE)),
    ("transactions", re.compile(r"transaction|purchase|debit card", re.IGNORECASE)),
    (
        "keep_open",
        re.compile(r"(?:keep|kept|remain\w*).{0,40}\bopen\b|must be (?:kept )?open|maintained for", re.IGNORECASE),
    ),
    ("fee", re.compile(r"fee|closure|closing", re.IGNORECASE)),
    ("new_customer", re.compile(r"new\s+(?:\w+\s+){0,2}customers?|not\s+(?:had|held)|previous", re.IGNORECASE)),
]

_DEPOSIT_WORD_RE = re.compile(r"\b(deposits?|funds?)\b", re.IGNORECASE)

_SENTENCE_END_RE = re.compile(r"(?<=[.;!])\s+")
_LINE_SPLIT_RE = re.compile(r"[\r\n]+")
_BULLET_PREFIX_RE = re.compile(r"^\s*(?:[•▪●‣*-]|\d+[.)])\s+")


def _parse_days(text: str) -> int | None:
    m = _DAYS_RE.search(text)
    if not m:
        return None
    raw = m.group(1).lower()
    n = int(raw) if raw.isdigit() else WORD_NUM[raw]
    return n * 30 if m.group(2).lower().startswith("month") else n


def _parse_count(text: str) -> int | None:
    m = _COUNT_RE.search(text)
    return int(m.group(1)) if m else None


def _kind_for(text: str) -> str | None:
    for kind, pattern in _KIND_CHECKS:
        if kind == "deposit":
            if _DEPOSIT_WORD_RE.search(text) and "$" in text:
                return kind
            continue
        if pattern.search(text):
            return kind
    return None


def classify_sentence(text: str, source: str) -> Condition | None:
    """Classify one sentence into a `Condition`, or `None` if it names no requirement."""
    if not text:
        return None
    kind = _kind_for(text)
    if kind is None:
        return None
    return Condition(
        kind=kind,
        text=text,
        amount=parse_money(text),
        days=_parse_days(text),
        count=_parse_count(text),
        source=source,
    )


def split_sentences(text: str | None) -> list[str]:
    """Split text into candidate sentences, dropping fragments outside 40-400 chars.

    Splits on `.`/`;`/`!` followed by whitespace, and on newline/bullet boundaries
    (a leading bullet marker or numbered-list prefix on a line is stripped).
    """
    if not text:
        return []
    out: list[str] = []
    for line in _LINE_SPLIT_RE.split(text):
        line = _BULLET_PREFIX_RE.sub("", line)
        for piece in _SENTENCE_END_RE.split(line):
            piece = piece.strip()
            if _MIN_LEN <= len(piece) <= _MAX_LEN:
                out.append(piece)
    return out


def dedupe_conditions(conditions: list[Condition]) -> list[Condition]:
    """Drop later duplicates by id, preserving first-seen order."""
    out: list[Condition] = []
    seen: set[str] = set()
    for c in conditions:
        if c.id in seen:
            continue
        seen.add(c.id)
        out.append(c)
    return out


def extract_conditions(text: str | None, source: str, cap: int = 12) -> list[Condition]:
    """Classify every sentence in `text`, dedupe by id, and cap the result."""
    out: list[Condition] = []
    seen: set[str] = set()
    for sentence in split_sentences(text):
        c = classify_sentence(sentence, source)
        if c is None or c.id in seen:
            continue
        seen.add(c.id)
        out.append(c)
        if len(out) >= cap:
            break
    return out

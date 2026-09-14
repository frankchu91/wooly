"""Sentence classifier for Doctor of Credit / bank offer requirement text.

`classify_sentence` maps one sentence to a `Condition` using the ordered pattern
table from spec §3.2 (first match wins). A sentence that matches none of the
kind patterns is not a requirement sentence and yields `None` — we never fall
back to a generic "other" kind here; "other" is reserved for structured,
already-known-to-be-a-requirement text (e.g. the DoC glance block's
"Additional requirements" field), which is built directly by the caller.

Amendments to spec §3.2's literal patterns, made during review against the real
Wells Fargo fixture (round 1 of review):

1. Negation/exclusion gate: a sentence that negates or excludes something (e.g.
   "does not count toward the bonus", "not eligible", boilerplate like "cannot
   be reproduced, purchased, sold, transferred" or "zero balance without prior
   notice") never becomes a condition, even if it also contains a kind keyword —
   checked before the kind patterns, so it wins regardless of what would
   otherwise match.
2. `direct_deposit`/`deposit` amount selection skips any `$` figure immediately
   followed by "bonus/cash/reward/offer" (that names the reward, not the
   requirement) and takes the first remaining `$` figure; other kinds keep the
   plain "first `$` figure in the sentence" rule.
3. `new_customer`'s bare `previous` token is replaced with context-bound
   alternatives (`new (consumer|checking|business|personal|savings )*customers?`,
   `not (had|held|have|opened)`, `previous(ly)? (had|held|received|opened|closed)`)
   so a merely temporal "previously" (e.g. "this rate was previously higher")
   doesn't misfire.
4. `transactions` requires a requirement verb near the keyword (make/complete/
   perform/at least/minimum of, or "N (qualifying) transactions/purchases");
   `balance` requires an explicit maintain/minimum/average/daily qualifier or
   "balance of $" — a bare "balance" or "purchase" elsewhere in a sentence (e.g.
   marketing/boilerplate) no longer classifies it.
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

# Sentences that negate or exclude something never become a condition, even if
# they also contain a kind keyword — checked before the kind patterns.
_NEGATION_RE = re.compile(
    r"\b(?:does not|do not|doesn't|don't|will not|won't|cannot|can't)\s+(?:count|qualify|be)\b"
    r"|\bnot eligible\b"
    r"|\bexcluded\b"
    r"|reproduced,?\s*purchased,?\s*sold,?\s*transferred"
    r"|zero balance without prior notice",
    re.IGNORECASE,
)

# Ordered (kind, matcher) pairs — first match wins, per spec §3.2.
_KIND_CHECKS: list[tuple[str, re.Pattern[str] | None]] = [
    ("direct_deposit", re.compile(r"direct deposit", re.IGNORECASE)),
    ("deposit", None),  # special-cased below: deposit/fund word + a "$" figure
    (
        "balance",
        re.compile(r"(?:maintain|minimum|average|daily)\s+[^.]{0,30}balance|balance of \$", re.IGNORECASE),
    ),
    (
        "transactions",
        re.compile(
            r"\b(?:make|complete|perform|at least|minimum of)\b[^.]{0,40}\b(?:transactions?|purchases?|debit card)\b"
            r"|\d+\s+(?:qualifying\s+)?(?:transactions|purchases)",
            re.IGNORECASE,
        ),
    ),
    (
        "keep_open",
        re.compile(r"(?:keep|kept|remain\w*).{0,40}\bopen\b|must be (?:kept )?open|maintained for", re.IGNORECASE),
    ),
    ("fee", re.compile(r"fee|closure|closing", re.IGNORECASE)),
    (
        "new_customer",
        re.compile(
            r"new (?:consumer |checking |business |personal |savings )*customers?"
            r"|\bnot (?:had|held|have|opened)\b"
            r"|previous(?:ly)? (?:had|held|received|opened|closed)",
            re.IGNORECASE,
        ),
    ),
]

_DEPOSIT_WORD_RE = re.compile(r"\b(deposits?|funds?)\b", re.IGNORECASE)

# amount for direct_deposit/deposit: first "$" figure NOT immediately naming the reward.
_AMOUNT_RE = re.compile(r"\$\s?([\d,]+)")
_REWARD_WORD_RE = re.compile(r"\s*(?:bonus|cash|reward|offer)\b", re.IGNORECASE)

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


def _parse_amount(text: str, kind: str) -> int | None:
    if kind not in ("direct_deposit", "deposit"):
        return parse_money(text)
    for m in _AMOUNT_RE.finditer(text):
        if _REWARD_WORD_RE.match(text, m.end()):
            continue  # "$500 bonus" names the reward, not the requirement
        return int(m.group(1).replace(",", ""))
    return None


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
    if _NEGATION_RE.search(text):
        return None
    kind = _kind_for(text)
    if kind is None:
        return None
    return Condition(
        kind=kind,
        text=text,
        amount=_parse_amount(text, kind),
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

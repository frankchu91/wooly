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

Round 2 (controller UX walkthrough) added, in the order they run:

A1/A2. Every sentence is normalised first: `"$ 500"` → `"$500"` (so the
   reward-figure skip and the amount parse both see one token), and leading list
   markers (`*`, `**`, `2 `, `•`, `-`, `–`) are stripped, since the bank pages
   flatten numbered steps into the sentence stream ("2 Deposit Make $1,000 …").
A7. A "you lose the bonus if you close early" sentence becomes a `keep_open`
   condition with its day count instead of being thrown away — it is a real
   requirement phrased as a threat, so it is checked *before* the negation gate.
A3. Pointer/informational sentences ("Learn how to…", "Talk with a banker…",
   "…are separate from…") name no requirement and yield None.
A4. A fee-waiver sentence ("the monthly service fee can be avoided with a $1,500
   minimum daily balance") is a `fee`, not a `balance`/`deposit` requirement — the
   waiver route is not something the bonus asks of you. Its `amount` is the fee
   itself when the sentence states one, never the waiver threshold.
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

# A1: bank pages often render a money figure as two tokens ("$ 500"); collapse the gap
# before anything reads the sentence. A2: leading list markers survive the flattening of
# a bank page's numbered steps into running text ("2 Deposit Make …", "** The …").
_MONEY_SPACE_RE = re.compile(r"\$\s+(\d)")
_LEADING_MARKER_RE = re.compile(r"^(?:\*+|\d+\s+(?=[A-Z])|[•\-–]\s*)")

# A3: sentences that point at something else (a banker, a disclosure, another page) or
# merely describe what the bank does — never a requirement the user can act on.
_POINTER_START_RE = re.compile(
    r"^(?:Learn how|Talk with|See the|Visit|Call|Ask|Contact|For (?:more|complete))\b",
    re.IGNORECASE,
)
_POINTER_CONTAINS_RE = re.compile(
    r"for complete (?:checking )?account details"
    r"|Fee and Information Schedule"
    r"|Deposit Account Agreement"
    r"|will be automatically"
    r"|on the last business day"
    r"|are separate from",
    re.IGNORECASE,
)

# A4: a fee-waiver sentence is about avoiding the monthly fee, not about a bonus
# requirement — it is a `fee` note whatever balance/deposit words it happens to contain.
_FEE_WAIVER_RE = re.compile(r"\b(?:avoid\w*|waiv\w*)\b", re.IGNORECASE)
_FEE_WORD_RE = re.compile(r"\bfees?\b", re.IGNORECASE)
_FEE_AMOUNT_RE = re.compile(
    r"\$\s?([\d,]+)\s+(?:monthly\s+)?(?:service|maintenance)\s+fee", re.IGNORECASE
)

# A7: "the bonus will not be paid if the account is closed within 90 days" is a
# keep-open requirement, not boilerplate — matched before the negation gate below.
_CLOSE_WINDOW_RE = re.compile(
    r"(?:closed?|closure)\b[^.]{0,40}\b(?:within|before|in the first)\s+(\d+)\s+days",
    re.IGNORECASE,
)
_FORFEIT_RE = re.compile(
    r"not be paid|will not receive|\bforfeit\w*\b|\blose\b",
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


def normalize_sentence(text: str) -> str:
    """A1 + A2: collapse `"$ 500"` to `"$500"` and strip any leading list marker.

    The marker strip repeats, because a bank page can stack them ("** 2 Deposit …").
    """
    text = _MONEY_SPACE_RE.sub(r"$\1", text).strip()
    for _ in range(3):
        stripped = _LEADING_MARKER_RE.sub("", text).lstrip()
        if stripped == text:
            break
        text = stripped
    return text


def _is_pointer(text: str) -> bool:
    """A3: the sentence points elsewhere or narrates the bank's own bookkeeping."""
    return bool(_POINTER_START_RE.search(text) or _POINTER_CONTAINS_RE.search(text))


def _is_fee_waiver(text: str) -> bool:
    """A4: the sentence is about avoiding/waiving a fee."""
    return bool(_FEE_WAIVER_RE.search(text) and _FEE_WORD_RE.search(text))


def _fee_amount(text: str) -> int | None:
    """The stated monthly/service/maintenance fee, never the waiver threshold."""
    m = _FEE_AMOUNT_RE.search(text)
    return int(m.group(1).replace(",", "")) if m else None


def _negated_keep_open_days(text: str) -> int | None:
    """A7: days from a "bonus is forfeited if closed within N days" sentence."""
    m = _CLOSE_WINDOW_RE.search(text)
    if not m or not _FORFEIT_RE.search(text):
        return None
    return int(m.group(1))


def _kind_for(text: str) -> str | None:
    if _is_fee_waiver(text):
        return "fee"
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
    text = normalize_sentence(text)
    if not text:
        return None
    days = _negated_keep_open_days(text)
    if days is not None:
        # A7, ahead of the negation gate: "…will not be paid if closed within 90 days"
        # is a keep-open requirement wearing a negation's clothes.
        return Condition(kind="keep_open", text=text, days=days, source=source)
    if _is_pointer(text):
        return None
    if _NEGATION_RE.search(text):
        return None
    kind = _kind_for(text)
    if kind is None:
        return None
    amount = _fee_amount(text) if _is_fee_waiver(text) else _parse_amount(text, kind)
    return Condition(
        kind=kind,
        text=text,
        amount=amount,
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

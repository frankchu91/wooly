from __future__ import annotations

import re
from datetime import date

from dateutil import parser as dateparser

US_STATES: frozenset[str] = frozenset(
    [
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
        "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
        "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
        "VT", "VA", "WA", "WV", "WI", "WY",
    ]
)

_MONEY = re.compile(r"\$\s?([\d,]+)")
_ORDINAL = re.compile(r"(\d+)(st|nd|rd|th)\b")
_DATE_TOKEN = re.compile(
    r"((?:January|February|March|April|May|June|July|August|September|October|November|December)"
    r"\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}/\d{1,2}/\d{2,4})"
)

BANK_ALIASES = {
    "U.S. Bank": "US Bank",
    "BMO Harris": "BMO",
    "SoFi Checking & Savings": "SoFi",
    "Bank of America": "Bank of America",
    "e*Trade": "E*TRADE",
}


def parse_money(s: str | None) -> int | None:
    if not s:
        return None
    m = _MONEY.search(s)
    if not m:
        return None
    return int(m.group(1).replace(",", ""))


def parse_money_range(s: str) -> tuple[int | None, int | None]:
    nums = [int(n.replace(",", "")) for n in _MONEY.findall(s)]
    if not nums:
        return (None, None)
    # "($900 With Savings)" is a combo figure; ignore anything in parentheses for the range
    base = re.sub(r"\([^)]*\)", "", s)
    base_nums = [int(n.replace(",", "")) for n in _MONEY.findall(base)] or nums
    return (min(base_nums), max(base_nums))


_STATE_AFTER_DELIMITER = re.compile(r"(?:[–\-:,\[&+/]|\b(?:or|and)\b)\s*([A-Z]{2})\b")
# The head of a list: a bare code that a comma/plus/ampersand/"and" then joins to a
# second code ("Keybank $1,000 AK, CO, …", "North Shore Bank … WI + IL"). Nothing
# precedes the first state in titles like these, so the delimiter rule alone drops it.
_STATE_HEADING_LIST = re.compile(r"(?<![A-Za-z])([A-Z]{2})(?=\s*(?:,|\+|&|\band\b)\s*[A-Z]{2}\b)")


def extract_states(s: str) -> list[str]:
    """Return USPS codes that appear as a comma/dash separated list of 2-letter tokens.

    Each occurrence must itself sit in list context: preceded by a list-ish delimiter
    (" – ", " - ", ":", "[", ",", "&", "/", or the words "or"/"and"), or standing at the
    head of such a list with another code right after it. A code that also appears
    elsewhere in the string outside that context (e.g. as part of a bank name) is not
    matched by that other occurrence.
    """
    if re.search(r"\bnationwide\b", s, re.IGNORECASE):
        return []
    found: list[tuple[int, str]] = []
    for pattern in (_STATE_AFTER_DELIMITER, _STATE_HEADING_LIST):
        for m in pattern.finditer(s):
            code = m.group(1)
            if code in US_STATES:
                found.append((m.start(1), code))
    out: list[str] = []
    for _, code in sorted(found):
        if code not in out:
            out.append(code)
    return out


def normalize_bank(title: str) -> str:
    name = title
    name = re.sub(r"\([^)]*\)", "", name)  # drop parentheticals like "(Fintech)"
    # Checking/Savings only counts as a cut point when it reads as the start of the
    # offer description (followed by Bonus/Account/Signup/&//$), not when it's part of
    # the bank's own name (e.g. "Union Savings Bank").
    cut = re.search(
        r"\s+(\$|Up To\b|\d[\d,]*\s+Miles|–|-\s|Signup\b|"
        r"(?:Checking|Savings)\b(?=\s*(?:Bonus\b|Account\b|Signup\b|&|/|\$)))",
        name,
    )
    if cut:
        name = name[: cut.start()]
    name = name.strip(" –-,:;")
    for src, dst in BANK_ALIASES.items():
        if name.lower().startswith(src.lower()):
            return dst
    return name


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    m = _DATE_TOKEN.search(s)
    if not m:
        return None
    token = _ORDINAL.sub(r"\1", m.group(1))
    try:
        return dateparser.parse(token, dayfirst=False).date()
    except (ValueError, OverflowError):
        return None

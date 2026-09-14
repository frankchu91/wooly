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


def extract_states(s: str) -> list[str]:
    """Return USPS codes that appear as a comma/dash separated list of 2-letter tokens.

    Each occurrence must itself be preceded by a list-ish delimiter (" – ", " - ", ":",
    "[" or ","); a code that also appears elsewhere in the string outside that context
    (e.g. as part of a bank name) is not matched by that other occurrence.
    """
    if re.search(r"\bnationwide\b", s, re.IGNORECASE):
        return []
    out: list[str] = []
    for m in re.finditer(r"[–\-:,\[]\s*([A-Z]{2})\b", s):
        code = m.group(1)
        if code in US_STATES and code not in out:
            out.append(code)
    return out


def normalize_bank(title: str) -> str:
    name = title
    name = re.sub(r"\([^)]*\)", "", name)  # drop parentheticals like "(Fintech)"
    cut = re.search(r"\s+(\$|Up To\b|Checking\b|Savings\b|Signup\b|\d[\d,]*\s+Miles|–|-\s)", name)
    if cut:
        name = name[: cut.start()]
    name = name.strip(" –-,")
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

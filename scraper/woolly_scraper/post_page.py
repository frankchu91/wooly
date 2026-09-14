from __future__ import annotations

import json
import re
from datetime import date

from bs4 import BeautifulSoup

from .models import PostData
from .text import extract_states, parse_date, parse_money

WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "twelve": 12}


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _months_to_days(text: str) -> int | None:
    m = re.search(r"(\d+|one|two|three|four|five|six|twelve)\s+(month|day)s?", text, re.IGNORECASE)
    if not m:
        return None
    n = int(m.group(1)) if m.group(1).isdigit() else WORD_NUM[m.group(1).lower()]
    return n * 30 if m.group(2).lower().startswith("month") else n


def _glance(soup: BeautifulSoup) -> dict[str, str]:
    """Collect "Offer at a glance" label/value pairs from <li><strong>Label: </strong>value</li>.

    Struck-through (<del>) content is removed before extracting the value, so stale
    numbers superseded by later edits never surface. The first occurrence of a label
    wins, since the glance block always appears before any incidental reuse of the
    same wording later in the post.
    """
    out: dict[str, str] = {}
    for strong in soup.select("div.entry-content ul li strong"):
        label_raw = _clean(strong.get_text())
        label = label_raw.rstrip(":").lower()
        if not label:
            continue
        li = strong.parent
        for d in li.find_all("del"):
            d.decompose()
        value = _clean(li.get_text(" ")).replace(label_raw, "", 1).strip(" :")
        if label in out:
            continue
        out[label] = value
    return out


def _fine_print(soup: BeautifulSoup) -> str:
    content = soup.select_one("div.entry-content")
    if not content:
        return ""
    for d in content.find_all("del"):
        d.decompose()
    return _clean(content.get_text(" "))


def _modified(soup: BeautifulSoup) -> date | None:
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(s.string or "")
        except json.JSONDecodeError:
            continue
        stack = [data]
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                if "dateModified" in cur:
                    return date.fromisoformat(str(cur["dateModified"])[:10])
                stack.extend(cur.values())
            elif isinstance(cur, list):
                stack.extend(cur)
    return None


def _pull(text: str) -> str | None:
    low = text.lower()
    if not low:
        return None
    if "unknown" in low or "mixed" in low:
        return "unknown"
    has_soft = "soft" in low
    has_hard = "hard" in low
    if has_soft and not has_hard:
        return "soft"
    if has_hard and not has_soft:
        return "hard"
    return None


def parse_post(html: str, today: date) -> PostData:
    soup = BeautifulSoup(html, "html.parser")
    p = PostData(post_modified=_modified(soup))
    g = _glance(soup)
    if not g:
        return p

    p.bonus_max = parse_money(g.get("maximum bonus amount"))

    av = g.get("availability")
    if av:
        p.availability_text = av
        p.nationwide = bool(re.search(r"\bnationwide\b", av, re.IGNORECASE))
        p.states = extract_states(av)

    dd = g.get("direct deposit required")
    if dd:
        low = dd.lower()
        if low.startswith("no") or "not required" in low:
            p.dd_required = False
        else:
            p.dd_required = True
            p.dd_amount = parse_money(dd)

    p.additional_requirements = g.get("additional requirements")
    p.pull = _pull(g.get("hard/soft pull") or "")
    p.chexsystems = g.get("chexsystems")
    p.cc_funding = g.get("credit card funding")

    fee = g.get("monthly fees")
    if fee:
        p.monthly_fee_amount = parse_money(fee)
        p.monthly_fee_avoidable = "avoidable" in fee.lower() and "unavoidable" not in fee.lower()

    etf = g.get("early account termination fee")
    if etf:
        p.etf_amount = parse_money(etf)
        p.etf_days = _months_to_days(etf)

    p.household_limit = g.get("household limit")

    exp = parse_date(g.get("expiration date"))
    body = _fine_print(soup)
    # "Update M/D/YY: ... valid until/extended till M/D/YY" lines can restate the
    # expiration more recently than the glance block; only the latest one matters.
    for m in re.finditer(r"(?:valid until|extended till|extended until|expires?)\s+([^.;]+)", body, re.IGNORECASE):
        d = parse_date(m.group(1))
        if d and (exp is None or d > exp):
            exp = d
    p.expiration = exp if exp and exp >= today else None

    m = re.search(r"within\s+(\d+)\s+(?:calendar\s+)?days", body, re.IGNORECASE)
    if m:
        p.dd_deadline_days = int(m.group(1))

    m = re.search(r"(?:past|within|last|previous)\s+(\d+)\s+months", body, re.IGNORECASE)
    if m:
        p.anti_churn_months = int(m.group(1))

    return p

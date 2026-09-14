from __future__ import annotations

import json
import re
from datetime import date

from bs4 import BeautifulSoup

from .conditions import dedupe_conditions, extract_conditions
from .models import Condition, PostData
from .text import extract_states, parse_date, parse_money

WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "twelve": 12}
_NONE_VALUE = re.compile(r"none[.,]?\s*")
# X3: DoC's "Additional requirements" field says "See below" (or a variant) when the real
# requirements are in the post body rather than in the glance block. That is a pointer, not
# a requirement — carried through as a condition it becomes a checklist item reading
# "See below", which asks the user to do nothing at all.
_REQ_NONE_VALUE = re.compile(
    r"none[.,]?|see below\.?|yes,?\s*see\s+(?:options\s+)?below\.?|n/a",
    re.IGNORECASE,
)


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
        value = re.sub(r"\s+([,.;)])", r"\1", value)
        value = re.sub(r"\(\s+", "(", value)
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


def _section_text(soup: BeautifulSoup, heading: str) -> str:
    """Text of the section starting at a heading matching `heading`, up to the next h1/h2/h3.

    Falls back to the whole body (`_fine_print`) when no heading matches, so a post
    whose layout lacks the expected section still gets scanned rather than skipped.
    """
    content = soup.select_one("div.entry-content")
    if not content:
        return ""
    target = None
    for tag in content.find_all(["h1", "h2", "h3"]):
        if _clean(tag.get_text()).lower() == heading.lower():
            target = tag
            break
    if target is None:
        return _fine_print(soup)
    parts: list[str] = []
    for sib in target.find_next_siblings():
        if sib.name in ("h1", "h2", "h3"):
            break
        parts.append(sib.get_text(" "))
    return _clean(" ".join(parts))


def _structured_conditions(p: PostData) -> list[Condition]:
    """Glance-derived structured conditions: dd, ETF line, additional requirements."""
    out: list[Condition] = []
    if p.dd_required:
        if p.dd_amount is not None:
            out.append(
                Condition(
                    kind="direct_deposit",
                    text=f"Direct deposit of ${p.dd_amount}",
                    amount=p.dd_amount,
                    days=p.dd_deadline_days,
                    source="doc",
                )
            )
        else:
            out.append(
                Condition(
                    kind="direct_deposit",
                    text="Direct deposit required — amount not listed",
                    source="doc",
                )
            )
    if p.etf_days is not None:
        out.append(
            Condition(
                kind="keep_open",
                text=f"Account must be kept open for {p.etf_days} days",
                days=p.etf_days,
                source="doc",
            )
        )
    if p.etf_amount is not None and p.etf_amount > 0:
        out.append(
            Condition(
                kind="fee",
                text=f"${p.etf_amount} early account termination fee",
                amount=p.etf_amount,
                source="doc",
            )
        )
    req = p.additional_requirements
    if req and not _REQ_NONE_VALUE.fullmatch(req.strip()):
        out.append(Condition(kind="other", text=req, source="doc"))
    return out


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
                    try:
                        return date.fromisoformat(str(cur["dateModified"])[:10])
                    except ValueError:
                        return None
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
        if _NONE_VALUE.fullmatch(fee.strip().lower()):
            # A literal "None" is a value ($0, avoidable), not a guess we couldn't make.
            p.monthly_fee_amount = 0
            p.monthly_fee_avoidable = True
        else:
            p.monthly_fee_amount = parse_money(fee)
            p.monthly_fee_avoidable = "avoidable" in fee.lower() and "unavoidable" not in fee.lower()

    etf = g.get("early account termination fee")
    if etf:
        if _NONE_VALUE.fullmatch(etf.strip().lower()):
            p.etf_amount = 0
        else:
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

    fine_print = _section_text(soup, "The Fine Print")
    p.conditions = dedupe_conditions(_structured_conditions(p) + extract_conditions(fine_print, "doc"))

    return p

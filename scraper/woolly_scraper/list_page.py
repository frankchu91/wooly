from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from .models import ListEntry
from .text import extract_states, parse_money, parse_money_range

SECTION_MAP = {
    "best checking account bonuses": "checking",
    "best saving account bonuses": "savings",
    "best savings account bonuses": "savings",
    "best business bank bonuses": "business",
    "best state specific bonuses": "state",
    "highly region specific/branch specific": "regional",
}


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _classify_chips(texts: list[str]) -> tuple[str, str | None, bool | None, int | None]:
    pull = "unknown"
    cc: str | None = None
    dd_required: bool | None = None
    dd_amount: int | None = None
    for t in texts:
        low = t.lower()
        if "pull" in low and ("unknown" in low or "mixed" in low):
            pull = "unknown"
        elif "soft pull" in low:
            pull = "soft"
        elif "hard pull" in low:
            pull = "hard"
        if "credit card" in low or "debit card" in low:
            cc = t
        if "direct deposit" in low:
            if re.search(r"\b(no|not)\b.*direct deposit|direct deposit (not|isn.t) required", low):
                dd_required = False
            else:
                dd_required = True
                dd_amount = parse_money(t)
    return pull, cc, dd_required, dd_amount


def parse_list_page(html: str) -> list[ListEntry]:
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one("div.entry-content") or soup
    entries: list[ListEntry] = []
    section: str | None = None
    for node in content.find_all(["h2", "h3"]):
        if node.name == "h2":
            section = SECTION_MAP.get(_clean(node.get_text()).lower())
            continue
        if section is None:
            continue
        title = _clean(node.get_text())
        # collect siblings until next h2/h3
        block: list[Tag] = []
        for sib in node.next_siblings:
            if isinstance(sib, Tag):
                if sib.name in ("h2", "h3"):
                    break
                block.append(sib)
        doc_url = None
        offer_url = None
        chips: list[str] = []
        paras: list[str] = []
        for tag in block:
            for a in tag.find_all("a", href=True):
                at = _clean(a.get_text()).lower()
                href = a["href"]
                if "full post" in at and "doctorofcredit.com" in href:
                    doc_url = doc_url or href.split("#")[0]
                elif at.startswith("direct link") and "doctorofcredit.com" not in href:
                    offer_url = offer_url or href
            if tag.name == "ul":
                chips += [_clean(li.get_text()) for li in tag.find_all("li")]
            else:
                txt = _clean(tag.get_text(" "))
                if txt:
                    paras.append(txt)
        if not doc_url:
            # fall back: first DoC link that is not a knowledge-base/reference page
            for tag in block:
                for a in tag.find_all("a", href=True):
                    h = a["href"]
                    if "doctorofcredit.com" in h and "/bank-accounts/" not in h and "/knowledge-base/" not in h and "#" not in h:
                        doc_url = h
                        break
                if doc_url:
                    break
        if not doc_url:
            continue
        summary = _clean(" ".join(paras)) or title
        summary = re.sub(r"^Direct link to (offer|bonus)\s*", "", summary)
        summary = re.sub(r"\s*Read our full post\.?\s*$", "", summary)
        pull, cc, dd_required, dd_amount = _classify_chips(chips)
        bonus_min, bonus_max = parse_money_range(title)
        states = extract_states(title) if section in ("state", "regional") else []
        entries.append(
            ListEntry(
                title=title,
                section=section,
                summary=summary or title,
                doc_url=doc_url,
                offer_url=offer_url,
                bonus_min=bonus_min,
                bonus_max=bonus_max,
                states=states,
                dd_required=dd_required,
                dd_amount=dd_amount,
                pull=pull,
                cc_funding=cc,
            )
        )
    return entries

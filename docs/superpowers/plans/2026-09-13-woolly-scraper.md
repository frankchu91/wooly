# Woolly Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A polite Python scraper that turns Doctor of Credit's "Best Bank Account Bonuses" page (plus per-bonus posts) into `data/bonuses.json`, runnable locally and nightly in GitHub Actions.

**Architecture:** Two parsers (list page, post page) are pure functions over HTML strings and are tested against saved fixtures. A fetcher adds politeness (delay, cache, UA). A merge step keeps `data/bonuses.json` stable across runs (ids by DoC slug; stale entries expire after 14 days). A CLI wires it together.

**Tech Stack:** Python 3.12, `requests`, `beautifulsoup4`, `python-dateutil`, `pytest`, `ruff`. Package managed with a local `.venv` (`python3 -m venv .venv`).

**Spec:** `docs/superpowers/specs/2026-09-13-woolly-mvp-design.md` (§3 Data)

## Global Constraints

- Respect `Crawl-delay: 600`: default delay between network requests is 600 s; configurable via `--delay`. Stop immediately on HTTP 403 or 429.
- User-Agent: `woolly-scraper/0.1 (+https://github.com/haobing/lu_sheep_hair)`.
- Every schema field except `id`, `bank`, `title`, `section`, `doc_url`, `last_seen` may be `null`. Never guess a value; unparsed → `null`.
- The list page is the authority for `title`, `summary`, `bonus_min/max`, inline DD/pull/CC chips. Post "glance" values only fill fields the list page doesn't provide, and `<del>` (struck-through) text is removed before parsing.
- `data/bonuses.json` is sorted by `id` and pretty-printed with 2-space indent so diffs are readable.
- Fixtures live in `scraper/tests/fixtures/` and already exist: `best-bank-account-bonuses.html`, `post-wells-fargo-500.html`, `post-stanford-fcu.html`.
- All commands below run from the repo root unless stated. Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `scraper/pyproject.toml` | package metadata, deps, pytest + ruff config, `woolly-scrape` entry point |
| `scraper/woolly_scraper/models.py` | dataclasses `ListEntry`, `PostData`, `Bonus`; `to_dict`/`from_dict` |
| `scraper/woolly_scraper/text.py` | small helpers: money parsing, state-code extraction, bank-name normalisation, date parsing |
| `scraper/woolly_scraper/list_page.py` | `parse_list_page(html) -> list[ListEntry]` |
| `scraper/woolly_scraper/post_page.py` | `parse_post(html) -> PostData` |
| `scraper/woolly_scraper/fetch.py` | `Fetcher` with delay, cache dir, UA, stop-on-block |
| `scraper/woolly_scraper/merge.py` | `merge_list(existing, entries, today)`, `apply_post(bonus, post)` |
| `scraper/woolly_scraper/cli.py` | `list`, `enrich` subcommands |
| `scraper/tests/test_text.py`, `test_list_page.py`, `test_post_page.py`, `test_merge.py`, `test_fetch.py` | pytest |
| `.github/workflows/scrape.yml` | nightly job |
| `.github/workflows/ci.yml` | scraper lint + tests (web jobs added by the web plan) |
| `data/bonuses.json` | generated output |

---

### Task 1: Package scaffold and text helpers

**Files:**
- Create: `scraper/pyproject.toml`, `scraper/woolly_scraper/__init__.py`, `scraper/woolly_scraper/text.py`, `scraper/tests/__init__.py`, `scraper/tests/test_text.py`

**Interfaces:**
- Produces: `parse_money(s: str) -> int | None`, `parse_money_range(s) -> tuple[int|None,int|None]`, `extract_states(s: str) -> list[str]`, `normalize_bank(title: str) -> str`, `parse_date(s: str) -> date | None`, `US_STATES: frozenset[str]`.

- [ ] **Step 1: Create `scraper/pyproject.toml`**

```toml
[project]
name = "woolly-scraper"
version = "0.1.0"
description = "Scrapes Doctor of Credit bank bonuses into data/bonuses.json"
requires-python = ">=3.12"
dependencies = [
  "requests>=2.32",
  "beautifulsoup4>=4.12",
  "python-dateutil>=2.9",
]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.6"]

[project.scripts]
woolly-scrape = "woolly_scraper.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["woolly_scraper*"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

- [ ] **Step 2: Create venv and install**

Run: `cd scraper && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'`
Expected: installs without error. Create empty `scraper/woolly_scraper/__init__.py` and `scraper/tests/__init__.py`.

- [ ] **Step 3: Write failing tests `scraper/tests/test_text.py`**

```python
from datetime import date

from woolly_scraper.text import (
    extract_states,
    normalize_bank,
    parse_date,
    parse_money,
    parse_money_range,
)


def test_parse_money():
    assert parse_money("$1,000") == 1000
    assert parse_money("Requires $500 direct deposit") == 500
    assert parse_money("None") is None


def test_parse_money_range():
    assert parse_money_range("Chase $300-$400 ($900 With Savings)") == (300, 400)
    assert parse_money_range("Wells Fargo $500 Checking Bonus") == (500, 500)
    assert parse_money_range("Capital One Up To $1,500 Bonus") == (1500, 1500)
    assert parse_money_range("United Debit Card 10,000 Miles") == (None, None)


def test_extract_states():
    assert extract_states("Eastern Bank $750 Checking/Savings Bonus – MA, NH, ME, RI") == ["MA", "NH", "ME", "RI"]
    assert extract_states("Stanford Federal Credit Union $620 – CA") == ["CA"]
    assert extract_states("PSECU $300 Checking Bonus") == []
    # words that look like codes but are not trailing state lists are ignored
    assert extract_states("Chase $300-$400 ($900 With Savings)") == []
    assert extract_states("4Front Credit Union $400 – MI – Direct Deposit Not Required") == ["MI"]
    assert extract_states("Availability: Nationwide") == []
    assert extract_states("Availability: CA, NV only") == ["CA", "NV"]


def test_normalize_bank():
    assert normalize_bank("Wells Fargo $500 Checking Bonus") == "Wells Fargo"
    assert normalize_bank("Chase $300-$400 ($900 With Savings)") == "Chase"
    assert normalize_bank("Capital One Up To $1,500 Bonus") == "Capital One"
    assert normalize_bank("U.S. Bank $450") == "US Bank"
    assert normalize_bank("BMO Harris $400 Checking Bonus") == "BMO"
    assert normalize_bank("Stanford Federal Credit Union $620 – CA") == "Stanford Federal Credit Union"
    assert normalize_bank("Percapita (Fintech) $300 Checking Bonus ($25 Per Month), Direct Deposit Not Required") == "Percapita"
    assert normalize_bank("SoFi Checking & Savings $675 Signup Bonus") == "SoFi"


def test_parse_date():
    assert parse_date("October 6, 2026") == date(2026, 10, 6)
    assert parse_date("December 31st, 2019") == date(2019, 12, 31)
    assert parse_date("Extended till 1/31/25") == date(2025, 1, 31)
    assert parse_date("None") is None
    assert parse_date("") is None
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd scraper && .venv/bin/pytest tests/test_text.py -v`
Expected: FAIL with `ModuleNotFoundError: woolly_scraper.text`

- [ ] **Step 5: Implement `scraper/woolly_scraper/text.py`**

```python
from __future__ import annotations

import re
from datetime import date

from dateutil import parser as dateparser

US_STATES: frozenset[str] = frozenset(
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH "
    "NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split()
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
    """Return USPS codes that appear as a comma/dash separated list of 2-letter tokens."""
    if re.search(r"\bnationwide\b", s, re.I):
        return []
    tokens = re.findall(r"\b([A-Z]{2})\b", s)
    found = [t for t in tokens if t in US_STATES]
    # require the codes to appear in a list-ish context: after " – ", " - ", ":", "[" or ","
    if not found:
        return []
    listish = re.findall(r"(?:[–\-:,\[]\s*)([A-Z]{2})\b", s)
    keep = [t for t in found if t in listish]
    out: list[str] = []
    for t in keep:
        if t not in out:
            out.append(t)
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd scraper && .venv/bin/pytest tests/test_text.py -v`
Expected: all PASS. If `normalize_bank` misses a case, adjust the regex, not the test.

- [ ] **Step 7: Commit**

```bash
git add scraper/pyproject.toml scraper/woolly_scraper scraper/tests
git commit -m "feat(scraper): package scaffold and text helpers"
```

---

### Task 2: Models

**Files:**
- Create: `scraper/woolly_scraper/models.py`, `scraper/tests/test_models.py`

**Interfaces:**
- Produces:

```python
@dataclass
class ListEntry:
    title: str; section: str; summary: str; doc_url: str; offer_url: str | None
    bonus_min: int | None; bonus_max: int | None; states: list[str]
    dd_required: bool | None; dd_amount: int | None; pull: str; cc_funding: str | None

@dataclass
class PostData:
    bonus_max: int | None; availability_text: str | None; states: list[str]; nationwide: bool | None
    dd_required: bool | None; dd_amount: int | None; dd_deadline_days: int | None
    additional_requirements: str | None; pull: str | None; chexsystems: str | None
    cc_funding: str | None; monthly_fee_amount: int | None; monthly_fee_avoidable: bool | None
    etf_amount: int | None; etf_days: int | None; household_limit: str | None
    expiration: date | None; anti_churn_months: int | None; post_modified: date | None

@dataclass
class Bonus:  # exactly the JSON schema in spec §3.2, flattened dd/etf/etc. handled in to_dict/from_dict
```

- [ ] **Step 1: Write failing test `scraper/tests/test_models.py`**

```python
from datetime import date

from woolly_scraper.models import Bonus


def test_bonus_roundtrip():
    b = Bonus(
        id="wells-fargo-500-checking-bonus",
        bank="Wells Fargo",
        title="Wells Fargo $500 Checking Bonus",
        section="checking",
        summary="Requires $1,000 direct deposit.",
        doc_url="https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/",
        offer_url=None,
        bonus_min=500,
        bonus_max=500,
        nationwide=True,
        states=[],
        dd_required=True,
        dd_amount=1000,
        dd_deadline_days=90,
        pull="soft",
        chexsystems=None,
        cc_funding=None,
        monthly_fee_amount=15,
        monthly_fee_avoidable=True,
        etf_amount=None,
        etf_days=None,
        household_limit=None,
        expiration=date(2026, 10, 6),
        anti_churn_months=12,
        additional_requirements=None,
        enriched=True,
        post_modified=date(2026, 8, 23),
        last_seen=date(2026, 9, 13),
    )
    d = b.to_dict()
    assert d["dd"] == {"required": True, "amount": 1000, "deadline_days": 90}
    assert d["availability"] == {"nationwide": True, "states": []}
    assert d["monthly_fee"] == {"amount": 15, "avoidable": True}
    assert d["etf"] is None
    assert d["expiration"] == "2026-10-06"
    assert Bonus.from_dict(d) == b


def test_bonus_from_dict_tolerates_missing_keys():
    b = Bonus.from_dict({
        "id": "x", "bank": "X", "title": "X $100", "section": "checking",
        "doc_url": "https://www.doctorofcredit.com/x/", "last_seen": "2026-09-13",
    })
    assert b.dd_required is None and b.expiration is None and b.enriched is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && .venv/bin/pytest tests/test_models.py -v`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement `scraper/woolly_scraper/models.py`**

```python
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


def _d(v: date | None) -> str | None:
    return v.isoformat() if v else None


def _pd(v: str | None) -> date | None:
    return date.fromisoformat(v) if v else None


@dataclass
class ListEntry:
    title: str
    section: str
    summary: str
    doc_url: str
    offer_url: str | None
    bonus_min: int | None
    bonus_max: int | None
    states: list[str]
    dd_required: bool | None
    dd_amount: int | None
    pull: str
    cc_funding: str | None


@dataclass
class PostData:
    bonus_max: int | None = None
    availability_text: str | None = None
    states: list[str] = field(default_factory=list)
    nationwide: bool | None = None
    dd_required: bool | None = None
    dd_amount: int | None = None
    dd_deadline_days: int | None = None
    additional_requirements: str | None = None
    pull: str | None = None
    chexsystems: str | None = None
    cc_funding: str | None = None
    monthly_fee_amount: int | None = None
    monthly_fee_avoidable: bool | None = None
    etf_amount: int | None = None
    etf_days: int | None = None
    household_limit: str | None = None
    expiration: date | None = None
    anti_churn_months: int | None = None
    post_modified: date | None = None


@dataclass
class Bonus:
    id: str
    bank: str
    title: str
    section: str
    doc_url: str
    last_seen: date
    summary: str = ""
    offer_url: str | None = None
    bonus_min: int | None = None
    bonus_max: int | None = None
    nationwide: bool = False
    states: list[str] = field(default_factory=list)
    dd_required: bool | None = None
    dd_amount: int | None = None
    dd_deadline_days: int | None = None
    pull: str = "unknown"
    chexsystems: str | None = None
    cc_funding: str | None = None
    monthly_fee_amount: int | None = None
    monthly_fee_avoidable: bool | None = None
    etf_amount: int | None = None
    etf_days: int | None = None
    household_limit: str | None = None
    expiration: date | None = None
    anti_churn_months: int | None = None
    additional_requirements: str | None = None
    enriched: bool = False
    post_modified: date | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "bank": self.bank,
            "title": self.title,
            "section": self.section,
            "summary": self.summary,
            "doc_url": self.doc_url,
            "offer_url": self.offer_url,
            "bonus_min": self.bonus_min,
            "bonus_max": self.bonus_max,
            "availability": {"nationwide": self.nationwide, "states": list(self.states)},
            "dd": {
                "required": self.dd_required,
                "amount": self.dd_amount,
                "deadline_days": self.dd_deadline_days,
            },
            "pull": self.pull,
            "chexsystems": self.chexsystems,
            "cc_funding": self.cc_funding,
            "monthly_fee": (
                {"amount": self.monthly_fee_amount, "avoidable": self.monthly_fee_avoidable}
                if self.monthly_fee_amount is not None
                else None
            ),
            "etf": (
                {"amount": self.etf_amount, "days": self.etf_days}
                if (self.etf_amount is not None or self.etf_days is not None)
                else None
            ),
            "household_limit": self.household_limit,
            "expiration": _d(self.expiration),
            "anti_churn_months": self.anti_churn_months,
            "additional_requirements": self.additional_requirements,
            "enriched": self.enriched,
            "post_modified": _d(self.post_modified),
            "last_seen": _d(self.last_seen),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Bonus":
        av = d.get("availability") or {}
        dd = d.get("dd") or {}
        fee = d.get("monthly_fee") or {}
        etf = d.get("etf") or {}
        return cls(
            id=d["id"],
            bank=d["bank"],
            title=d["title"],
            section=d["section"],
            doc_url=d["doc_url"],
            last_seen=_pd(d.get("last_seen")) or date.today(),
            summary=d.get("summary", ""),
            offer_url=d.get("offer_url"),
            bonus_min=d.get("bonus_min"),
            bonus_max=d.get("bonus_max"),
            nationwide=bool(av.get("nationwide", False)),
            states=list(av.get("states", [])),
            dd_required=dd.get("required"),
            dd_amount=dd.get("amount"),
            dd_deadline_days=dd.get("deadline_days"),
            pull=d.get("pull", "unknown"),
            chexsystems=d.get("chexsystems"),
            cc_funding=d.get("cc_funding"),
            monthly_fee_amount=fee.get("amount"),
            monthly_fee_avoidable=fee.get("avoidable"),
            etf_amount=etf.get("amount"),
            etf_days=etf.get("days"),
            household_limit=d.get("household_limit"),
            expiration=_pd(d.get("expiration")),
            anti_churn_months=d.get("anti_churn_months"),
            additional_requirements=d.get("additional_requirements"),
            enriched=bool(d.get("enriched", False)),
            post_modified=_pd(d.get("post_modified")),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scraper && .venv/bin/pytest tests/test_models.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add scraper/woolly_scraper/models.py scraper/tests/test_models.py
git commit -m "feat(scraper): Bonus/ListEntry/PostData models with JSON round-trip"
```

---

### Task 3: List page parser

**Files:**
- Create: `scraper/woolly_scraper/list_page.py`, `scraper/tests/test_list_page.py`
- Uses fixture: `scraper/tests/fixtures/best-bank-account-bonuses.html`

**Interfaces:**
- Consumes: `ListEntry`, `text.*`
- Produces: `parse_list_page(html: str) -> list[ListEntry]`, `SECTION_MAP`.

Page structure (verified): `div.entry-content` contains `h2` section headings then `h3` per
bonus. Between one `h3` and the next: paragraphs and a `ul`. Anchors: text containing
"full post" → `doc_url`; text starting with "Direct link" → `offer_url`. Inline chips are
list items like "Soft pull", "No credit card funding", "Direct deposit required, no minimum",
"$1,000 direct deposit required", "No direct deposit requirement", "Direct deposits totaling $4,000 – $7,500".

- [ ] **Step 1: Write failing test `scraper/tests/test_list_page.py`**

```python
from pathlib import Path

import pytest

from woolly_scraper.list_page import parse_list_page

FIX = Path(__file__).parent / "fixtures" / "best-bank-account-bonuses.html"


@pytest.fixture(scope="module")
def entries():
    return parse_list_page(FIX.read_text(encoding="utf-8", errors="ignore"))


def test_entry_count_and_sections(entries):
    assert len(entries) >= 240
    sections = {e.section for e in entries}
    assert sections == {"checking", "savings", "business", "state", "regional"}


def test_wells_fargo_entry(entries):
    wf = next(e for e in entries if e.title.startswith("Wells Fargo $500"))
    assert wf.section == "checking"
    assert wf.doc_url == "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/"
    assert wf.offer_url and wf.offer_url.startswith("http") and "doctorofcredit.com" not in wf.offer_url
    assert (wf.bonus_min, wf.bonus_max) == (500, 500)
    assert wf.pull == "soft"
    assert wf.dd_required is True
    assert wf.dd_amount == 1000
    assert wf.cc_funding and "no" in wf.cc_funding.lower()
    assert wf.states == []


def test_chase_entry_has_range(entries):
    ch = next(e for e in entries if e.title.startswith("Chase $300-$400"))
    assert (ch.bonus_min, ch.bonus_max) == (300, 400)
    assert ch.dd_required is True and ch.dd_amount is None  # "no minimum"


def test_state_entry_states(entries):
    e = next(x for x in entries if x.title.startswith("Eastern Bank $750"))
    assert e.section == "state"
    assert e.states == ["MA", "NH", "ME", "RI"]


def test_no_dd_entry(entries):
    e = next(x for x in entries if "4Front" in x.title)
    assert e.dd_required is False


def test_every_entry_has_doc_url(entries):
    assert all(e.doc_url.startswith("https://www.doctorofcredit.com/") for e in entries)
    assert all(e.summary for e in entries)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && .venv/bin/pytest tests/test_list_page.py -v` → FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement `scraper/woolly_scraper/list_page.py`**

```python
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
        if "soft pull" in low:
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
```

- [ ] **Step 4: Run tests; iterate on selectors until green**

Run: `cd scraper && .venv/bin/pytest tests/test_list_page.py -v`
Expected: PASS. If `test_chase_entry_has_range` fails because the chip text is
"Direct deposit required, no minimum", ensure `parse_money` returns None for it (it does:
no `$`). If the DoC link fallback picks a wrong page, print the failing entry's block and
tighten the filter; do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add scraper/woolly_scraper/list_page.py scraper/tests/test_list_page.py scraper/tests/fixtures
git commit -m "feat(scraper): parse DoC best-bonuses list page"
```

---

### Task 4: Post page parser

**Files:**
- Create: `scraper/woolly_scraper/post_page.py`, `scraper/tests/test_post_page.py`
- Fixtures: `post-wells-fargo-500.html`, `post-stanford-fcu.html`

**Interfaces:**
- Produces: `parse_post(html: str, today: date) -> PostData`

Structure (verified): `div.entry-content` → `<ul>` whose `<li>` start with `<strong>Label: </strong>`
right after the text "Offer at a glance". Struck values are in `<del>`. Sections are `h2`
("The Offer", "The Fine Print", …). `dateModified` is in the JSON-LD `<script type="application/ld+json">`.
Old posts have "Update M/D/YY: … valid until M/D/YY" lines before the glance.

- [ ] **Step 1: Write failing tests `scraper/tests/test_post_page.py`**

```python
from datetime import date
from pathlib import Path

from woolly_scraper.post_page import parse_post

FIX = Path(__file__).parent / "fixtures"
TODAY = date(2026, 9, 13)


def load(name):
    return (FIX / name).read_text(encoding="utf-8", errors="ignore")


def test_wells_fargo_glance():
    p = parse_post(load("post-wells-fargo-500.html"), TODAY)
    assert p.bonus_max == 500
    assert p.nationwide is True and p.states == []
    assert p.dd_required is True and p.dd_amount == 1000
    assert p.dd_deadline_days == 90
    assert p.pull == "soft"
    assert p.chexsystems and "mixed" in p.chexsystems.lower()
    assert p.cc_funding == "None"
    assert p.monthly_fee_amount == 15 and p.monthly_fee_avoidable is True
    assert p.etf_amount is None and p.etf_days is None
    assert p.household_limit == "None"
    assert p.expiration == date(2026, 10, 6)
    assert p.anti_churn_months == 12
    assert p.post_modified == date(2026, 8, 23)


def test_stanford_stale_glance_is_not_trusted():
    p = parse_post(load("post-stanford-fcu.html"), TODAY)
    # glance says $100 but bonus_max is only informational; expiration in the past → None
    assert p.expiration is None
    assert p.nationwide is False
    assert p.pull == "soft"
    assert p.etf_days == 90  # "kept open for three months"
    assert p.dd_required is True and p.dd_amount == 500


def test_missing_glance_returns_empty():
    p = parse_post("<html><body><div class='entry-content'><p>hi</p></div></body></html>", TODAY)
    assert p.bonus_max is None and p.expiration is None and p.post_modified is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd scraper && .venv/bin/pytest tests/test_post_page.py -v` → FAIL

- [ ] **Step 3: Implement `scraper/woolly_scraper/post_page.py`**

```python
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
    m = re.search(r"(\d+|one|two|three|four|five|six|twelve)\s+(month|day)s?", text, re.I)
    if not m:
        return None
    n = int(m.group(1)) if m.group(1).isdigit() else WORD_NUM[m.group(1).lower()]
    return n * 30 if m.group(2).lower().startswith("month") else n


def _glance(soup: BeautifulSoup) -> dict[str, str]:
    out: dict[str, str] = {}
    for strong in soup.select("div.entry-content ul li strong"):
        label = _clean(strong.get_text()).rstrip(":").lower()
        if not label:
            continue
        li = strong.parent
        for d in li.find_all("del"):
            d.decompose()
        value = _clean(li.get_text(" ")).replace(_clean(strong.get_text()), "", 1).strip(" :")
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
        p.nationwide = bool(re.search(r"\bnationwide\b", av, re.I))
        p.states = extract_states(av)
        if p.nationwide is False and not p.states:
            p.nationwide = False
    dd = g.get("direct deposit required")
    if dd:
        low = dd.lower()
        if low.startswith("no") or "not required" in low:
            p.dd_required = False
        else:
            p.dd_required = True
            p.dd_amount = parse_money(dd)
    p.additional_requirements = g.get("additional requirements")
    pull = (g.get("hard/soft pull") or "").lower()
    p.pull = "soft" if "soft" in pull else "hard" if "hard" in pull else ("unknown" if pull else None)
    p.chexsystems = g.get("chexsystems")
    p.cc_funding = g.get("credit card funding")
    fee = g.get("monthly fees")
    if fee:
        p.monthly_fee_amount = parse_money(fee) if not fee.lower().startswith("none") else 0
        p.monthly_fee_avoidable = ("avoidable" in fee.lower() and "unavoidable" not in fee.lower()) or fee.lower().startswith("none")
    etf = g.get("early account termination fee")
    if etf:
        p.etf_amount = parse_money(etf) if not etf.lower().startswith("none") else 0
        p.etf_days = _months_to_days(etf)
    p.household_limit = g.get("household limit")
    exp = parse_date(g.get("expiration date"))
    body = _fine_print(soup)
    # newer "valid until / extended till" dates in update lines win if later
    for m in re.finditer(r"(?:valid until|extended till|extended until|expires?)\s+([^.;]+)", body, re.I):
        d = parse_date(m.group(1))
        if d and (exp is None or d > exp):
            exp = d
    p.expiration = exp if exp and exp >= today else None
    m = re.search(r"within\s+(\d+)\s+(?:calendar\s+)?days", body, re.I)
    if m:
        p.dd_deadline_days = int(m.group(1))
    m = re.search(r"(?:past|within|last|previous)\s+(\d+)\s+months", body, re.I)
    if m:
        p.anti_churn_months = int(m.group(1))
    return p
```

- [ ] **Step 4: Run tests; fix parsing until green**

Run: `cd scraper && .venv/bin/pytest tests/test_post_page.py -v`
Expected: PASS. Known wrinkle: Wells Fargo's `Credit card funding` value is "None" and
`Household limit` is "None"; keep them as strings (the spec says strings for these).

- [ ] **Step 5: Commit**

```bash
git add scraper/woolly_scraper/post_page.py scraper/tests/test_post_page.py
git commit -m "feat(scraper): parse DoC bonus post glance and fine print"
```

---

### Task 5: Polite fetcher with cache

**Files:**
- Create: `scraper/woolly_scraper/fetch.py`, `scraper/tests/test_fetch.py`

**Interfaces:**
- Produces: `class Fetcher(cache_dir: Path, delay: float, session=None, sleep=time.sleep)` with `get(url: str, *, use_cache: bool = True) -> str` raising `BlockedError` on 403/429.

- [ ] **Step 1: Write failing test `scraper/tests/test_fetch.py`**

```python
from pathlib import Path

import pytest

from woolly_scraper.fetch import BlockedError, Fetcher


class FakeResp:
    def __init__(self, status, text):
        self.status_code = status
        self.text = text


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, headers=None, timeout=None):
        self.calls.append((url, headers))
        return self.responses.pop(0)


def test_caches_and_delays(tmp_path: Path):
    slept = []
    s = FakeSession([FakeResp(200, "<html>a</html>"), FakeResp(200, "<html>b</html>")])
    f = Fetcher(cache_dir=tmp_path, delay=5, session=s, sleep=slept.append)
    assert f.get("https://x.test/a/") == "<html>a</html>"
    assert f.get("https://x.test/a/") == "<html>a</html>"  # cache hit, no request
    assert f.get("https://x.test/b/") == "<html>b</html>"
    assert len(s.calls) == 2
    assert slept == [5]  # first request has no delay, second waits
    assert s.calls[0][1]["User-Agent"].startswith("woolly-scraper/")


def test_blocked_raises(tmp_path: Path):
    s = FakeSession([FakeResp(429, "slow down")])
    f = Fetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    with pytest.raises(BlockedError):
        f.get("https://x.test/a/")


def test_bypass_cache(tmp_path: Path):
    s = FakeSession([FakeResp(200, "1"), FakeResp(200, "2")])
    f = Fetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    assert f.get("https://x.test/a/") == "1"
    assert f.get("https://x.test/a/", use_cache=False) == "2"
```

- [ ] **Step 2: Run to verify fail** → `ModuleNotFoundError`

- [ ] **Step 3: Implement `scraper/woolly_scraper/fetch.py`**

```python
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
    def __init__(self, cache_dir: Path, delay: float = DEFAULT_DELAY, session=None, sleep=time.sleep):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.session = session or requests.Session()
        self.sleep = sleep
        self._requests_made = 0

    def _path(self, url: str) -> Path:
        return self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".html")

    def get(self, url: str, *, use_cache: bool = True) -> str:
        p = self._path(url)
        if use_cache and p.exists():
            return p.read_text(encoding="utf-8")
        if self._requests_made > 0 and self.delay > 0:
            self.sleep(self.delay)
        resp = self.session.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        self._requests_made += 1
        if resp.status_code in (403, 429):
            raise BlockedError(f"{resp.status_code} from {url}; stopping to stay polite")
        resp.raise_for_status() if hasattr(resp, "raise_for_status") else None
        p.write_text(resp.text, encoding="utf-8")
        return resp.text
```

- [ ] **Step 4: Run tests** → PASS

- [ ] **Step 5: Commit**

```bash
git add scraper/woolly_scraper/fetch.py scraper/tests/test_fetch.py
git commit -m "feat(scraper): polite cached fetcher"
```

---

### Task 6: Merge logic

**Files:**
- Create: `scraper/woolly_scraper/merge.py`, `scraper/tests/test_merge.py`

**Interfaces:**
- Produces:
  - `slug(doc_url: str) -> str` — last path segment.
  - `merge_list(existing: list[Bonus], entries: list[ListEntry], today: date) -> list[Bonus]`
  - `apply_post(bonus: Bonus, post: PostData) -> Bonus` (returns updated copy, `enriched=True`)
  - `needs_enrich(bonus: Bonus) -> bool`

- [ ] **Step 1: Write failing tests `scraper/tests/test_merge.py`**

```python
from datetime import date, timedelta

from woolly_scraper.merge import apply_post, merge_list, needs_enrich, slug
from woolly_scraper.models import Bonus, ListEntry, PostData

TODAY = date(2026, 9, 13)


def entry(**kw):
    base = dict(
        title="Wells Fargo $500 Checking Bonus", section="checking", summary="s",
        doc_url="https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/", offer_url=None,
        bonus_min=500, bonus_max=500, states=[], dd_required=True, dd_amount=1000, pull="soft", cc_funding=None,
    )
    base.update(kw)
    return ListEntry(**base)


def test_slug():
    assert slug("https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/") == "wells-fargo-500-checking-bonus"


def test_merge_adds_new_and_sets_nationwide_by_section():
    out = merge_list([], [entry()], TODAY)
    assert len(out) == 1
    b = out[0]
    assert b.id == "wells-fargo-500-checking-bonus" and b.bank == "Wells Fargo"
    assert b.nationwide is True and b.last_seen == TODAY and b.enriched is False


def test_merge_state_entry_not_nationwide():
    e = entry(title="Eastern Bank $750 – MA, NH", section="state", states=["MA", "NH"],
              doc_url="https://www.doctorofcredit.com/eastern/")
    b = merge_list([], [e], TODAY)[0]
    assert b.nationwide is False and b.states == ["MA", "NH"]


def test_merge_updates_existing_and_keeps_enrichment():
    old = merge_list([], [entry()], TODAY - timedelta(days=3))[0]
    old.enriched = True
    old.expiration = date(2026, 10, 6)
    out = merge_list([old], [entry(summary="new summary", bonus_max=600)], TODAY)
    b = out[0]
    assert b.summary == "new summary" and b.bonus_max == 600
    assert b.enriched is True and b.expiration == date(2026, 10, 6)
    assert b.last_seen == TODAY


def test_merge_drops_stale_after_14_days():
    old = merge_list([], [entry()], TODAY - timedelta(days=15))[0]
    assert merge_list([old], [], TODAY) == []
    recent = merge_list([], [entry()], TODAY - timedelta(days=13))[0]
    assert len(merge_list([recent], [], TODAY)) == 1


def test_merge_sorted_by_id():
    a = entry(doc_url="https://www.doctorofcredit.com/b-bank/", title="B Bank $1")
    b = entry(doc_url="https://www.doctorofcredit.com/a-bank/", title="A Bank $1")
    assert [x.id for x in merge_list([], [a, b], TODAY)] == ["a-bank", "b-bank"]


def test_apply_post_fills_only_missing_and_marks_enriched():
    b = merge_list([], [entry(dd_amount=None)], TODAY)[0]
    p = PostData(bonus_max=999, dd_required=True, dd_amount=1000, dd_deadline_days=90,
                 pull="hard", expiration=date(2026, 10, 6), anti_churn_months=12,
                 monthly_fee_amount=15, monthly_fee_avoidable=True, post_modified=date(2026, 8, 23),
                 nationwide=True)
    out = apply_post(b, p)
    assert out.bonus_max == 500          # list page wins
    assert out.pull == "soft"            # list page wins when known
    assert out.dd_amount == 1000         # list page had None → filled
    assert out.dd_deadline_days == 90 and out.anti_churn_months == 12
    assert out.expiration == date(2026, 10, 6) and out.monthly_fee_amount == 15
    assert out.enriched is True and out.post_modified == date(2026, 8, 23)


def test_apply_post_fills_states_for_state_section_when_list_had_none():
    e = entry(title="Some Bank $200", section="state", states=[], doc_url="https://www.doctorofcredit.com/some/")
    b = merge_list([], [e], TODAY)[0]
    out = apply_post(b, PostData(states=["CA"], nationwide=False))
    assert out.states == ["CA"] and out.nationwide is False


def test_needs_enrich():
    b = merge_list([], [entry()], TODAY)[0]
    assert needs_enrich(b)
    b.enriched = True
    assert not needs_enrich(b)
```

- [ ] **Step 2: Run to verify fail** → `ModuleNotFoundError`

- [ ] **Step 3: Implement `scraper/woolly_scraper/merge.py`**

```python
from __future__ import annotations

import dataclasses
from datetime import date, timedelta

from .models import Bonus, ListEntry, PostData
from .text import normalize_bank

STALE_DAYS = 14


def slug(doc_url: str) -> str:
    return doc_url.rstrip("/").rsplit("/", 1)[-1]


def _from_entry(e: ListEntry, today: date) -> Bonus:
    return Bonus(
        id=slug(e.doc_url),
        bank=normalize_bank(e.title),
        title=e.title,
        section=e.section,
        doc_url=e.doc_url,
        last_seen=today,
        summary=e.summary,
        offer_url=e.offer_url,
        bonus_min=e.bonus_min,
        bonus_max=e.bonus_max,
        nationwide=e.section in ("checking", "savings", "business"),
        states=list(e.states),
        dd_required=e.dd_required,
        dd_amount=e.dd_amount,
        pull=e.pull,
        cc_funding=e.cc_funding,
    )


def merge_list(existing: list[Bonus], entries: list[ListEntry], today: date) -> list[Bonus]:
    by_id = {b.id: b for b in existing}
    for e in entries:
        fresh = _from_entry(e, today)
        old = by_id.get(fresh.id)
        if old is None:
            by_id[fresh.id] = fresh
            continue
        # list-page fields refresh; enrichment-only fields are kept from old
        updated = dataclasses.replace(
            old,
            title=fresh.title,
            bank=fresh.bank,
            section=fresh.section,
            summary=fresh.summary,
            offer_url=fresh.offer_url or old.offer_url,
            bonus_min=fresh.bonus_min if fresh.bonus_min is not None else old.bonus_min,
            bonus_max=fresh.bonus_max if fresh.bonus_max is not None else old.bonus_max,
            nationwide=fresh.nationwide if fresh.section != old.section else old.nationwide,
            states=fresh.states or old.states,
            dd_required=fresh.dd_required if fresh.dd_required is not None else old.dd_required,
            dd_amount=fresh.dd_amount if fresh.dd_amount is not None else old.dd_amount,
            pull=fresh.pull if fresh.pull != "unknown" else old.pull,
            cc_funding=fresh.cc_funding or old.cc_funding,
            last_seen=today,
        )
        by_id[fresh.id] = updated
    cutoff = today - timedelta(days=STALE_DAYS)
    kept = [b for b in by_id.values() if b.last_seen >= cutoff]
    return sorted(kept, key=lambda b: b.id)


def _fill(current, new):
    return current if current is not None else new


def apply_post(bonus: Bonus, post: PostData) -> Bonus:
    nationwide = bonus.nationwide
    states = bonus.states
    if bonus.section in ("state", "regional") and not states:
        states = post.states
        nationwide = bool(post.nationwide) if post.nationwide is not None else False
    return dataclasses.replace(
        bonus,
        nationwide=nationwide,
        states=states,
        dd_required=_fill(bonus.dd_required, post.dd_required),
        dd_amount=_fill(bonus.dd_amount, post.dd_amount),
        dd_deadline_days=post.dd_deadline_days,
        pull=bonus.pull if bonus.pull != "unknown" else (post.pull or "unknown"),
        chexsystems=post.chexsystems,
        cc_funding=_fill(bonus.cc_funding, post.cc_funding),
        monthly_fee_amount=post.monthly_fee_amount,
        monthly_fee_avoidable=post.monthly_fee_avoidable,
        etf_amount=post.etf_amount,
        etf_days=post.etf_days,
        household_limit=post.household_limit,
        expiration=post.expiration,
        anti_churn_months=post.anti_churn_months,
        additional_requirements=post.additional_requirements,
        enriched=True,
        post_modified=post.post_modified,
    )


def needs_enrich(bonus: Bonus) -> bool:
    return not bonus.enriched
```

- [ ] **Step 4: Run tests** → PASS

- [ ] **Step 5: Commit**

```bash
git add scraper/woolly_scraper/merge.py scraper/tests/test_merge.py
git commit -m "feat(scraper): merge list entries and post data into stable bonus records"
```

---

### Task 7: CLI and first real data file

**Files:**
- Create: `scraper/woolly_scraper/cli.py`, `scraper/tests/test_cli.py`, `data/bonuses.json`

**Interfaces:**
- Produces: `main(argv=None) -> int`; subcommands:
  - `woolly-scrape list [--data data/bonuses.json] [--cache scraper/.cache] [--delay 600] [--no-cache]`
  - `woolly-scrape enrich [--limit N] [--delay 600] [--only-nationwide] [--data …] [--cache …]`
- JSON output: `{"generated_at": ISO-8601 UTC, "source": LIST_URL, "bonuses": [...]}`

- [ ] **Step 1: Write failing test `scraper/tests/test_cli.py`**

```python
import json
from datetime import date
from pathlib import Path

from woolly_scraper import cli

FIX = Path(__file__).parent / "fixtures"


class FakeFetcher:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def get(self, url, use_cache=True):
        self.calls.append(url)
        return self.pages[url]


def test_list_then_enrich(tmp_path, monkeypatch):
    data = tmp_path / "bonuses.json"
    list_html = (FIX / "best-bank-account-bonuses.html").read_text(encoding="utf-8", errors="ignore")
    wf_html = (FIX / "post-wells-fargo-500.html").read_text(encoding="utf-8", errors="ignore")
    pages = {cli.LIST_URL: list_html, "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/": wf_html}
    fake = FakeFetcher(pages)
    monkeypatch.setattr(cli, "make_fetcher", lambda cache, delay: fake)
    monkeypatch.setattr(cli, "today", lambda: date(2026, 9, 13))

    assert cli.main(["list", "--data", str(data)]) == 0
    doc = json.loads(data.read_text())
    assert doc["source"] == cli.LIST_URL and len(doc["bonuses"]) >= 240
    wf = next(b for b in doc["bonuses"] if b["id"] == "wells-fargo-500-checking-bonus")
    assert wf["enriched"] is False

    # enrich only nationwide, limit 1, and make the fake only know Wells Fargo:
    # entries whose post is not in `pages` must be skipped gracefully, not crash.
    assert cli.main(["enrich", "--data", str(data), "--limit", "1", "--only-nationwide", "--ids", "wells-fargo-500-checking-bonus"]) == 0
    doc = json.loads(data.read_text())
    wf = next(b for b in doc["bonuses"] if b["id"] == "wells-fargo-500-checking-bonus")
    assert wf["enriched"] is True and wf["expiration"] == "2026-10-06" and wf["dd"]["deadline_days"] == 90
```

- [ ] **Step 2: Run to verify fail** → `AttributeError`/`ModuleNotFoundError`

- [ ] **Step 3: Implement `scraper/woolly_scraper/cli.py`**

```python
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from .fetch import DEFAULT_DELAY, BlockedError, Fetcher
from .list_page import parse_list_page
from .merge import apply_post, merge_list, needs_enrich
from .models import Bonus
from .post_page import parse_post

LIST_URL = "https://www.doctorofcredit.com/best-bank-account-bonuses/"
DEFAULT_DATA = Path("data/bonuses.json")
DEFAULT_CACHE = Path("scraper/.cache")


def today() -> date:
    return date.today()


def make_fetcher(cache: Path, delay: float) -> Fetcher:
    return Fetcher(cache_dir=cache, delay=delay)


def load(path: Path) -> list[Bonus]:
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    return [Bonus.from_dict(d) for d in doc.get("bonuses", [])]


def save(path: Path, bonuses: list[Bonus]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": LIST_URL,
        "bonuses": [b.to_dict() for b in sorted(bonuses, key=lambda b: b.id)],
    }
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def cmd_list(args) -> int:
    fetcher = make_fetcher(Path(args.cache), args.delay)
    html = fetcher.get(LIST_URL, use_cache=not args.no_cache)
    entries = parse_list_page(html)
    if len(entries) < 50:
        print(f"refusing to save: only {len(entries)} entries parsed (page layout changed?)", file=sys.stderr)
        return 2
    merged = merge_list(load(Path(args.data)), entries, today())
    save(Path(args.data), merged)
    print(f"list: {len(entries)} entries parsed, {len(merged)} bonuses saved to {args.data}")
    return 0


def cmd_enrich(args) -> int:
    path = Path(args.data)
    bonuses = load(path)
    fetcher = make_fetcher(Path(args.cache), args.delay)
    todo = [b for b in bonuses if needs_enrich(b)]
    if args.only_nationwide:
        todo = [b for b in todo if b.nationwide]
    if args.ids:
        wanted = set(args.ids.split(","))
        todo = [b for b in todo if b.id in wanted]
    todo = todo[: args.limit] if args.limit else todo
    done = 0
    by_id = {b.id: b for b in bonuses}
    for b in todo:
        try:
            html = fetcher.get(b.doc_url)
        except BlockedError as e:
            print(str(e), file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001 - one bad post must not kill the run
            print(f"skip {b.id}: {e}", file=sys.stderr)
            continue
        by_id[b.id] = apply_post(b, parse_post(html, today()))
        done += 1
        save(path, list(by_id.values()))  # checkpoint after every post (runs are slow)
    print(f"enrich: {done}/{len(todo)} posts processed")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="woolly-scrape")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("list", "enrich"):
        sp = sub.add_parser(name)
        sp.add_argument("--data", default=str(DEFAULT_DATA))
        sp.add_argument("--cache", default=str(DEFAULT_CACHE))
        sp.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    sub.choices["list"].add_argument("--no-cache", action="store_true")
    en = sub.choices["enrich"]
    en.add_argument("--limit", type=int, default=0)
    en.add_argument("--only-nationwide", action="store_true")
    en.add_argument("--ids", default="")
    args = ap.parse_args(argv)
    return cmd_list(args) if args.cmd == "list" else cmd_enrich(args)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests** → `cd scraper && .venv/bin/pytest -v` all PASS; `.venv/bin/ruff check .` clean.

- [ ] **Step 5: Generate the real data file from the live list page**

Run from repo root: `scraper/.venv/bin/woolly-scrape list --no-cache`
Expected: `list: 24x entries parsed, 24x bonuses saved to data/bonuses.json`. Open the file
and spot-check Wells Fargo, Chase, and one state entry.

- [ ] **Step 6: Enrich the top nationwide entries once with a realistic delay**

Run in background (this is slow by design): `scraper/.venv/bin/woolly-scrape enrich --only-nationwide --limit 3 --delay 600`
For the plan's purposes it is enough that this completes 3 posts; the maintainer continues the backfill separately.

- [ ] **Step 7: Commit**

```bash
git add scraper/woolly_scraper/cli.py scraper/tests/test_cli.py data/bonuses.json
git commit -m "feat(scraper): CLI with list/enrich and first data snapshot"
```

---

### Task 8: GitHub Actions (nightly scrape + CI) and README section

**Files:**
- Create: `.github/workflows/scrape.yml`, `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  scraper:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: scraper } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e '.[dev]'
      - run: ruff check .
      - run: pytest -q
```

- [ ] **Step 2: Create `.github/workflows/scrape.yml`**

```yaml
name: scrape
on:
  schedule: [{ cron: "17 9 * * *" }]   # daily 09:17 UTC
  workflow_dispatch:
permissions: { contents: write }
concurrency: { group: scrape, cancel-in-progress: false }
jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e './scraper'
      - run: woolly-scrape list --no-cache
      - run: woolly-scrape enrich --limit 5 --delay 600
      - name: Commit if changed
        run: |
          git config user.name "woolly-bot"
          git config user.email "woolly-bot@users.noreply.github.com"
          git add data/bonuses.json
          git diff --cached --quiet || git commit -m "data: nightly bonus refresh"
          git push
```

- [ ] **Step 3: Create `README.md`**

```markdown
# 🐑 Woolly — bank bonus planner

Turn your paycheck into bank account bonuses. Tell Woolly your state, your direct-deposit
capacity, and the banks you've had; it finds the bonuses you qualify for and schedules them.

- Free, open source (MIT), runs entirely in your browser. Nothing is uploaded.
- Data comes from [Doctor of Credit](https://www.doctorofcredit.com/best-bank-account-bonuses/), refreshed nightly.
- Not financial advice. Always read the offer terms on Doctor of Credit before opening an account.

## Repo layout

- `scraper/` — Python scraper that produces `data/bonuses.json` (see `scraper/README` section below)
- `web/` — Vite + React app
- `data/bonuses.json` — the dataset the app reads

## Scraper

```bash
cd scraper && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
cd .. && scraper/.venv/bin/woolly-scrape list            # refresh the list (1 request)
scraper/.venv/bin/woolly-scrape enrich --limit 5         # fetch 5 posts, 600 s apart
scraper/.venv/bin/pytest scraper -q
```

The scraper honours DoC's `Crawl-delay: 600`. A full backfill of ~250 posts takes
~2 days; run it locally with `enrich` in the background, or let the nightly action
chip away at 5 posts per run.
```

- [ ] **Step 4: Validate YAML and commit**

Run: `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/scrape.yml']];print('ok')"` (install `pyyaml` in the venv if missing).

```bash
git add .github README.md
git commit -m "ci: scraper tests and nightly data refresh workflow"
```

---

## Self-review

- Spec §3.1 sources → Tasks 3, 4. §3.2 schema → Task 2 (`to_dict` matches field-for-field). §3.3 behaviour: `list`/`enrich`, cache, delay, stop-on-block, 14-day expiry, nightly action → Tasks 5–8. §3.4 state codes from title and Availability → Tasks 1, 3, 4, 6.
- Placeholders: none; every step has code or an exact command.
- Type consistency: `ListEntry`/`PostData`/`Bonus` field names are identical across Tasks 2–7; `parse_post(html, today)` signature used in Tasks 4 and 7; `make_fetcher(cache, delay)` and `today()` are module-level so the CLI test can monkeypatch them.

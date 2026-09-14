from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any


def _d(v: date | None) -> str | None:
    return v.isoformat() if v else None


def _pd(v: str | None) -> date | None:
    return date.fromisoformat(v) if v else None


def _normalize_condition_text(text: str) -> str:
    norm = re.sub(r"\s+", " ", text.strip()).lower()
    return norm.rstrip(".,;:!? ")


@dataclass
class Condition:
    kind: str
    text: str
    amount: int | None = None
    days: int | None = None
    count: int | None = None
    source: str = "doc"

    @property
    def id(self) -> str:
        norm = _normalize_condition_text(self.text)
        return hashlib.sha1(f"{self.kind}|{norm}".encode()).hexdigest()[:8]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "text": self.text,
            "amount": self.amount,
            "days": self.days,
            "count": self.count,
            "source": self.source,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Condition:
        # A stored id is ignored (and recomputed) so ids never drift from the text.
        return cls(
            kind=d["kind"],
            text=d["text"],
            amount=d.get("amount"),
            days=d.get("days"),
            count=d.get("count"),
            source=d.get("source", "doc"),
        )


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
    conditions: list[Condition] = field(default_factory=list)


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
    enriched_at: date | None = None
    post_modified: date | None = None
    conditions: list[Condition] = field(default_factory=list)
    hold_days: int | None = None
    terms_status: str | None = None
    terms_url: str | None = None
    terms_fetched_at: date | None = None

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
            "enriched_at": _d(self.enriched_at),
            "post_modified": _d(self.post_modified),
            "last_seen": _d(self.last_seen),
            "conditions": [c.to_dict() for c in self.conditions],
            "hold_days": self.hold_days,
            "terms": {
                "status": self.terms_status,
                "url": self.terms_url,
                "fetched_at": _d(self.terms_fetched_at),
            },
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Bonus:
        av = d.get("availability") or {}
        dd = d.get("dd") or {}
        fee = d.get("monthly_fee") or {}
        etf = d.get("etf") or {}
        terms = d.get("terms") or {}
        return cls(
            id=d["id"],
            bank=d["bank"],
            title=d["title"],
            section=d["section"],
            doc_url=d["doc_url"],
            last_seen=_pd(d["last_seen"]),
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
            enriched_at=_pd(d.get("enriched_at")),
            post_modified=_pd(d.get("post_modified")),
            conditions=[Condition.from_dict(c) for c in d.get("conditions", [])],
            hold_days=d.get("hold_days"),
            terms_status=terms.get("status"),
            terms_url=terms.get("url"),
            terms_fetched_at=_pd(terms.get("fetched_at")),
        )

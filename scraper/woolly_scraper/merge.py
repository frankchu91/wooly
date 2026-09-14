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

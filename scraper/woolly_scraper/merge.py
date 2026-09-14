from __future__ import annotations

import dataclasses
from datetime import date, timedelta

from .conditions import dedupe_conditions
from .models import Bonus, Condition, ListEntry, PostData
from .text import normalize_bank

STALE_DAYS = 14
RE_ENRICH_DAYS = 30


def slug(doc_url: str) -> str:
    return doc_url.rstrip("/").rsplit("/", 1)[-1]


def _pick_highest_bonus(entries: list[ListEntry]) -> ListEntry:
    best = entries[0]
    for e in entries[1:]:
        if (e.bonus_max or -1) > (best.bonus_max or -1):
            best = e
    return best


def assign_ids(entries: list[ListEntry]) -> list[tuple[str, ListEntry]]:
    """Pick a stable id for each list entry, coping with doc_url collisions.

    Several DoC posts are listed more than once on the list page under the same
    doc_url (e.g. a bank's checking and savings variants sharing one post). Group by
    slug(doc_url): if a slug's entries span more than one section, each section gets
    its own record (`slug--section`); if several entries share both slug and section,
    only the highest bonus_max survives under the plain slug id (ties keep the first
    in document order). A slug that appears once keeps the plain slug id.
    """
    groups: dict[str, list[ListEntry]] = {}
    for e in entries:
        groups.setdefault(slug(e.doc_url), []).append(e)
    out: list[tuple[str, ListEntry]] = []
    for s, group in groups.items():
        by_section: dict[str, list[ListEntry]] = {}
        for e in group:
            by_section.setdefault(e.section, []).append(e)
        if len(by_section) > 1:
            for section, sec_entries in by_section.items():
                out.append((f"{s}--{section}", _pick_highest_bonus(sec_entries)))
        else:
            (sec_entries,) = by_section.values()
            out.append((s, _pick_highest_bonus(sec_entries)))
    return out


def _from_entry(e: ListEntry, today: date, id_: str) -> Bonus:
    return Bonus(
        id=id_,
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
        terms_status="none" if e.offer_url is None else None,
    )


def merge_list(existing: list[Bonus], entries: list[ListEntry], today: date) -> list[Bonus]:
    by_id = {b.id: b for b in existing}
    assigned = assign_ids(entries)
    fresh_ids = {id_ for id_, _ in assigned}
    seen_slugs = {slug(e.doc_url) for e in entries}
    # A slug's id shape can change between runs (plain "x" splitting into
    # "x--checking"/"x--savings", or the reverse); when that happens, drop the
    # now-superseded record instead of leaving a stale duplicate keyed by the old id.
    for old_id in list(by_id):
        base = old_id.split("--", 1)[0]
        if base in seen_slugs and old_id not in fresh_ids:
            del by_id[old_id]
    for id_, e in assigned:
        fresh = _from_entry(e, today, id_)
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


def derive_hold_days(conditions: list[Condition], etf_days: int | None) -> int | None:
    """How long the account has to stay open: the first `keep_open` condition that names a
    day window, else the early-termination-fee window.

    X9: shared by `apply_post` and `cmd_terms` so a bank page's own keep-open sentence
    updates `hold_days` too. Before this, `hold_days` was only ever computed from the DoC
    post, so a `keep_open` condition that arrived with the bank terms showed up on the
    checklist while the "earliest safe close" date carried on using the ETF window — the
    two answering the same question differently on the same screen.
    """
    days = next((c.days for c in conditions if c.kind == "keep_open" and c.days is not None), None)
    return days if days is not None else etf_days


def apply_post(bonus: Bonus, post: PostData, today: date) -> Bonus:
    nationwide = bonus.nationwide
    states = bonus.states
    if bonus.section in ("state", "regional") and not states:
        states = post.states
        nationwide = bool(post.nationwide) if post.nationwide is not None else False
    bank_conditions = [c for c in bonus.conditions if c.source == "bank"]
    conditions = dedupe_conditions(post.conditions + bank_conditions)
    hold_days = derive_hold_days(conditions, post.etf_days)
    terms_status = bonus.terms_status
    if bonus.offer_url is None and terms_status is None:
        terms_status = "none"
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
        enriched_at=today,
        post_modified=post.post_modified,
        conditions=conditions,
        hold_days=hold_days,
        terms_status=terms_status,
    )


def needs_enrich(bonus: Bonus, today: date) -> bool:
    if not bonus.enriched or bonus.enriched_at is None:
        return True
    return bonus.enriched_at < today - timedelta(days=RE_ENRICH_DAYS)

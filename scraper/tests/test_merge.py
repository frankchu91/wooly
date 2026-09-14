from datetime import date, timedelta

from woolly_scraper.merge import apply_post, merge_list, needs_enrich, slug
from woolly_scraper.models import ListEntry, PostData

TODAY = date(2026, 9, 13)


def entry(**kw):
    base = {
        "title": "Wells Fargo $500 Checking Bonus",
        "section": "checking",
        "summary": "s",
        "doc_url": "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/",
        "offer_url": None,
        "bonus_min": 500,
        "bonus_max": 500,
        "states": [],
        "dd_required": True,
        "dd_amount": 1000,
        "pull": "soft",
        "cc_funding": None,
    }
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

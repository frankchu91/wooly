import dataclasses
from datetime import date, timedelta

from woolly_scraper.merge import apply_post, assign_ids, merge_list, needs_enrich, slug
from woolly_scraper.models import Condition, ListEntry, PostData

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


def test_business_entry_naming_states_is_not_nationwide():
    # DoC files some state-limited offers under Business/Checking; the states in the
    # title win over the section heading.
    e = entry(title="Hancock Whitney $500 Checking Bonus – LA, MS, FL, AL, TX", section="business",
              states=["LA", "MS", "FL", "AL", "TX"], doc_url="https://www.doctorofcredit.com/hw/")
    b = merge_list([], [e], TODAY)[0]
    assert b.nationwide is False and b.states == ["LA", "MS", "FL", "AL", "TX"]


def test_refresh_corrects_a_stored_nationwide_once_states_are_known():
    # An older run stored the entry as nationwide (same section, no states); the next
    # run, now extracting states from the title, must overwrite that, not keep it.
    old = merge_list([], [entry(title="Hancock Whitney $500 Checking Bonus – LA, MS", section="business",
                                doc_url="https://www.doctorofcredit.com/hw/")], TODAY - timedelta(days=1))[0]
    assert old.nationwide is True
    fresh = entry(title="Hancock Whitney $500 Checking Bonus – LA, MS", section="business",
                  states=["LA", "MS"], doc_url="https://www.doctorofcredit.com/hw/")
    b = merge_list([old], [fresh], TODAY)[0]
    assert b.nationwide is False and b.states == ["LA", "MS"]


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


def test_merge_drops_stale_record_when_slug_splits_into_sections():
    # a slug that used to collapse to a plain id now spans two sections; the old
    # plain-id record must not linger as a stray duplicate alongside the split ones
    doc_url = "https://www.doctorofcredit.com/citi-325-475/"
    old = merge_list([], [entry(title="Citi $325/$475", doc_url=doc_url)], TODAY - timedelta(days=1))[0]
    checking = entry(title="Citi $325 Checking", section="checking", doc_url=doc_url, bonus_max=325)
    savings = entry(title="Citi $475 Savings", section="savings", doc_url=doc_url, bonus_max=475)
    out = merge_list([old], [checking, savings], TODAY)
    ids = {b.id for b in out}
    assert ids == {"citi-325-475--checking", "citi-325-475--savings"}


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
    out = apply_post(b, p, TODAY)
    assert out.bonus_max == 500          # list page wins
    assert out.pull == "soft"            # list page wins when known
    assert out.dd_amount == 1000         # list page had None → filled
    assert out.dd_deadline_days == 90 and out.anti_churn_months == 12
    assert out.expiration == date(2026, 10, 6) and out.monthly_fee_amount == 15
    assert out.enriched is True and out.post_modified == date(2026, 8, 23)
    assert out.enriched_at == TODAY


def test_apply_post_fills_states_for_state_section_when_list_had_none():
    e = entry(title="Some Bank $200", section="state", states=[], doc_url="https://www.doctorofcredit.com/some/")
    b = merge_list([], [e], TODAY)[0]
    out = apply_post(b, PostData(states=["CA"], nationwide=False), TODAY)
    assert out.states == ["CA"] and out.nationwide is False


def test_apply_post_preserves_bank_conditions_and_replaces_doc_conditions():
    b = merge_list([], [entry()], TODAY)[0]
    bank_c = Condition(kind="fee", text="A $5 monthly service fee from the bank's own terms page", source="bank")
    old_doc_c = Condition(kind="other", text="Some stale doc condition from a prior enrichment run", source="doc")
    b = dataclasses.replace(b, conditions=[old_doc_c, bank_c])
    new_doc_c = Condition(kind="new_customer", text="Offer is for new consumer checking customers only", source="doc")
    out = apply_post(b, PostData(conditions=[new_doc_c]), TODAY)
    assert out.conditions == [new_doc_c, bank_c]  # fresh doc conditions replace stale ones; bank ones survive


def test_apply_post_dedupes_conditions_by_id():
    b = merge_list([], [entry()], TODAY)[0]
    c = Condition(kind="fee", text="A $5 monthly service fee", source="bank")
    b = dataclasses.replace(b, conditions=[c])
    same_id_doc_c = Condition(kind="fee", text="A $5 monthly service fee", source="doc")
    out = apply_post(b, PostData(conditions=[same_id_doc_c]), TODAY)
    assert len(out.conditions) == 1
    assert out.conditions[0].source == "doc"  # doc conditions are listed first, so they win the dedupe


def test_apply_post_hold_days_prefers_keep_open_condition_over_etf_days():
    b = merge_list([], [entry()], TODAY)[0]
    keep_open = Condition(kind="keep_open", text="Account must be kept open for 180 days", days=180, source="doc")
    out = apply_post(b, PostData(conditions=[keep_open], etf_days=90), TODAY)
    assert out.hold_days == 180


def test_apply_post_hold_days_falls_back_to_etf_days_without_keep_open_condition():
    b = merge_list([], [entry()], TODAY)[0]
    out = apply_post(b, PostData(etf_days=60), TODAY)
    assert out.hold_days == 60


def test_apply_post_hold_days_none_when_neither_present():
    b = merge_list([], [entry()], TODAY)[0]
    out = apply_post(b, PostData(), TODAY)
    assert out.hold_days is None


def test_apply_post_sets_terms_status_none_when_no_offer_url_and_unset():
    b = merge_list([], [entry(offer_url=None)], TODAY)[0]
    assert b.terms_status == "none"  # already set at creation by merge_list/_from_entry
    b = dataclasses.replace(b, terms_status=None)  # simulate a pre-existing record without the field
    out = apply_post(b, PostData(), TODAY)
    assert out.terms_status == "none"


def test_from_entry_sets_terms_status_none_without_offer_url_else_null():
    with_url = merge_list([], [entry(offer_url="https://bank.example/offer")], TODAY)[0]
    without_url = merge_list([], [entry(offer_url=None, doc_url="https://www.doctorofcredit.com/other/")], TODAY)[0]
    assert with_url.terms_status is None
    assert without_url.terms_status == "none"


def test_needs_enrich():
    b = merge_list([], [entry()], TODAY)[0]
    assert needs_enrich(b, TODAY)
    b.enriched = True
    b.enriched_at = TODAY
    assert not needs_enrich(b, TODAY)


def test_needs_enrich_respects_re_enrich_window():
    b = merge_list([], [entry()], TODAY)[0]
    b.enriched = True
    b.enriched_at = TODAY - timedelta(days=29)
    assert not needs_enrich(b, TODAY)
    b.enriched_at = TODAY - timedelta(days=31)
    assert needs_enrich(b, TODAY)


def test_assign_ids_unique_slug_keeps_plain_id():
    e = entry()
    assert assign_ids([e]) == [("wells-fargo-500-checking-bonus", e)]


def test_assign_ids_same_slug_different_sections_split_by_section():
    doc_url = "https://www.doctorofcredit.com/citi-325-475/"
    checking = entry(title="Citi $325 Checking", section="checking", doc_url=doc_url, bonus_max=325)
    savings = entry(title="Citi $475 Savings", section="savings", doc_url=doc_url, bonus_max=475)
    out = dict(assign_ids([checking, savings]))
    assert set(out) == {"citi-325-475--checking", "citi-325-475--savings"}
    assert out["citi-325-475--checking"] is checking
    assert out["citi-325-475--savings"] is savings


def test_assign_ids_same_slug_same_section_keeps_highest_bonus():
    doc_url = "https://www.doctorofcredit.com/some-bank/"
    low = entry(title="Some Bank $100", section="checking", doc_url=doc_url, bonus_max=100)
    high = entry(title="Some Bank $200", section="checking", doc_url=doc_url, bonus_max=200)
    out = assign_ids([low, high])
    assert out == [("some-bank", high)]

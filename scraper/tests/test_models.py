from datetime import date

from woolly_scraper.models import Bonus, Condition


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
        enriched_at=date(2026, 9, 1),
        post_modified=date(2026, 8, 23),
        last_seen=date(2026, 9, 13),
        conditions=[
            Condition(kind="direct_deposit", text="Direct deposit of $1000", amount=1000, days=90, source="doc"),
            Condition(
                kind="new_customer",
                text="Offer is for new consumer checking customers only",
                source="bank",
            ),
        ],
        hold_days=90,
        terms_status="ok",
        terms_url="https://accountoffers.wellsfargo.com/offerbonus/",
        terms_fetched_at=date(2026, 9, 10),
    )
    d = b.to_dict()
    assert d["dd"] == {"required": True, "amount": 1000, "deadline_days": 90}
    assert d["availability"] == {"nationwide": True, "states": []}
    assert d["monthly_fee"] == {"amount": 15, "avoidable": True}
    assert d["etf"] is None
    assert d["expiration"] == "2026-10-06"
    assert d["enriched_at"] == "2026-09-01"
    assert d["hold_days"] == 90
    assert d["terms"] == {
        "status": "ok",
        "url": "https://accountoffers.wellsfargo.com/offerbonus/",
        "fetched_at": "2026-09-10",
    }
    assert [c["kind"] for c in d["conditions"]] == ["direct_deposit", "new_customer"]
    assert all("id" in c and len(c["id"]) == 8 for c in d["conditions"])
    assert Bonus.from_dict(d) == b


def test_bonus_terms_defaults_to_none_status_without_key():
    b = Bonus.from_dict({
        "id": "x", "bank": "X", "title": "X $100", "section": "checking",
        "doc_url": "https://www.doctorofcredit.com/x/", "last_seen": "2026-09-13",
    })
    assert b.terms_status is None and b.terms_url is None and b.terms_fetched_at is None
    assert b.conditions == [] and b.hold_days is None
    assert b.to_dict()["terms"] == {"status": None, "url": None, "fetched_at": None}


def test_bonus_from_dict_tolerates_missing_keys():
    b = Bonus.from_dict({
        "id": "x", "bank": "X", "title": "X $100", "section": "checking",
        "doc_url": "https://www.doctorofcredit.com/x/", "last_seen": "2026-09-13",
    })
    assert b.dd_required is None and b.expiration is None and b.enriched is False


def test_bonus_from_dict_requires_last_seen():
    import pytest
    with pytest.raises(KeyError):
        Bonus.from_dict({
            "id": "x", "bank": "X", "title": "X $100", "section": "checking",
            "doc_url": "https://www.doctorofcredit.com/x/",
        })

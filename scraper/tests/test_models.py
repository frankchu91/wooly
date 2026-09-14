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

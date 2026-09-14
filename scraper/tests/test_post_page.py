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

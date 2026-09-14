from datetime import date
from pathlib import Path

import pytest

from woolly_scraper.post_page import parse_post

FIX = Path(__file__).parent / "fixtures"
TODAY = date(2026, 9, 13)


def load(name):
    return (FIX / name).read_text(encoding="utf-8", errors="ignore")


def glance_html(*pairs: tuple[str, str]) -> str:
    """Minimal synthetic 'Offer at a glance' block: one <li><strong>Label: </strong>value</li>
    per (label, value) pair, matching the real DoC markup structure post_page.py parses."""
    items = "".join(f"<li><strong>{label}: </strong>{value}</li>" for label, value in pairs)
    return f"<html><body><div class='entry-content'><ul>{items}</ul></div></body></html>"


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


@pytest.mark.parametrize(
    "pull_text, expected",
    [
        ("Hard pull", "hard"),
        ("Unknown if hard/soft pull", "unknown"),
        ("Mixed datapoints", "unknown"),
        ("Hard or soft", None),  # ambiguous, no "unknown"/"mixed" keyword: never guess
    ],
)
def test_pull_classification(pull_text, expected):
    html = glance_html(("Maximum bonus amount", "$100"), ("Hard/soft pull", pull_text))
    p = parse_post(html, TODAY)
    assert p.pull == expected


def test_pull_missing_label_is_none():
    html = glance_html(("Maximum bonus amount", "$100"))
    p = parse_post(html, TODAY)
    assert p.pull is None


def test_monthly_fee_none_leaves_amount_unset():
    html = glance_html(("Maximum bonus amount", "$100"), ("Monthly fees", "None"))
    p = parse_post(html, TODAY)
    assert p.monthly_fee_amount is None


def test_etf_none_leaves_amount_unset():
    html = glance_html(
        ("Maximum bonus amount", "$100"), ("Early account termination fee", "None")
    )
    p = parse_post(html, TODAY)
    assert p.etf_amount is None


def test_monthly_fee_amount_and_avoidable_parsed():
    html = glance_html(("Maximum bonus amount", "$100"), ("Monthly fees", "$15, avoidable"))
    p = parse_post(html, TODAY)
    assert p.monthly_fee_amount == 15
    assert p.monthly_fee_avoidable is True

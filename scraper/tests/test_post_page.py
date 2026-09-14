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


def test_wells_fargo_conditions():
    p = parse_post(load("post-wells-fargo-500.html"), TODAY)
    assert len(p.conditions) >= 2
    assert all(c.source == "doc" for c in p.conditions)
    dd = next(c for c in p.conditions if c.kind == "direct_deposit" and c.amount == 1000)
    assert dd.days == 90
    assert any(c.kind == "new_customer" for c in p.conditions)
    ids = [c.id for c in p.conditions]
    assert len(ids) == len(set(ids))  # extraction already dedupes by id
    # nothing derived from the "$500 bonus" figure, and no negated/boilerplate sentence
    assert all(c.amount != 500 for c in p.conditions)
    assert all("does not count" not in c.text for c in p.conditions)


def test_wells_fargo_conditions_pinned_set():
    # Pinned after the round-1 review fixes (negation gate, deposit amount skips the
    # reward figure, tighter new_customer/transactions/balance patterns): the glance
    # direct_deposit, the fine-print "deposit" sentence (same $1,000/90 days figures,
    # via "electronic deposits" wording), and one new_customer sentence — nothing else.
    p = parse_post(load("post-wells-fargo-500.html"), TODAY)
    got = sorted((c.kind, c.amount, c.days) for c in p.conditions)
    expected = sorted(
        [
            ("direct_deposit", 1000, 90),
            ("deposit", 1000, 90),
            ("new_customer", None, None),
        ]
    )
    assert got == expected
    assert all("does not count" not in c.text for c in p.conditions)


def test_stanford_fcu_conditions_include_keep_open_from_etf():
    p = parse_post(load("post-stanford-fcu.html"), TODAY)
    assert any(c.kind == "keep_open" and c.days == 90 for c in p.conditions)
    dd = next(c for c in p.conditions if c.kind == "direct_deposit")
    assert dd.amount == 500


def test_missing_fine_print_heading_falls_back_to_whole_body():
    html = (
        "<html><body><div class='entry-content'><ul>"
        "<li><strong>Maximum bonus amount: </strong>$100.</li>"
        "</ul>"
        "<p>Offer is for new consumer checking customers only and excludes existing account holders "
        "entirely, no exceptions of any kind whatsoever will be made for anyone.</p>"
        "</div></body></html>"
    )
    p = parse_post(html, TODAY)
    assert any(c.kind == "new_customer" for c in p.conditions)


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


@pytest.mark.parametrize(
    "value, expected_amount, expected_avoidable",
    [
        ("None", 0, True),  # a literal "None" is a value, not a guess
        ("None listed", None, False),  # more text after "None" => stays unresolved
        ("None mentioned", None, False),
        ("None, don't close account straight away please", None, False),
    ],
)
def test_monthly_fee_none_values(value, expected_amount, expected_avoidable):
    html = glance_html(("Maximum bonus amount", "$100"), ("Monthly fees", value))
    p = parse_post(html, TODAY)
    assert p.monthly_fee_amount == expected_amount
    assert p.monthly_fee_avoidable == expected_avoidable


@pytest.mark.parametrize(
    "value, expected_amount",
    [
        ("None", 0),
        ("None listed", None),
        ("None, don't close account straight away please", None),
    ],
)
def test_etf_none_values(value, expected_amount):
    html = glance_html(("Maximum bonus amount", "$100"), ("Early account termination fee", value))
    p = parse_post(html, TODAY)
    assert p.etf_amount == expected_amount


@pytest.mark.parametrize(
    "value",
    [
        "None",
        "None.",
        "See below",
        "see below.",
        "Yes, see below",
        "Yes see options below",
        "N/A",
    ],
)
def test_additional_requirements_pointer_values_are_not_conditions(value):
    """X3: "See below" points at the post body; carried through it becomes a checklist row
    that asks the user to do nothing."""
    html = glance_html(("Maximum bonus amount", "$100"), ("Additional requirements", value))
    p = parse_post(html, TODAY)
    assert p.additional_requirements == value  # the raw glance value is still recorded
    assert not any(c.kind == "other" for c in p.conditions)


def test_additional_requirements_real_value_is_still_a_condition():
    html = glance_html(
        ("Maximum bonus amount", "$100"),
        ("Additional requirements", "Deposit $10,000 in new to Chase funds"),
    )
    p = parse_post(html, TODAY)
    other = next(c for c in p.conditions if c.kind == "other")
    assert other.text == "Deposit $10,000 in new to Chase funds"


def test_glance_value_spacing_tidied():
    html = (
        "<html><body><div class='entry-content'><ul>"
        "<li><strong>Maximum bonus amount: </strong>$100</li>"
        "<li><strong>ChexSystems: </strong>Unknown<a>, sensitive</a> ( not in branch )</li>"
        "</ul></div></body></html>"
    )
    p = parse_post(html, TODAY)
    assert p.chexsystems == "Unknown, sensitive (not in branch)"


def test_monthly_fee_amount_and_avoidable_parsed():
    html = glance_html(("Maximum bonus amount", "$100"), ("Monthly fees", "$15, avoidable"))
    p = parse_post(html, TODAY)
    assert p.monthly_fee_amount == 15
    assert p.monthly_fee_avoidable is True

from pathlib import Path

import pytest

from woolly_scraper.list_page import parse_list_page

FIX = Path(__file__).parent / "fixtures" / "best-bank-account-bonuses.html"


@pytest.fixture(scope="module")
def entries():
    return parse_list_page(FIX.read_text(encoding="utf-8", errors="ignore"))


def test_entry_count_and_sections(entries):
    assert len(entries) >= 240
    sections = {e.section for e in entries}
    assert sections == {"checking", "savings", "business", "state", "regional"}


def test_wells_fargo_entry(entries):
    wf = next(e for e in entries if e.title.startswith("Wells Fargo $500"))
    assert wf.section == "checking"
    assert wf.doc_url == "https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/"
    assert wf.offer_url and wf.offer_url.startswith("http") and "doctorofcredit.com" not in wf.offer_url
    assert (wf.bonus_min, wf.bonus_max) == (500, 500)
    assert wf.pull == "soft"
    assert wf.dd_required is True
    assert wf.dd_amount == 1000
    assert wf.cc_funding and "no" in wf.cc_funding.lower()
    assert wf.states == []


def test_chase_entry_has_range(entries):
    ch = next(e for e in entries if e.title.startswith("Chase $300-$400"))
    assert (ch.bonus_min, ch.bonus_max) == (300, 400)
    assert ch.dd_required is True and ch.dd_amount is None  # "no minimum"


def test_state_entry_states(entries):
    e = next(x for x in entries if x.title.startswith("Eastern Bank $750"))
    assert e.section == "state"
    assert e.states == ["MA", "NH", "ME", "RI"]


def test_business_entry_naming_states_carries_them(entries):
    # Filed under Business on DoC, but the title limits it to five states.
    e = next(x for x in entries if x.title.startswith("Hancock Whitney $500"))
    assert e.section == "business"
    assert e.states == ["LA", "MS", "FL", "AL", "TX"]


def test_no_dd_entry(entries):
    e = next(x for x in entries if "4Front" in x.title)
    assert e.dd_required is False


def test_every_entry_has_doc_url(entries):
    assert all(e.doc_url.startswith("https://www.doctorofcredit.com/") for e in entries)
    assert all(e.summary for e in entries)


def test_ambiguous_pull_chip_is_unknown(entries):
    e = next(x for x in entries if x.title.startswith("e*Trade $400 Savings Bonus"))
    assert e.pull == "unknown"


def test_mixed_pull_chip_is_unknown(entries):
    e = next(x for x in entries if "Numerica Credit Union" in x.title)
    assert e.pull == "unknown"


def test_summary_strips_direct_link_prefix_case_insensitively():
    html = (
        '<html><div class="entry-content">'
        "<h2>Best Checking Account Bonuses</h2>"
        "<h3>Test Bank $100 Checking Bonus</h3>"
        '<p><a href="https://offer.example.com/x">Direct Link to offer</a></p>'
        "<p>Some benefit description.</p>"
        '<ul><li><a href="https://www.doctorofcredit.com/test-bank/">Read our full post</a></li></ul>'
        "</div></html>"
    )
    entries = parse_list_page(html)
    assert entries[0].summary == "Some benefit description."

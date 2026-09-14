from datetime import date

from woolly_scraper.text import (
    extract_states,
    normalize_bank,
    parse_date,
    parse_money,
    parse_money_range,
)


def test_parse_money():
    assert parse_money("$1,000") == 1000
    assert parse_money("Requires $500 direct deposit") == 500
    assert parse_money("None") is None


def test_parse_money_range():
    assert parse_money_range("Chase $300-$400 ($900 With Savings)") == (300, 400)
    assert parse_money_range("Wells Fargo $500 Checking Bonus") == (500, 500)
    assert parse_money_range("Capital One Up To $1,500 Bonus") == (1500, 1500)
    assert parse_money_range("United Debit Card 10,000 Miles") == (None, None)


def test_extract_states():
    assert extract_states("Eastern Bank $750 Checking/Savings Bonus – MA, NH, ME, RI") == ["MA", "NH", "ME", "RI"]
    assert extract_states("Stanford Federal Credit Union $620 – CA") == ["CA"]
    assert extract_states("PSECU $300 Checking Bonus") == []
    # words that look like codes but are not trailing state lists are ignored
    assert extract_states("Chase $300-$400 ($900 With Savings)") == []
    assert extract_states("4Front Credit Union $400 – MI – Direct Deposit Not Required") == ["MI"]
    assert extract_states("Availability: Nationwide") == []
    assert extract_states("Availability: CA, NV only") == ["CA", "NV"]
    # a code repeated once in list context and once outside it: only the list
    # occurrence counts
    assert extract_states("IN Bank $200 Checking Bonus – IN, KY") == ["IN", "KY"]
    # no list context at all, even though the code appears twice
    assert extract_states("Bank of MA $100 for MA residents") == []
    # joiners other than comma/dash must also be recognised
    assert extract_states("iTHINK Financial $300 – FL & GA") == ["FL", "GA"]
    assert extract_states("Truist $400 – AL, GA, WV or DC") == ["AL", "GA", "WV", "DC"]
    assert extract_states("Sunflower Bank $300 – KS & CO and TX") == ["KS", "CO", "TX"]


def test_normalize_bank():
    assert normalize_bank("Wells Fargo $500 Checking Bonus") == "Wells Fargo"
    assert normalize_bank("Chase $300-$400 ($900 With Savings)") == "Chase"
    assert normalize_bank("Capital One Up To $1,500 Bonus") == "Capital One"
    assert normalize_bank("U.S. Bank $450") == "US Bank"
    assert normalize_bank("BMO Harris $400 Checking Bonus") == "BMO"
    assert normalize_bank("Stanford Federal Credit Union $620 – CA") == "Stanford Federal Credit Union"
    assert normalize_bank("Percapita (Fintech) $300 Checking Bonus ($25 Per Month), Direct Deposit Not Required") == "Percapita"
    assert normalize_bank("SoFi Checking & Savings $675 Signup Bonus") == "SoFi"
    # "Savings"/"Checking" that's part of the bank's own name isn't a cut point
    assert normalize_bank("Union Savings Bank $200 Checking Bonus") == "Union Savings Bank"


def test_parse_date():
    assert parse_date("October 6, 2026") == date(2026, 10, 6)
    assert parse_date("December 31st, 2019") == date(2019, 12, 31)
    assert parse_date("Extended till 1/31/25") == date(2025, 1, 31)
    assert parse_date("None") is None
    assert parse_date("") is None

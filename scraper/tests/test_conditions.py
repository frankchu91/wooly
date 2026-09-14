import pytest

from woolly_scraper.conditions import classify_sentence, extract_conditions, split_sentences
from woolly_scraper.models import Condition

WF_DD_SENTENCE = (
    "Receive a total of $1,000 or more in qualifying direct deposits to the new checking "
    "account within 90 calendar days from account opening (the qualification period)"
)


@pytest.mark.parametrize(
    "text, kind, amount, days, count",
    [
        (WF_DD_SENTENCE, "direct_deposit", 1000, 90, None),
        ("Account must be kept open for three months", "keep_open", None, 90, None),
        ("$12 monthly maintenance fee", "fee", 12, None, None),
        ("Offer is for new consumer checking customers only", "new_customer", None, None, None),
        ("Make at least 2 qualifying direct deposits totaling $500", "direct_deposit", 500, None, 2),
        ("Complete 5 debit card transactions within 60 days of account opening", "transactions", None, 60, 5),
        ("Deposit $300 in new funds within 30 days of account opening", "deposit", 300, 30, None),
        ("Maintain a minimum balance of $1,500 to avoid the monthly fee", "balance", 1500, None, None),
        ("There is a $25 fee if you close the account within 180 days of opening", "fee", 25, 180, None),
        ("This bonus is not available to customers who previously held an account here", "new_customer", None, None, None),
        (
            "You must use your debit card for at least one qualifying purchase each statement cycle",
            "transactions",
            None,
            None,
            None,
        ),
    ],
)
def test_classify_sentence_kinds(text, kind, amount, days, count):
    c = classify_sentence(text, "doc")
    assert c is not None
    assert c.kind == kind
    assert c.amount == amount
    assert c.days == days
    assert c.count == count
    assert c.source == "doc"
    assert c.text == text


def test_classify_sentence_marketing_returns_none():
    text = "This is one of the best bank bonuses we have seen all year, so act fast before it disappears."
    assert classify_sentence(text, "doc") is None


# --- Round-1 review fixes: negation/exclusion, amount selection, new_customer/
# transactions/balance context requirements. Regression cases below. ---


def test_classify_sentence_negated_direct_deposit_sentence_returns_none():
    text = (
        "An ACH direct deposit made available early with Early Pay Day does not count toward the bonus "
        "requirements until it posts to your account and is no longer pending (e.g., scheduled payment date)."
    )
    assert classify_sentence(text, "doc") is None


@pytest.mark.parametrize(
    "text",
    [
        "This offer is not eligible for customers who already hold a checking account with us today.",
        "Offer cannot be reproduced, purchased, sold, transferred, or traded under any circumstances.",
        "We may close accounts with a zero balance without prior notice at our sole discretion.",
        "Existing account holders and closed accounts are excluded from this particular promotion entirely.",
    ],
)
def test_classify_sentence_negation_and_boilerplate_returns_none(text):
    assert classify_sentence(text, "doc") is None


def test_classify_sentence_deposit_amount_skips_bonus_figure():
    text = (
        "To receive the $500 bonus: you must use your bonus offer code when opening a new Wells Fargo "
        "consumer checking account, which is subject to approval, by October 6, 2026 and receive $1,000 "
        "or more in qualifying electronic deposits within 90 calendar days of account opening."
    )
    c = classify_sentence(text, "doc")
    assert c is not None
    assert c.kind == "deposit"
    assert c.amount == 1000
    assert c.days == 90


def test_classify_sentence_deposit_amount_none_when_only_bonus_figure_present():
    text = "You will receive the $500 bonus once all qualifying deposit requirements have been met in full."
    c = classify_sentence(text, "doc")
    assert c is not None
    assert c.amount is None


def test_classify_sentence_new_customer_previously_used_as_time_word_returns_none():
    text = "This rate was previously higher before the bank changed its promotional pricing structure again."
    assert classify_sentence(text, "doc") is None


def test_classify_sentence_transactions_and_balance_require_a_requirement_verb():
    # bare "purchase"/"balance" mentions with no requirement verb nearby are not conditions
    assert classify_sentence(
        "We may close accounts with a zero balance without prior notice.", "doc"
    ) is None
    c = classify_sentence("You must make at least 3 qualifying transactions with your debit card each month.", "doc")
    assert c is not None and c.kind == "transactions" and c.count == 3


def test_classify_sentence_empty_returns_none():
    assert classify_sentence("", "doc") is None


def test_condition_id_is_stable_and_based_on_kind_and_normalised_text():
    a = classify_sentence(WF_DD_SENTENCE, "doc")
    b = classify_sentence(WF_DD_SENTENCE + ".", "doc")  # trailing punctuation shouldn't change id
    assert a.id == b.id
    assert len(a.id) == 8


def test_split_sentences_splits_on_period_semicolon_bang_and_bullets():
    text = (
        "This sentence is definitely long enough to survive the forty character minimum. "
        "This one too is plenty long to survive that same forty character floor; "
        "Short.\n"
        "- A bulleted requirement that is long enough to clear the forty character minimum needed"
    )
    sentences = split_sentences(text)
    assert len(sentences) == 3
    assert all(40 <= len(s) <= 400 for s in sentences)
    assert "Short." not in sentences


def test_split_sentences_drops_too_short_and_too_long_fragments():
    short = "Too short."
    long_ = "N " * 250  # far past 400 chars once joined
    text = f"{short} This is a normal length sentence that should be kept in the output. {long_}."
    sentences = split_sentences(text)
    assert len(sentences) == 1
    assert sentences[0] == "This is a normal length sentence that should be kept in the output."


def test_split_sentences_empty_text():
    assert split_sentences("") == []
    assert split_sentences(None) == []


def test_extract_conditions_dedupes_by_id_and_preserves_order():
    text = (
        "Offer is for new consumer checking customers only and is limited to one account per household. "
        "This bonus is not available to customers who previously received one within the past year. "
        "Offer is for new consumer checking customers only and is limited to one account per household."
    )
    conditions = extract_conditions(text, "doc")
    assert [c.kind for c in conditions] == ["new_customer", "new_customer"]
    ids = [c.id for c in conditions]
    assert len(ids) == len(set(ids))


def test_extract_conditions_caps_results():
    sentence = "You must maintain a minimum balance of $100 to avoid any monthly maintenance fee here. "
    variants = [sentence.replace("$100", f"${100 + i}") for i in range(20)]
    text = " ".join(variants)
    conditions = extract_conditions(text, "doc", cap=12)
    assert len(conditions) == 12


def test_extract_conditions_ignores_non_matching_sentences():
    text = (
        "This is one of the best bank bonuses we have seen all year, so act fast right now. "
        "Offer is for new consumer checking customers only and is limited to one account per household."
    )
    conditions = extract_conditions(text, "doc")
    assert len(conditions) == 1
    assert conditions[0].kind == "new_customer"


def test_extract_conditions_sets_source():
    text = "This bonus is not available to customers who previously received one within the past year."
    conditions = extract_conditions(text, "bank")
    assert conditions[0].source == "bank"


def test_condition_to_dict_from_dict_roundtrip():
    c = Condition(kind="fee", text="$12 monthly maintenance fee", amount=12, days=None, count=None, source="doc")
    d = c.to_dict()
    assert next(iter(d.keys())) == "id"
    assert d["kind"] == "fee" and d["amount"] == 12 and d["source"] == "doc"
    restored = Condition.from_dict({**d, "id": "not-the-real-id"})
    assert restored.id == c.id
    assert restored == c

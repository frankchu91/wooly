import pytest

from woolly_scraper.conditions import (
    _parse_amount,
    classify_sentence,
    extract_conditions,
    normalize_sentence,
    split_sentences,
)
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
        # A fee waiver, not a bonus requirement (round 2, rule A4) — the $1,500 is the
        # waiver threshold, so it is deliberately not carried as the condition's amount.
        ("Maintain a minimum balance of $1,500 to avoid the monthly fee", "fee", None, None, None),
        ("Maintain a minimum daily balance of $1,500 in the account", "balance", 1500, None, None),
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


# --- Round-2 review fixes (controller UX walkthrough): A1 money spacing, A2 leading
# markers, A3 pointer sentences, A4 fee waivers, A7 negated keep-open. ---


def test_normalize_sentence_collapses_split_money_figures():
    # A1: "$ 500" is one figure, and the reward-figure skip only sees it as one if the
    # gap is closed before classification.
    assert normalize_sentence("Get a $ 500 bonus for opening") == "Get a $500 bonus for opening"


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("* How to qualify for this offer", "How to qualify for this offer"),
        ("** The monthly service fee is $15", "The monthly service fee is $15"),
        ("2 Deposit Make $1,000 in deposits", "Deposit Make $1,000 in deposits"),
        ("• Keep the account open for 90 days", "Keep the account open for 90 days"),
        ("- Receive a direct deposit", "Receive a direct deposit"),
        ("– Receive a direct deposit", "Receive a direct deposit"),
        # not a marker: a figure that opens a real sentence keeps its place
        ("90 days from account opening", "90 days from account opening"),
    ],
)
def test_normalize_sentence_strips_leading_markers(raw, expected):
    assert normalize_sentence(raw) == expected


def test_classify_sentence_normalises_before_classifying():
    c = classify_sentence(
        "2 Deposit Make $ 1,000 or more in qualifying direct deposits within 90 days.", "bank"
    )
    assert c is not None
    assert c.text.startswith("Deposit Make $1,000")
    assert c.kind == "direct_deposit" and c.amount == 1000 and c.days == 90


@pytest.mark.parametrize(
    "text",
    [
        "Learn how to avoid the $15 monthly service fee on this checking account today.",
        'Talk with a banker or see the "Consumer Account Fee and Information Schedule" for details.',
        "See the Deposit Account Agreement for the full terms that apply to this account.",
        "Visit a branch to open your new checking account and claim the bonus offer today.",
        "Call us at the number on the back of your card to set up your direct deposit.",
        "Ask a banker about the qualifying direct deposit requirement for this bonus offer.",
        "Contact your employer's payroll department to route your direct deposit here.",
        "For more information about the bonus requirements, read the full offer terms.",
        "Please read the terms at wellsfargo.com for complete checking account details today.",
        "The actions required for this bonus are separate from the actions to avoid the fee.",
        "On the last business day of each fee period balances in eligible accounts are totaled.",
        "Balances in eligible accounts will be automatically totaled at the end of the period.",
    ],
)
def test_classify_sentence_pointer_and_informational_returns_none(text):
    assert classify_sentence(text, "bank") is None


def test_classify_sentence_fee_waiver_with_balance_words_is_a_fee():
    text = (
        "The monthly service fee can be avoided with one of the following each fee period: "
        "$1,500 minimum daily balance."
    )
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "fee"  # not "balance" — the $1,500 is a waiver route, not a task
    assert c.amount is None


def test_classify_sentence_fee_waiver_carries_the_fee_amount_when_stated():
    text = "The $15 monthly service fee is waived if you keep qualifying deposit balances."
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "fee" and c.amount == 15


def test_classify_sentence_plain_fee_sentence_keeps_its_amount():
    # No avoid/waive wording, so A4 never fires and the ordinary fee rule applies.
    c = classify_sentence("There is a $25 fee if you close the account in month one.", "bank")
    assert c is not None and c.kind == "fee" and c.amount == 25


@pytest.mark.parametrize(
    "text, days",
    [
        ("The bonus will not be paid if the account is closed within 90 days of opening.", 90),
        ("You forfeit the bonus if the account is closed before 180 days have passed.", 180),
        ("You will not receive the bonus if closure happens in the first 60 days here.", 60),
        ("You lose the bonus entirely if the account is closed within 120 days of opening.", 120),
    ],
)
def test_classify_sentence_negated_keep_open_becomes_a_keep_open_condition(text, days):
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "keep_open"
    assert c.days == days


def test_classify_sentence_close_window_without_forfeit_wording_is_not_keep_open():
    # A fee for closing early is a fee, not a keep-open requirement.
    c = classify_sentence(
        "There is a $25 fee if you close the account within 180 days of opening.", "doc"
    )
    assert c is not None and c.kind == "fee" and c.amount == 25


def test_classify_sentence_empty_returns_none():
    assert classify_sentence("", "doc") is None


# --- Round-2, second pass (controller walkthrough after the web split landed):
# F1 parenthesised/spelled-out days, F2 footnote stripping, F3 the "or <word>" count
# join. ---


@pytest.mark.parametrize(
    "text, days",
    [
        # F1: the parenthesised figure is trusted even though a word precedes it.
        ("Receive a direct deposit within ninety (90) days of account opening today.", 90),
        # ...and even with no word in front of the parens at all.
        ("Receive a direct deposit within the (60) day qualification window here.", 60),
        # F1: spelled-out numbers beyond the old one..twelve list, up to ninety.
        ("Receive a direct deposit within thirty days of account opening for this offer.", 30),
        ("Receive a direct deposit within forty-five days of account opening for this offer.", 45),
        ("Receive a direct deposit within sixty days of account opening for this offer.", 60),
        ("Receive a direct deposit within ninety days of account opening for this offer.", 90),
    ],
)
def test_parse_days_parenthesised_and_spelled_out(text, days):
    c = classify_sentence(text, "doc")
    assert c is not None and c.days == days


def test_parse_days_prefers_the_parenthesised_figure_over_the_spelled_out_word():
    # The two disagree on purpose here, to pin which one wins.
    c = classify_sentence(
        "Receive a direct deposit within thirty (45) days of account opening for this offer.",
        "doc",
    )
    assert c is not None and c.days == 45


@pytest.mark.parametrize(
    "raw, expected",
    [
        # F2: a registered-mark glyph directly followed by a 1-2 digit footnote index.
        ("Zelle® 1 transactions from your new account", "Zelle transactions from your new account"),
        ("Bank of America™ 12 accounts are eligible", "Bank of America accounts are eligible"),
        # F2: a bare footnote index between a channel word and the next lowercase word.
        ("qualifying transactions 2 from your new account", "qualifying transactions from your new account"),
        ("qualifying deposits 3 into the new account", "qualifying deposits into the new account"),
        # both markers stacked on the same sentence.
        ("Zelle® 1 transactions 2 from your new account", "Zelle transactions from your new account"),
        # no footnote present: untouched.
        ("Zelle transactions from your new account", "Zelle transactions from your new account"),
    ],
)
def test_normalize_sentence_strips_footnote_markers(raw, expected):
    assert normalize_sentence(raw) == expected


def test_classify_sentence_footnote_index_no_longer_inflates_the_count():
    # Real Bank of America copy: the "1" is a footnote index on "Zelle®", not a count —
    # and with it gone, this sentence (the $100 offer's own blurb) names no transaction
    # count or day window, so it is correctly not a requirement at all.
    text = "Earn $100 cash offer with qualifying debit or Zelle® 1 transactions."
    assert classify_sentence(text, "bank") is None


def test_classify_sentence_or_word_join_count_survives_the_footnote_strip():
    # F2 + F3 together: the real Bank of America "Make at least 20..." sentence. Before
    # F2, the "2" footnote right after "transactions" would have been read as part of
    # the count's neighbourhood; before F3, the "or Zelle" join between the card type
    # and the keyword would have pushed the count past `_COUNT_RE`'s old 0-2 word cap.
    text = (
        "Make at least 20 qualifying debit card or Zelle® 1 transactions 2 from your "
        "new account within 60 days of account opening."
    )
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "transactions"
    assert c.count == 20
    assert c.days == 60
    assert "Zelle transactions from" in c.text


# --- Round 3: H1, the reward-figure skip looks 6 words ahead, not just at the next
# token, so a reward figure named a few words later (real Wells Fargo bank copy) is
# still recognised as the reward, not the requirement. ---


def test_classify_sentence_deposit_amount_skips_reward_figure_several_words_later():
    text = (
        "Get a $500 new checking customer bonus and make $1,000 or more in "
        "qualifying direct deposits within 90 days of account opening."
    )
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "direct_deposit"
    assert c.amount == 1000
    assert c.days == 90


def test_classify_sentence_deposit_amount_skips_reward_figure_immediately_before_bonus():
    text = (
        "As a new checking customer, enjoy a $500 bonus when you open a new "
        "account and make $1,000 or more in qualifying direct deposits within 90 days."
    )
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "direct_deposit"
    assert c.amount == 1000
    assert c.days == 90


def test_classify_sentence_real_wells_fargo_bank_sentence_takes_the_requirement_figure():
    # The real Wells Fargo bank-page sentence this rule was written for: two reward
    # mentions of $500 (one four words before "bonus", one immediately before it)
    # followed by the actual $1,000 direct deposit requirement.
    text = (
        "Get a $500 new checking customer bonus * As a new Wells Fargo checking "
        "customer, enjoy a $500 bonus when you open a new Everyday Checking account "
        "** and make $1,000 or more in qualifying direct deposits within 90 days of "
        "account opening."
    )
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "direct_deposit"
    assert c.amount == 1000
    assert c.days == 90


# --- Round 4 (tiny): H1's 6-word lookahead was too eager — a bare "cash"/"offer"
# anywhere nearby, or deposit phrasing right after the figure, wrongly nulled real
# deposit amounts on other bonuses. `_parse_amount` is tested directly (white-box) here
# because the six phrases below are fragments, not full requirement sentences — several
# would misclassify to a different `kind` through `classify_sentence` and never reach
# this amount-selection code at all. ---


@pytest.mark.parametrize(
    "text, amount",
    [
        # The reward is named a few words after the figure — still skipped.
        ("Get a $500 new checking customer bonus", None),
        ("enjoy a $500 bonus when you open", None),
        # Deposit phrasing right after the figure always wins, reward word or not.
        ("make $1,000 or more in qualifying direct deposits", 1000),
        # Bare "cash"/"offer" nearby is no longer a trigger on its own.
        ("$30,000 in cash deposits", 30000),
        ("$20,000 for this offer", 20000),
        # The word right before the figure (here, bridged over "totaling") names it as
        # the deposit figure regardless of what follows, even "...the bonus".
        ("deposit $2,500 to get the bonus", 2500),
    ],
)
def test_parse_amount_narrowed_reward_skip(text, amount):
    assert _parse_amount(text, "deposit") == amount


def test_classify_sentence_real_wells_fargo_bank_sentence_still_takes_the_requirement_figure():
    # Round 4 regression: the real WF sentence H1 was written for must still resolve to
    # the $1,000 requirement, not either $500 reward mention, under the narrowed rule.
    text = (
        "Get a $500 new checking customer bonus * As a new Wells Fargo checking "
        "customer, enjoy a $500 bonus when you open a new Everyday Checking account "
        "** and make $1,000 or more in qualifying direct deposits within 90 days of "
        "account opening."
    )
    c = classify_sentence(text, "bank")
    assert c is not None
    assert c.kind == "direct_deposit"
    assert c.amount == 1000
    assert c.days == 90


@pytest.mark.parametrize(
    "text, kind, amount",
    [
        # capital-one-500-1000-business-checking-bonus (condition 4ea04350): the $1,000
        # is the reward ("bonus" 4 words later); the $30,000 is the real deposit figure,
        # and "cash" in "(cash deposits..." no longer wrongly skips it.
        (
            (
                "To earn $1,000 bonus—1) Within 30 days of account opening, deposit at "
                "least $30,000 from an external source (cash deposits and funds sourced "
                "from an account with another financial institution that was not "
                "affiliated with Capital One prior to January 1, 2025, qualify;"
            ),
            "deposit",
            30000,
        ),
        # etrade-400-savings-bonus-requires-20k-deposit-4-intro-rate (2628b142): "of
        # $20,000" is the preceding-word rule; "offer" trailing the sentence no longer
        # matters since bare "offer" isn't a trigger and the preceding word wins first.
        (
            (
                "At the end of the Deposit Period, all net new funds will be totaled to "
                "determine whether you have satisfied the deposit requirement of $20,000 "
                "for this offer."
            ),
            "deposit",
            20000,
        ),
        # me-vt-nh-bar-harbor-bank-trust-300-checking-bonus (39c32d72): "deposits
        # totaling $2,500" is the bridged preceding-word rule; "to get the bonus" no
        # longer skips it.
        (
            (
                "Once the qualifying account is opened, make deposits totaling $2,500 by "
                "10/31/21 to get the bonus."
            ),
            "deposit",
            2500,
        ),
    ],
)
def test_classify_sentence_real_sentences_regain_their_deposit_amount(text, kind, amount):
    c = classify_sentence(text, "doc")
    assert c is not None
    assert c.kind == kind
    assert c.amount == amount


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

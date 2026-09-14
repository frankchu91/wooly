from pathlib import Path

import pytest
import requests

from woolly_scraper.models import Condition
from woolly_scraper.terms import (
    TermsFetcher,
    _has_leading_caps_run,
    _is_bank_noise,
    is_actionable,
    parse_terms_page,
)

FIX = Path(__file__).parent / "fixtures"


class FakeResp:
    def __init__(self, status, text, url=None):
        self.status_code = status
        self.text = text
        self.url = url  # None unless a test needs to simulate a redirect destination


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, headers=None, timeout=None):
        self.calls.append((url, headers, timeout))
        resp = self.responses.pop(0)
        if isinstance(resp, Exception):
            raise resp
        return resp


# --- parse_terms_page ---


def test_parse_terms_page_bank_of_america_fixture_yields_direct_deposit_and_others():
    html = (FIX / "terms-bank-of-america.html").read_text(encoding="utf-8", errors="ignore")
    conditions = parse_terms_page(html)
    assert len(conditions) >= 3
    assert all(c.source == "bank" for c in conditions)
    dd = next(c for c in conditions if c.kind == "direct_deposit" and c.days == 90)
    assert "90 days" in dd.text


def test_parse_terms_page_empty_html_yields_no_conditions():
    assert parse_terms_page("<html><body></body></html>") == []


def test_parse_terms_page_bank_of_america_fixture_drops_nav_and_ui_chrome_noise():
    html = (FIX / "terms-bank-of-america.html").read_text(encoding="utf-8", errors="ignore")
    conditions = parse_terms_page(html)
    assert not any("|" in c.text for c in conditions)
    assert not any("select an offer" in c.text.lower() for c in conditions)
    # the real requirement sentences must survive the noise filter
    dd = next(c for c in conditions if c.kind == "direct_deposit" and c.days == 90)
    assert "within 90 days" in dd.text
    nc = next(c for c in conditions if c.kind == "new_customer")
    assert "Only new checking customers" in nc.text


def test_parse_terms_page_bank_of_america_fixture_pinned_set():
    """Pinned after round 2 (A1–A6): every surviving row names a figure or issues an
    instruction, and the caps-run banner headline is gone."""
    html = (FIX / "terms-bank-of-america.html").read_text(encoding="utf-8", errors="ignore")
    conditions = parse_terms_page(html)

    assert len(conditions) <= 6
    assert not any(c.text.startswith("BANK OF AMERICA") for c in conditions)
    assert any(c.kind == "direct_deposit" and c.days == 90 for c in conditions)
    assert any(c.text.startswith("Only new checking customers") for c in conditions)
    assert all(is_actionable(c) for c in conditions)


# --- _is_bank_noise (bank-only reject filter, applied before classification) ---


def test_is_bank_noise_pipe_joined_breadcrumb():
    assert _is_bank_noise(
        "Up to $500 Tiered Checking offer | Bank of America new checking customer cash offer page"
    )


def test_is_bank_noise_select_an_offer():
    assert _is_bank_noise(
        "Select an offer to learn more about the checking bonus available in your area today"
    )


def test_is_bank_noise_learn_more():
    assert _is_bank_noise(
        "Open a new eligible checking account today and earn a cash bonus, learn more right here"
    )


def test_is_bank_noise_give_feedback():
    assert _is_bank_noise(
        "Give feedback about this page to help us improve your banking experience with us"
    )


def test_is_bank_noise_site_map():
    assert _is_bank_noise(
        "Site Map Careers Privacy Security Terms of Use Accessibility Member FDIC Equal Housing"
    )


def test_is_bank_noise_adchoices():
    assert _is_bank_noise(
        "AdChoices Give your consent preferences before continuing to browse this banking website"
    )


def test_is_bank_noise_change_to_accessible_version():
    assert _is_bank_noise(
        "Change to accessible version of this page for a better screen reader experience here"
    )


def test_is_bank_noise_skip_to_content():
    assert _is_bank_noise(
        "Skip to content Skip to footer navigation links available on this banking website page"
    )


def test_is_bank_noise_more_than_three_dollar_figures():
    assert _is_bank_noise(
        "Cash Bonus Total Direct Deposits $100 $2,000 $300 $5,000 $500 $10,000 or more today"
    )


def test_is_bank_noise_three_or_fewer_dollar_figures_is_not_noise():
    assert not _is_bank_noise(
        "Deposit $300 in new funds within 30 days of account opening to qualify for this offer"
    )


def test_is_bank_noise_high_uppercase_ratio():
    assert _is_bank_noise("OPEN A NEW ELIGIBLE CHECKING ACCOUNT TODAY AND EARN A CASH BONUS NOW")


def test_is_bank_noise_normal_requirement_sentence_is_not_noise():
    assert not _is_bank_noise(
        "Set up and receive Qualifying Direct Deposits into your new account within 90 days "
        "of account opening."
    )


# --- A6: leading all-caps run (a banner headline running on into sentence case) ---


def test_is_bank_noise_leading_all_caps_banner_headline():
    assert _is_bank_noise(
        "BANK OF AMERICA ADVANTAGE BANKING New checking customers choose your cash offer "
        "and open a new eligible checking account today."
    )


def test_has_leading_caps_run_needs_three_long_words_inside_the_first_40_chars():
    assert _has_leading_caps_run("FDIC NCUA MEMBER new checking customers open an account")
    # two is not a run
    assert not _has_leading_caps_run("FDIC NCUA member new checking customers open an account")
    # short all-caps words don't count towards the run
    assert not _has_leading_caps_run("US OF AT new checking customers open an account today")
    # a caps run that starts past the window is left to the ratio check
    assert not _has_leading_caps_run(
        "Open a new eligible checking account today with BANK OF AMERICA ADVANTAGE BANKING"
    )


def test_is_bank_noise_ordinary_capitalised_brand_name_is_not_noise():
    assert not _is_bank_noise(
        "Set up and receive Qualifying Direct Deposits into your new Bank of America account "
        "within 90 days of account opening."
    )


# --- A5: bank-source actionability gate ---


def cond(text, **kw) -> Condition:
    return Condition(kind=kw.pop("kind", "deposit"), text=text, source="bank", **kw)


@pytest.mark.parametrize("field", ["amount", "days", "count"])
def test_is_actionable_any_figure_keeps_the_condition(field):
    assert is_actionable(cond("Your bonus amount will be based on your deposits.", **{field: 90}))


@pytest.mark.parametrize(
    "text",
    [
        "Set up a qualifying direct deposit from your employer or pension provider.",
        "Receive qualifying direct deposits into the new account before the deadline.",
        "Make qualifying debit card purchases from your new checking account each month.",
        "Maintain a qualifying minimum daily balance in your new checking account.",
        "Complete the qualifying activities described in the offer terms and conditions.",
        "Keep your new checking account open and in good standing until the bonus posts.",
        "Deposit new money from outside the bank into your new checking account.",
        "Open a new eligible personal checking account using the offer code shown.",
        "Only new checking customers can take advantage of this particular offer.",
        "Must be a new checking customer to qualify for this cash bonus offer.",
        "You must enroll in the offer before opening your new checking account.",
    ],
)
def test_is_actionable_requirement_verbs_keep_a_figureless_condition(text):
    assert is_actionable(cond(text))


@pytest.mark.parametrize(
    "text",
    [
        "Your bonus amount will be based on the total amount of your Qualifying Direct Deposits.",
        'A "Qualifying Direct Deposit" is a direct deposit of regular monthly income.',
        "How to qualify for this offer To be eligible: this offer is for new customers.",
        "The new eligible personal checking account must be open and in good standing.",
    ],
)
def test_is_actionable_drops_figureless_prose(text):
    assert not is_actionable(cond(text))


def test_parse_terms_page_drops_figureless_prose_but_keeps_instructions():
    html = (
        "<html><body><p>"
        "Your bonus amount will be based on the total amount of your Qualifying Direct Deposits. "
        "Set up and receive Qualifying Direct Deposits into your new checking account soon. "
        "</p></body></html>"
    )
    conditions = parse_terms_page(html)
    assert [c.text.split()[0] for c in conditions] == ["Set"]


# --- TermsFetcher.get: statuses ---


def test_get_ok_caches_and_returns_html(tmp_path: Path):
    s = FakeSession([FakeResp(200, "<html>hi</html>")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, html = f.get("https://bank.test/offer/")
    assert (status, html) == ("ok", "<html>hi</html>")
    assert f._path("https://bank.test/offer/").exists()
    assert s.calls[0][1]["User-Agent"].startswith("Mozilla/5.0")
    assert s.calls[0][2] == 20


@pytest.mark.parametrize("code", [403, 429])
def test_get_blocked_status_codes(tmp_path: Path, code):
    s = FakeSession([FakeResp(code, "go away")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, _html = f.get("https://bank.test/offer/")
    assert status == "blocked"
    assert not f._path("https://bank.test/offer/").exists()


def test_get_other_non_2xx_status_is_error(tmp_path: Path):
    s = FakeSession([FakeResp(500, "boom")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, _html = f.get("https://bank.test/offer/")
    assert status == "error"


def test_get_connection_error_is_error(tmp_path: Path):
    s = FakeSession([requests.exceptions.ConnectionError("refused")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, html = f.get("https://bank.test/offer/")
    assert status == "error"
    assert html == ""


def test_get_timeout_is_error(tmp_path: Path):
    s = FakeSession([requests.exceptions.Timeout("slow")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    status, _html = f.get("https://bank.test/offer/")
    assert status == "error"


def test_cache_hit_returns_ok_without_network(tmp_path: Path):
    s = FakeSession([FakeResp(200, "<html>a</html>")])
    f = TermsFetcher(cache_dir=tmp_path, delay=0, session=s, sleep=lambda _: None)
    assert f.get("https://bank.test/offer/") == ("ok", "<html>a</html>")
    assert f.get("https://bank.test/offer/") == ("ok", "<html>a</html>")
    assert len(s.calls) == 1  # second call was a cache hit


# --- per-host delay ---


def test_per_host_delay_different_hosts_no_sleep(tmp_path: Path):
    clock = {"t": 0.0}
    slept = []
    s = FakeSession([FakeResp(200, "a"), FakeResp(200, "b")])
    f = TermsFetcher(
        cache_dir=tmp_path, delay=5, session=s, sleep=slept.append, clock=lambda: clock["t"]
    )
    f.get("https://bank-a.test/offer/")
    clock["t"] = 0.1  # a moment later, but a different host
    f.get("https://bank-b.test/offer/")
    assert slept == []


def test_per_host_delay_same_host_within_window_sleeps(tmp_path: Path):
    clock = {"t": 0.0}
    slept = []
    s = FakeSession([FakeResp(200, "a"), FakeResp(200, "b")])
    f = TermsFetcher(
        cache_dir=tmp_path, delay=5, session=s, sleep=slept.append, clock=lambda: clock["t"]
    )
    f.get("https://bank-a.test/offer1/")
    clock["t"] = 2.0  # only 2s later, same host, needs to wait 3 more
    f.get("https://bank-a.test/offer2/")
    assert slept == [3.0]


def test_first_request_to_a_host_never_sleeps(tmp_path: Path):
    slept = []
    s = FakeSession([FakeResp(200, "a")])
    f = TermsFetcher(cache_dir=tmp_path, delay=5, session=s, sleep=slept.append)
    f.get("https://bank-a.test/offer/")
    assert slept == []


def test_per_host_delay_throttles_redirect_destination_host(tmp_path: Path):
    """A shared tracking/CDN host that different bank origins redirect to must be
    throttled too, even once each origin's own cooldown has separately elapsed."""
    clock = {"t": 0.0}
    slept = []
    s = FakeSession(
        [
            FakeResp(200, "a", url="https://shared-cdn.test/a/"),  # bank-a -> shared-cdn
            FakeResp(200, "b", url="https://shared-cdn.test/b/"),  # bank-b -> shared-cdn
            FakeResp(200, "c", url="https://shared-cdn.test/c/"),  # bank-a again -> shared-cdn
        ]
    )
    f = TermsFetcher(
        cache_dir=tmp_path, delay=5, session=s, sleep=slept.append, clock=lambda: clock["t"]
    )
    f.get("https://bank-a.test/offer1/")  # t=0: last[bank-a]=0, last[shared-cdn]=0
    clock["t"] = 0.5
    f.get("https://bank-b.test/offer2/")  # t=0.5: first visit to bank-b, no wait yet
    # last[bank-b]=0.5, last[shared-cdn]=0.5 (bumped by bank-b's own redirect)
    clock["t"] = 5.2
    # bank-a's own cooldown (5.2 - 0 = 5.2s) has elapsed, but shared-cdn's has not
    # (5.2 - 0.5 = 4.7s < 5s) — the destination-host check should still make us wait.
    f.get("https://bank-a.test/offer3/")
    assert len(slept) == 1
    assert slept[0] == pytest.approx(0.3)  # 5 - (5.2 - 0.5)


def test_per_host_delay_no_redirect_uses_plain_host_check(tmp_path: Path):
    """A FakeResp without a `.url` (the common case in the other tests) behaves
    exactly as before: no redirect is inferred, only the origin host matters."""
    clock = {"t": 0.0}
    slept = []
    s = FakeSession([FakeResp(200, "a"), FakeResp(200, "b")])
    f = TermsFetcher(
        cache_dir=tmp_path, delay=5, session=s, sleep=slept.append, clock=lambda: clock["t"]
    )
    f.get("https://bank-a.test/offer1/")
    clock["t"] = 2.0
    f.get("https://bank-a.test/offer2/")
    assert slept == [3.0]

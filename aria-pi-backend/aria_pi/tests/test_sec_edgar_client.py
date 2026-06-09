"""Tests for the SEC EDGAR client.

Network calls are mocked. Covers ticker-map loading/caching, CIK resolution
(exact match vs. weak-substring rejection), public/private company facts,
XBRL financial extraction, full-text discovery ranking, and the DEF 14A
proxy / website UNC-alumni parsing.
"""
from unittest.mock import patch

import pytest

from aria_pi.clients import sec_edgar_client as sec_mod
from aria_pi.clients.sec_edgar_client import (
    SECEdgarClient,
    _load_tickers,
    _active_cik_titles,
    _filing_url,
    _strip_proxy_html,
    _parse_proxy_for_unc,
    _proxy_unc_degree,
)
from aria_pi.tests.conftest import FakeResponse


TICKER_MAP = {
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corp"},
    "2": {"cik_str": 1318605, "ticker": "TSLA", "title": "Tesla, Inc."},
}


# ── Ticker map loading + caching ─────────────────────────────────────────────

def test_load_tickers_parses_dict_values():
    """
    Takes: SEC's company_tickers.json (dict-of-dicts).
    Does: Loads the ticker map.
    Returns: A list of the inner records.
    """
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        tickers = _load_tickers()
    assert len(tickers) == 3
    assert {t["ticker"] for t in tickers} == {"AAPL", "MSFT", "TSLA"}


def test_load_tickers_caches_after_first_call():
    """
    Takes: A first successful load, then a second call.
    Does: Loads tickers twice.
    Returns: Only one HTTP request (result cached at module level).
    """
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=FakeResponse(TICKER_MAP)) as mock_get:
        _load_tickers()
        _load_tickers()
    assert mock_get.call_count == 1


def test_load_tickers_network_error_returns_empty():
    """
    Takes: A failing ticker request.
    Does: Loads tickers.
    Returns: An empty list (cached) without raising.
    """
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               side_effect=RuntimeError("dns")):
        assert _load_tickers() == []


def test_active_cik_titles_maps_int_cik_to_title():
    """
    Takes: The loaded ticker map.
    Does: Builds the active CIK->title index.
    Returns: int CIK keys mapping to official titles.
    """
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        active = _active_cik_titles()
    assert active[320193] == "Apple Inc."
    assert active[1318605] == "Tesla, Inc."


# ── CIK resolution ───────────────────────────────────────────────────────────

def test_find_cik_exact_ticker_match():
    """
    Takes: A query equal to a ticker symbol.
    Does: Resolves the CIK from the ticker map.
    Returns: The matching CIK as a string.
    """
    client = SECEdgarClient()
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        assert client._find_cik("AAPL") == "320193"


def test_find_cik_exact_title_match():
    """
    Takes: A query equal to a company title.
    Does: Resolves the CIK.
    Returns: The matching CIK.
    """
    client = SECEdgarClient()
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        assert client._find_cik("Microsoft Corp") == "789019"


def test_find_cik_rejects_weak_substring_then_falls_back_to_search():
    """
    Takes: A private name ('OpenAI') that only weakly matches public titles.
    Does: Resolves CIK; the ticker-map score is too low so it hits full-text
          search, which here returns no token-overlapping hit.
    Returns: None — never a wrong public company.
    """
    client = SECEdgarClient()
    # ticker load, then full-text search returns an unrelated filer
    search_resp = FakeResponse({"hits": {"hits": [
        {"_source": {"ciks": ["320193"]}}  # Apple — shares no token with OpenAI
    ]}})
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               side_effect=[FakeResponse(TICKER_MAP), search_resp]):
        assert client._find_cik("OpenAI") is None


# ── get_company_facts ────────────────────────────────────────────────────────

def test_get_company_facts_private_company():
    """
    Takes: A company that resolves to no CIK.
    Does: Fetches facts.
    Returns: A dict flagged is_public=False, honestly reporting no filings.
    """
    client = SECEdgarClient()
    with patch.object(client, "_find_cik", return_value=None):
        facts = client.get_company_facts("Epic Systems")
    assert facts["is_public"] is False
    assert facts["legal_name"] == "Epic Systems"


def test_get_company_facts_public_company_parses_submissions():
    """
    Takes: A CIK plus a mocked submissions payload and empty XBRL.
    Does: Fetches and assembles company facts.
    Returns: is_public True, parsed HQ, tickers, and grouped filings.
    """
    client = SECEdgarClient()
    submissions = {
        "name": "Apple Inc.",
        "sicDescription": "Electronic Computers",
        "tickers": ["AAPL"],
        "exchanges": ["Nasdaq"],
        "addresses": {"business": {"city": "Cupertino", "stateOrCountry": "CA"}},
        "filings": {"recent": {
            "form": ["10-K", "8-K"],
            "filingDate": ["2024-11-01", "2024-10-01"],
            "accessionNumber": ["0000320193-24-000123", "0000320193-24-000100"],
            "primaryDocument": ["aapl.htm", "ev.htm"],
        }},
    }
    with patch.object(client, "_find_cik", return_value="320193"), \
         patch.object(client, "_get_xbrl_facts", return_value={}), \
         patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=FakeResponse(submissions)):
        facts = client.get_company_facts("Apple")
    assert facts["is_public"] is True
    assert facts["legal_name"] == "Apple Inc."
    assert facts["hq"] == "Cupertino, CA"
    assert facts["tickers"] == ["AAPL"]
    assert len(facts["filings_by_form"]["10-K"]) == 1
    assert "edgar_url" in facts


def test_get_company_facts_submissions_error_returns_minimal():
    """
    Takes: A CIK but a submissions endpoint that errors.
    Does: Fetches facts.
    Returns: A minimal dict with the CIK and SEC source, no exception.
    """
    client = SECEdgarClient()
    with patch.object(client, "_find_cik", return_value="320193"), \
         patch("aria_pi.clients.sec_edgar_client.requests.get",
               side_effect=RuntimeError("503")):
        facts = client.get_company_facts("Apple")
    assert facts["cik"] == "320193"
    assert facts["source"] == "https://www.sec.gov"


# ── XBRL parsing ─────────────────────────────────────────────────────────────

def test_get_xbrl_facts_picks_latest_annual_revenue():
    """
    Takes: Company-facts XBRL with two revenue concepts across fiscal years.
    Does: Extracts headline financials.
    Returns: The most recent annual revenue value, plus a built series.
    """
    client = SECEdgarClient()
    companyfacts = {"facts": {"us-gaap": {
        "SalesRevenueNet": {"units": {"USD": [
            {"val": 100, "end": "2018-12-31", "fy": 2018, "fp": "FY",
             "form": "10-K", "accn": "0000320193-19-000001"},
        ]}},
        "RevenueFromContractWithCustomerExcludingAssessedTax": {"units": {"USD": [
            {"val": 400, "end": "2023-12-31", "fy": 2023, "fp": "FY",
             "form": "10-K", "accn": "0000320193-24-000001"},
        ]}},
        "ResearchAndDevelopmentExpense": {"units": {"USD": [
            {"val": 25, "end": "2023-12-31", "fy": 2023, "fp": "FY",
             "form": "10-K", "accn": "0000320193-24-000001"},
        ]}},
    }, "dei": {}}}
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=FakeResponse(companyfacts)):
        xbrl = client._get_xbrl_facts("320193")
    assert xbrl["revenue"]["value"] == 400      # 2023 beats 2018
    assert xbrl["revenue"]["fy"] == 2023
    assert xbrl["rd_expense"]["value"] == 25
    # Series merges both revenue concepts, deduped + ascending by fiscal year.
    fys = [pt["fy"] for pt in xbrl["series"]["revenue"]]
    assert fys == sorted(fys)
    assert 2018 in fys and 2023 in fys


def test_get_xbrl_facts_network_error_returns_empty():
    """
    Takes: A failing company-facts request.
    Does: Pulls XBRL facts.
    Returns: An empty dict.
    """
    client = SECEdgarClient()
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               side_effect=RuntimeError("nope")):
        assert client._get_xbrl_facts("320193") == {}


# ── Discovery ranking ────────────────────────────────────────────────────────

def test_discover_companies_ranks_by_frequency():
    """
    Takes: A term and full-text hits where one live filer matches twice.
    Does: Runs discovery (active map + one efts page).
    Returns: Live companies ranked by match frequency, capped at limit.
    """
    client = SECEdgarClient()
    hits = {"hits": {"hits": [
        {"_source": {"ciks": ["320193"]}},
        {"_source": {"ciks": ["320193"]}},   # Apple twice
        {"_source": {"ciks": ["789019"]}},   # Microsoft once
        {"_source": {"ciks": ["999999"]}},   # not in active map -> dropped
    ]}}

    def fake_get(url, **kwargs):
        if "company_tickers" in url:
            return FakeResponse(TICKER_MAP)
        return FakeResponse(hits)

    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               side_effect=fake_get), \
         patch("aria_pi.clients.sec_edgar_client.time.sleep"):
        names = client.discover_companies("computers", limit=10)
    assert names[0] == "Apple Inc."          # highest frequency first
    assert "Microsoft Corp" in names
    assert all("999999" not in n for n in names)


def test_discover_companies_blank_term_returns_empty():
    """
    Takes: An empty term.
    Does: Runs discovery.
    Returns: An empty list with no HTTP calls.
    """
    client = SECEdgarClient()
    assert client.discover_companies("   ") == []


# ── _filing_url ──────────────────────────────────────────────────────────────

def test_filing_url_variants():
    """
    Takes: Accession + document combinations.
    Does: Builds the canonical filing URL.
    Returns: A document URL, a directory URL, or the browse-edgar fallback.
    """
    assert _filing_url("320193", "", "") == \
        "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=320193"
    doc = _filing_url("320193", "0000320193-24-000123", "aapl.htm")
    assert doc.endswith("/000032019324000123/aapl.htm")
    folder = _filing_url("320193", "0000320193-24-000123", "")
    assert folder.endswith("/000032019324000123/")


# ── Proxy / website UNC alumni parsing ───────────────────────────────────────

def test_strip_proxy_html_preserves_paragraph_boundaries():
    """
    Takes: HTML with block elements and a script tag.
    Does: Strips HTML while keeping structure.
    Returns: Script content gone; block elements split onto separate lines.
    """
    html = "<div>John Smith</div><script>x=1</script><p>UNC bio</p>"
    out = _strip_proxy_html(html)
    assert "x=1" not in out
    assert "John Smith" in out
    assert "UNC bio" in out
    assert "\n" in out


def test_proxy_unc_degree_detection():
    """
    Takes: Bio context strings mentioning different degrees.
    Does: Classifies the highest/relevant degree label.
    Returns: The matched degree label or empty string.
    """
    assert _proxy_unc_degree("earned a Ph.D. from UNC") == "PhD"
    assert _proxy_unc_degree("holds an MBA") == "MBA"
    assert _proxy_unc_degree("no degree mentioned") == ""


def test_parse_proxy_for_unc_extracts_person():
    """
    Takes: A proxy bio naming an exec, age, title, and a UNC degree.
    Does: Parses the document for UNC-educated people.
    Returns: One record with name, title, and UNC credential.
    """
    html = (
        "<p>Jane M. Doe, age 54</p>"
        "<p>Chief Executive Officer</p>"
        "<p>Ms. Doe received a B.S. from the University of North Carolina "
        "at Chapel Hill.</p>"
    )
    people = _parse_proxy_for_unc(html, "https://sec.gov/doc.htm")
    assert len(people) == 1
    assert people[0]["name"] == "Jane M. Doe"
    assert "UNC Chapel Hill" in people[0]["unc_credential"]
    assert people[0]["source_url"] == "https://sec.gov/doc.htm"


def test_parse_proxy_for_unc_requires_education_context():
    """
    Takes: A UNC mention with no educational keyword nearby.
    Does: Parses the document.
    Returns: An empty list — a bare UNC mention is not an alumnus claim.
    """
    html = "<p>The company sponsors University of North Carolina athletics.</p>"
    assert _parse_proxy_for_unc(html, "u") == []


def test_get_unc_alumni_from_proxy_skips_when_no_filings():
    """
    Takes: A CIK but no proxy filings.
    Does: Requests alumni from proxy.
    Returns: An empty list without any HTTP work.
    """
    client = SECEdgarClient()
    assert client.get_unc_alumni_from_proxy("320193", []) == []


def test_get_unc_alumni_from_website_skips_js_shell():
    """
    Takes: A leadership URL whose body is a near-empty JS shell.
    Does: Scrapes the website for UNC alumni.
    Returns: An empty list (text below the visible-content threshold).
    """
    client = SECEdgarClient()
    shell = FakeResponse(text="<html><body></body></html>", status_code=200)
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=shell):
        assert client.get_unc_alumni_from_website("Acme", "https://acme.com") == []

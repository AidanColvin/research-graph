"""Tests for the deterministic ReportBuilder.

No network or LLM. Covers formatting helpers, the auto-verification section,
and a full build() over a realistic company fixture.
"""
import pytest

from aria_pi.builders.report_builder import (
    ReportBuilder,
    _fmt_usd,
    _fmt_hq,
    _fmt_unc_org,
    _alignment_hint,
    _first_trial_url,
)


# ── Formatting helpers ───────────────────────────────────────────────────────

@pytest.mark.parametrize("val,expected", [
    (16_286_000_000, "$16.29B"),
    (2_500_000, "$2.5M"),
    (7_000, "$7K"),
    (-3_000_000_000, "-$3.00B"),
    (42, "$42"),
    ("not a number", "n/a"),
    (None, "n/a"),
])
def test_fmt_usd(val, expected):
    """
    Takes: A numeric (or invalid) value.
    Does: Formats it as compact USD.
    Returns: The expected compact string, or 'n/a' for non-numbers.
    """
    assert _fmt_usd(val) == expected


def test_fmt_hq_title_cases_city_upper_state():
    """
    Takes: A raw 'CITY, ST' HQ string.
    Does: Normalizes case.
    Returns: Title-cased city with an upper-cased state code.
    """
    assert _fmt_hq("RAHWAY, NJ") == "Rahway, NJ"


def test_fmt_unc_org_normalizes_prefix():
    """
    Takes: An all-caps NIH UNC org string.
    Does: Normalizes it to a readable UNC unit name.
    Returns: A 'UNC Chapel Hill — ...' formatted string.
    """
    out = _fmt_unc_org("UNIV OF NORTH CAROLINA CHAPEL HILL PHARMACOLOGY")
    assert out.startswith("UNC Chapel Hill")


def test_alignment_hint_prefers_pubmed():
    """
    Takes: A company with both PubMed papers and trials.
    Does: Builds the selection alignment hint.
    Returns: A PubMed-based hint (the stronger signal).
    """
    c = {"pubmed": [{"title": "p"}], "trials": [{"url": "u"}]}
    assert "PubMed" in _alignment_hint(c)


def test_alignment_hint_falls_back_to_analyst_marker():
    """
    Takes: A company with no papers and no trials.
    Does: Builds the alignment hint.
    Returns: A [REQUIRES ANALYST] marker.
    """
    assert "[REQUIRES ANALYST" in _alignment_hint({})


def test_first_trial_url_fallback():
    """
    Takes: A company with no trials.
    Does: Resolves the first trial URL.
    Returns: The clinicaltrials.gov base URL.
    """
    assert _first_trial_url({}) == "https://clinicaltrials.gov"


# ── Full build ───────────────────────────────────────────────────────────────

@pytest.fixture
def company_fixture():
    return {
        "name": "Moderna",
        "facts": {
            "legal_name": "Moderna, Inc.",
            "cik": "1682852",
            "is_public": True,
            "sic": "Pharmaceutical Preparations",
            "tickers": ["MRNA"],
            "exchanges": ["Nasdaq"],
            "hq": "CAMBRIDGE, MA",
            "website": "https://www.modernatx.com",
            "edgar_url": "https://www.sec.gov/cgi-bin/browse-edgar?CIK=1682852",
            "recent_filings": [
                {"form": "8-K", "date": "2024-05-01", "url": "https://sec.gov/8k"},
                {"form": "10-K", "date": "2024-02-01", "url": "https://sec.gov/10k"},
            ],
            "filings_by_form": {"10-K": [{"form": "10-K", "date": "2024-02-01",
                                          "url": "https://sec.gov/10k"}]},
            "xbrl": {
                "revenue": {"value": 6_700_000_000, "fy": 2023, "url": "https://sec.gov/r"},
                "rd_expense": {"value": 4_800_000_000, "fy": 2023, "url": "https://sec.gov/rd"},
                "net_income": {}, "total_assets": {}, "employees": {},
                "series": {"revenue": [{"fy": 2022, "val": 19_000_000_000},
                                       {"fy": 2023, "val": 6_700_000_000}],
                           "rd_expense": [], "net_income": []},
            },
        },
        "trials": [
            {"nct_id": "NCT100", "title": "mRNA flu vaccine", "phase": "PHASE3",
             "status": "RECRUITING", "collaborators": ["UNC Chapel Hill"],
             "url": "https://clinicaltrials.gov/study/NCT100"},
        ],
        "unc_trials": [
            {"nct_id": "NCT100", "title": "mRNA flu vaccine", "status": "RECRUITING",
             "unc_signal": "UNC Chapel Hill", "collaborators": ["UNC Chapel Hill"],
             "url": "https://clinicaltrials.gov/study/NCT100"},
        ],
        "pubmed": [
            {"pmid": "55", "title": "mRNA study", "authors": ["Lee K", "Smith J"],
             "journal": "Nature", "year": "2023", "unc_school": "UNC School of Medicine",
             "url": "https://pubmed.ncbi.nlm.nih.gov/55/"},
        ],
        "pubmed_coi": [],
        "nih_grants": [
            {"project_num": "R01AI1", "title": "mRNA immunology", "pi": "Dr. Jane Lee",
             "department": "Microbiology", "fiscal_year": 2024,
             "url": "https://reporter.nih.gov/project-details/R01AI1"},
        ],
        "unc_alumni": [{"name": "Bob Roe", "title": "CFO",
                        "unc_credential": "UNC Chapel Hill — MBA"}],
    }


def test_build_produces_all_sections(company_fixture):
    """
    Takes: A realistic single-company dataset.
    Does: Builds the full report.
    Returns: All sections present with correct metadata.
    """
    builder = ReportBuilder()
    report = builder.build("biotech", {"sector": "biotech",
                                       "companies": [company_fixture]})
    for key in ("report_meta", "section1_overview", "section2_internal_mapping",
                "section3_selection", "section4_profiles", "section5_value_prop",
                "section6_talking_points", "section7_verification", "references"):
        assert key in report
    assert report["report_meta"]["sector"] == "biotech"
    assert len(report["section4_profiles"]) == 1


def test_build_profile_carries_financials_and_alumni(company_fixture):
    """
    Takes: The company fixture.
    Does: Builds the report and inspects the profile.
    Returns: Revenue in the facts table, trends populated, alumni enriched with
             a LinkedIn search URL.
    """
    builder = ReportBuilder()
    report = builder.build("biotech", {"sector": "biotech",
                                       "companies": [company_fixture]})
    profile = report["section4_profiles"][0]
    assert profile["company_name"] == "Moderna"
    assert "revenue" in profile["facts"]
    assert profile["trends"]["revenue"]  # series carried through
    assert profile["unc_alumni"][0]["linkedin_url"].startswith(
        "https://www.linkedin.com/search/")
    # Existing tie inferred from pubmed/unc_trials/nih_grants.
    assert profile["existing_unc_tie"] is True


def test_build_section2_surfaces_known_partnerships(company_fixture):
    """
    Takes: The company fixture (UNC trial + NIH grant + co-authored paper).
    Does: Builds the report.
    Returns: Section 2 lists known partnerships, faculty, and a risk flag.
    """
    builder = ReportBuilder()
    report = builder.build("biotech", {"sector": "biotech",
                                       "companies": [company_fixture]})
    s2 = report["section2_internal_mapping"]
    assert s2["known_partnerships"]
    assert s2["unc_faculty"]
    assert s2["risk_flags"]  # active UNC trial triggers a flag


def test_build_section7_verification_double_sourced(company_fixture):
    """
    Takes: The company fixture (every claim carries two clean sources).
    Does: Builds the report and reads the auto-verification checklist.
    Returns: The double-source item is checked and the blocklist item passes.
    """
    builder = ReportBuilder()
    report = builder.build("biotech", {"sector": "biotech",
                                       "companies": [company_fixture]})
    s7 = {item["label"]: item for item in report["section7_verification"]}
    double = next(v for k, v in s7.items() if "two independently" in k)
    assert double["checked"] is True
    blocklist = next(v for k, v in s7.items() if "Wikipedia" in k)
    assert blocklist["checked"] is True


def test_build_private_company_marks_not_public():
    """
    Takes: A private company (no CIK, is_public False).
    Does: Builds the report.
    Returns: The profile overview states it is privately held.
    """
    builder = ReportBuilder()
    private = {"name": "Epic Systems",
               "facts": {"legal_name": "Epic Systems", "is_public": False},
               "trials": [], "pubmed": [], "nih_grants": []}
    report = builder.build("health it", {"sector": "health it",
                                         "companies": [private]})
    overview = report["section4_profiles"][0]["overview"]["text"]
    assert "Privately held" in overview


def test_build_empty_companies_is_safe():
    """
    Takes: An empty company list.
    Does: Builds the report.
    Returns: A valid report with no profiles and no references.
    """
    builder = ReportBuilder()
    report = builder.build("pasta", {"sector": "pasta", "companies": []})
    assert report["section4_profiles"] == []
    assert report["references"] == []

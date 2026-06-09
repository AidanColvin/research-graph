"""Tests for the pipeline stages: CompanyProfilerStage and VerificationStage.

The profiler's data clients are mocked so we exercise the 2-source rule and
claim assembly without network access.
"""
from unittest.mock import patch

from aria_pi.stages.company_profiler import CompanyProfilerStage
from aria_pi.stages.verification import VerificationStage
from aria_pi.models.profile import CompanyProfile
from aria_pi.models.claim import Claim


def test_profiler_builds_verified_pipeline_claim():
    """
    Takes: A profiler whose SEC + trials clients are mocked with a trial that
           has two distinct, clean sources.
    Does: Runs the profiler for a company.
    Returns: A CompanyProfile whose single pipeline claim is verified.
    """
    stage = CompanyProfilerStage()
    facts = {"legal_name": "Moderna Inc.", "sic": "Pharma",
             "source": "https://www.sec.gov"}
    trial = {"nct_id": "NCT1", "phase": "PHASE2", "title": "Study",
             "url": "https://clinicaltrials.gov/study/NCT1"}
    with patch.object(stage.sec, "get_company_facts", return_value=facts), \
         patch.object(stage.trials, "search_by_sponsor", return_value=[trial]):
        profile = stage.run("Moderna")
    assert isinstance(profile, CompanyProfile)
    assert profile.facts["legal_name"] == "Moderna Inc."
    assert len(profile.pipeline) == 1
    assert profile.pipeline[0].is_verified is True
    assert "NCT1" in profile.pipeline[0].text


def test_profiler_flags_claim_with_single_source():
    """
    Takes: A trial whose only valid source is the trial URL (facts source blank).
    Does: Runs the profiler.
    Returns: The pipeline claim is unverified and carries the [UNVERIFIED] tag.
    """
    stage = CompanyProfilerStage()
    facts = {"legal_name": "Acme", "source": ""}  # blank second source
    trial = {"nct_id": "NCT2", "phase": "PHASE1", "title": "T",
             "url": "https://clinicaltrials.gov/study/NCT2"}
    with patch.object(stage.sec, "get_company_facts", return_value=facts), \
         patch.object(stage.trials, "search_by_sponsor", return_value=[trial]):
        profile = stage.run("Acme")
    claim = profile.pipeline[0]
    assert claim.is_verified is False
    assert "[UNVERIFIED" in claim.text


def test_verification_flags_unverified_and_banned_phrases():
    """
    Takes: A profile with an unverified claim containing a banned phrase.
    Does: Runs verification.
    Returns: A soft flag for both the unverified claim and the banned phrase.
    """
    stage = VerificationStage()
    claim = Claim(text="They have world-class research capacity.",
                  sources=["u"], is_verified=False, stage="S4")
    profile = CompanyProfile(
        company_name="Acme", facts={"legal_name": "Acme Inc."},
        pipeline=[claim], partnering_history=[], unc_alignment=[],
        what_unc_offers=[],
    )
    log = stage.run([profile])
    assert log["status"] == "PASSED"
    assert any("Unverified" in f for f in log["soft_flags"])
    assert any("Banned Phrase" in f for f in log["soft_flags"])


def test_verification_hard_stop_on_missing_legal_name():
    """
    Takes: A profile whose facts lack a legal_name.
    Does: Runs verification.
    Returns: A hard stop and BLOCKED status.
    """
    stage = VerificationStage()
    profile = CompanyProfile(
        company_name="Ghost", facts={"legal_name": ""},
        pipeline=[], partnering_history=[], unc_alignment=[],
        what_unc_offers=[],
    )
    log = stage.run([profile])
    assert log["status"] == "BLOCKED"
    assert log["hard_stops"]


def test_verification_clean_profile_passes():
    """
    Takes: A profile with one verified, clean claim and a legal name.
    Does: Runs verification.
    Returns: PASSED with no flags or stops.
    """
    stage = VerificationStage()
    claim = Claim(text="Sponsors trial NCT9.", sources=["u1", "u2"],
                  is_verified=True, stage="S4")
    profile = CompanyProfile(
        company_name="Acme", facts={"legal_name": "Acme Inc."},
        pipeline=[claim], partnering_history=[], unc_alignment=[],
        what_unc_offers=[],
    )
    log = stage.run([profile])
    assert log["status"] == "PASSED"
    assert log["soft_flags"] == []
    assert log["hard_stops"] == []

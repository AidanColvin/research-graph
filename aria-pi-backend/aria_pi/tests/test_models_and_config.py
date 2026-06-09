"""Tests for the Pydantic models and config loader."""
import pytest
from pydantic import ValidationError

from aria_pi.models.claim import Claim
from aria_pi.models.company import Company
from aria_pi.models.profile import CompanyProfile
from aria_pi.config import Config, load_config


def test_claim_defaults():
    """
    Takes: The minimum required Claim fields.
    Does: Constructs a Claim.
    Returns: is_verified defaults to False; optional fields default to None.
    """
    c = Claim(text="x", sources=["u"], stage="Stage 4")
    assert c.is_verified is False
    assert c.company_name is None
    assert c.unverified_reason is None


def test_claim_requires_stage():
    """
    Takes: A Claim missing the required `stage` field.
    Does: Attempts construction.
    Returns: A pydantic ValidationError.
    """
    with pytest.raises(ValidationError):
        Claim(text="x", sources=[])


def test_company_defaults():
    """
    Takes: Only a company name.
    Does: Constructs a Company.
    Returns: score=0 and risk_flag=False by default.
    """
    c = Company(name="Acme")
    assert c.score == 0
    assert c.risk_flag is False


def test_company_profile_round_trips_claims():
    """
    Takes: A CompanyProfile holding one Claim in its pipeline.
    Does: Constructs and reads back the profile.
    Returns: The nested Claim is preserved with its text.
    """
    claim = Claim(text="t", sources=["u1", "u2"], is_verified=True, stage="S4")
    profile = CompanyProfile(
        company_name="Acme", facts={"legal_name": "Acme Inc."},
        pipeline=[claim], partnering_history=[], unc_alignment=[],
        what_unc_offers=[],
    )
    assert profile.pipeline[0].text == "t"
    assert profile.facts["legal_name"] == "Acme Inc."


def test_load_config_defaults():
    """
    Takes: Nothing.
    Does: Loads configuration.
    Returns: A Config with the documented default values.
    """
    cfg = load_config()
    assert isinstance(cfg, Config)
    assert cfg.companies_per_report == 5
    assert cfg.selection_score_threshold == 55

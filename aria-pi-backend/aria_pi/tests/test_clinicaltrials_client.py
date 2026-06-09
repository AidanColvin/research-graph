"""Tests for the ClinicalTrials.gov client.

Covers the sponsor-token matching that prevents false positives (e.g. an
"Apple cider vinegar" trial matching Apple Inc.), UNC signal detection, and
JSON parsing of the v2 studies payload.
"""
from unittest.mock import patch

from aria_pi.clients.clinicaltrials_client import (
    ClinicalTrialsClient,
    _sponsor_tokens,
    _is_actual_sponsor,
    _detect_unc,
)
from aria_pi.tests.conftest import FakeResponse


def test_sponsor_tokens_strips_noise_and_short_words():
    """
    Takes: A legal company name with suffixes and short words.
    Does: Tokenizes it for matching.
    Returns: Only meaningful lowercase tokens (>=3 chars, no 'inc'/'the').
    """
    toks = _sponsor_tokens("Pfizer Inc. and The Co")
    assert "pfizer" in toks
    assert "inc" not in toks
    assert "the" not in toks
    assert "co" not in toks


def test_is_actual_sponsor_matches_lead():
    """
    Takes: A company whose tokens overlap the lead sponsor.
    Does: Checks genuine sponsorship.
    Returns: True.
    """
    assert _is_actual_sponsor("Moderna", "Moderna Inc.", []) is True


def test_is_actual_sponsor_matches_collaborator():
    """
    Takes: A company that only appears as a collaborator.
    Does: Checks sponsorship across the collaborator list.
    Returns: True.
    """
    assert _is_actual_sponsor("Merck", "Some Hospital", ["Merck Sharp"]) is True


def test_is_actual_sponsor_rejects_unrelated_sponsor():
    """
    Takes: A company whose tokens overlap neither the lead nor a collaborator.
    Does: Guards against attributing an unrelated trial to the company.
    Returns: False.
    """
    assert _is_actual_sponsor("Apple", "Microsoft Corporation",
                              ["Stanford University"]) is False


def test_is_actual_sponsor_empty_name_is_false():
    """
    Takes: An empty company name (no usable tokens).
    Does: Checks sponsorship.
    Returns: False.
    """
    assert _is_actual_sponsor("", "Anything", ["Other"]) is False


def test_detect_unc_finds_affiliation():
    """
    Takes: A list of facility/collaborator strings, one UNC-affiliated.
    Does: Scans for a UNC signal.
    Returns: The first UNC-looking string.
    """
    assert _detect_unc(["Duke", "UNC Lineberger Cancer Center"]) == \
        "UNC Lineberger Cancer Center"


def test_detect_unc_none_returns_empty():
    """
    Takes: Strings with no UNC affiliation.
    Does: Scans for a UNC signal.
    Returns: An empty string.
    """
    assert _detect_unc(["Duke University", "Stanford"]) == ""


def _study(lead, collabs=None, facilities=None, nct="NCT001",
           title="A Study", phases=("PHASE2",), status="RECRUITING"):
    return {
        "protocolSection": {
            "identificationModule": {"nctId": nct, "briefTitle": title},
            "designModule": {"phases": list(phases)},
            "statusModule": {"overallStatus": status},
            "sponsorCollaboratorsModule": {
                "leadSponsor": {"name": lead},
                "collaborators": [{"name": c} for c in (collabs or [])],
            },
            "contactsLocationsModule": {
                "locations": [{"facility": f} for f in (facilities or [])],
            },
        }
    }


def test_search_by_sponsor_parses_and_filters():
    """
    Takes: A studies payload with one genuine Moderna trial and one decoy.
    Does: Searches by sponsor and post-filters non-sponsor matches.
    Returns: Only the genuine trial, fully parsed with a UNC signal.
    """
    client = ClinicalTrialsClient()
    payload = {"studies": [
        _study("Moderna Inc.", collabs=["UNC Chapel Hill"],
               facilities=["UNC Medical Center"], nct="NCT123"),
        _study("Apple Cider Vinegar Group", nct="NCT999"),  # decoy, filtered
    ]}
    with patch("aria_pi.clients.clinicaltrials_client.requests.get",
               return_value=FakeResponse(payload)):
        trials = client.search_by_sponsor("Moderna")
    assert len(trials) == 1
    t = trials[0]
    assert t["nct_id"] == "NCT123"
    assert t["phase"] == "PHASE2"
    assert t["status"] == "RECRUITING"
    assert t["unc_signal"]  # detected via collaborator/facility
    assert t["url"] == "https://clinicaltrials.gov/study/NCT123"


def test_search_by_sponsor_network_error_returns_empty():
    """
    Takes: A request that raises a network error.
    Does: Searches by sponsor.
    Returns: An empty list (no exception escapes).
    """
    client = ClinicalTrialsClient()
    with patch("aria_pi.clients.clinicaltrials_client.requests.get",
               side_effect=RuntimeError("timeout")):
        assert client.search_by_sponsor("Moderna") == []


def test_search_by_sponsor_handles_empty_studies():
    """
    Takes: A payload with no studies.
    Does: Searches by sponsor.
    Returns: An empty list.
    """
    client = ClinicalTrialsClient()
    with patch("aria_pi.clients.clinicaltrials_client.requests.get",
               return_value=FakeResponse({"studies": []})):
        assert client.search_by_sponsor("Moderna") == []


def test_collaborators_and_facilities_truncated_to_six():
    """
    Takes: A trial with many collaborators and facilities.
    Does: Parses the trial.
    Returns: Collaborators and facilities each capped at six entries.
    """
    client = ClinicalTrialsClient()
    many = [f"Moderna Partner {i}" for i in range(10)]
    payload = {"studies": [_study("Moderna", collabs=many, facilities=many)]}
    with patch("aria_pi.clients.clinicaltrials_client.requests.get",
               return_value=FakeResponse(payload)):
        t = client.search_by_sponsor("Moderna")[0]
    assert len(t["collaborators"]) == 6
    assert len(t["facilities"]) == 6

"""Tests for sector routing — the rules that decide whether a search term
maps to a curated company set or falls through to live SEC discovery.

These lock in the behavior added for niche, free-text searches: a qualified
multi-word term ("pet food", "solar panels") must NOT be force-fit into a
broad curated bucket; it should return None so the orchestrator researches it
live. Specific sectors and curated aliases must keep resolving.
"""
import pytest

from aria_pi.sectors import canonical_sector, _BROAD_TARGETS, SECTOR_SEEDS
from aria_pi.clients.sec_edgar_client import SECEdgarClient


# (input, expected canonical) — None means "route to live discovery".
ROUTING_CASES = [
    # Niche / qualified terms -> live discovery (None).
    ("Pet Food", None),
    ("Dog Food", None),
    ("Solar Panels", None),
    ("HVAC", None),
    ("Coffee", None),
    ("Video Games", None),
    ("Craft Beer", None),
    ("Electric Vehicle", None),
    ("Consumer Electronics", None),
    # Curated aliases (whole-string) -> mapped.
    ("AI", "artificial intelligence"),
    ("Healthcare", "healthcare"),
    ("Financial Services", "finance"),
    ("EHR", "health it"),
    ("big tech", "technology"),
    # Specific sectors -> mapped (substring/keyword routes preserved).
    ("Pharmaceutical", "pharmaceutical"),
    ("car insurance", "insurance"),
    ("machine learning", "artificial intelligence"),
    ("gene therapy", "biotech"),
    ("oncology", "oncology"),
    ("managed care", "healthcare"),
    # Bare single broad words still map.
    ("food", "consumer"),
    ("tech", "technology"),
    # Multi-word exact sector keys.
    ("rural health", "rural health"),
    ("quantum computing", "quantum computing"),
]


@pytest.mark.parametrize("term,expected", ROUTING_CASES)
def test_canonical_sector_routing(term, expected):
    assert canonical_sector(term) == expected


def test_blank_input_returns_none():
    assert canonical_sector("") is None
    assert canonical_sector("   ") is None
    assert canonical_sector(None) is None


def test_broad_target_multiword_falls_through():
    """Every broad bucket word, when qualified, routes to discovery."""
    for target in _BROAD_TARGETS:
        qualified = f"specialty {target}"
        assert canonical_sector(qualified) is None, target


def test_curated_targets_exist_in_seeds():
    """Anything canonical_sector can return must have a seed list."""
    for _, expected in ROUTING_CASES:
        if expected is not None:
            assert expected in SECTOR_SEEDS, expected


# --- discovery query chain (pure, no network) ------------------------------

def test_discovery_queries_multiword_relaxes():
    qs = SECEdgarClient._discovery_queries("craft beer")
    assert qs[0] == '"craft beer"'      # exact phrase first
    assert "craft beer" in qs           # all-words fallback
    assert "beer" in qs                 # head-noun fallback
    # no duplicates, order preserved
    assert len(qs) == len(set(qs))


def test_discovery_queries_single_word():
    assert SECEdgarClient._discovery_queries("hvac") == ["hvac"]


def test_discovery_queries_dedupes():
    qs = SECEdgarClient._discovery_queries("solar solar")
    assert len(qs) == len(set(qs))

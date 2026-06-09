"""Tests for the FastAPI orchestrator.

Endpoint smoke tests use FastAPI's TestClient. The pipeline test mocks every
data client so no network is touched. Also covers seed resolution and the
report source-validation walker.
"""
import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from aria_pi import orchestrator as orch
from aria_pi.orchestrator import (
    app,
    _resolve_seeds,
    _empty_company,
    _fetch_one_company,
    _fetch_all_concurrent,
    _validate_report_sources,
)
from aria_pi.utils.source_tagger import SourceTagger

client = TestClient(app)


# ── Endpoints ────────────────────────────────────────────────────────────────

def test_root_endpoint():
    """
    Takes: A GET on /.
    Does: Calls the service root.
    Returns: 200 with the service name and endpoint list.
    """
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "ARIA-PI"


def test_status_endpoint():
    """
    Takes: A GET on /status.
    Does: Calls the status endpoint.
    Returns: 200 with status 'online' and the free data sources.
    """
    r = client.get("/status")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "online"
    assert "SEC EDGAR" in body["data_sources"]


def test_run_pipeline_with_override(monkeypatch):
    """
    Takes: A POST to /run-pipeline with an explicit company override, all data
           clients patched to return empty results.
    Does: Runs the full pipeline end-to-end (no network).
    Returns: 200 with a COMPLETED report carrying _meta resolution 'override'.
    """
    # Patch the per-company fetch so no client touches the network.
    monkeypatch.setattr(orch, "_fetch_one_company",
                        lambda name, **kw: _empty_company(name))

    r = client.post("/run-pipeline",
                    json={"sector": "biotech", "companies": ["Moderna"]})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "COMPLETED"
    assert body["data"]["_meta"]["resolution"] == "override"
    assert "section4_profiles" in body["data"]


# ── Seed resolution ──────────────────────────────────────────────────────────

def test_resolve_seeds_override():
    """
    Takes: An explicit override list.
    Does: Resolves seeds.
    Returns: The override list, tagged 'override'.
    """
    seeds, res = _resolve_seeds("anything", ["Acme"], sec=None)
    assert seeds == ["Acme"]
    assert res == "override"


def test_resolve_seeds_curated_appends_nc():
    """
    Takes: A curated sector ('biotech') with no override.
    Does: Resolves seeds.
    Returns: The curated global list plus appended NC seeds, tagged 'curated'.
    """
    seeds, res = _resolve_seeds("biotech", None, sec=None)
    assert res == "curated"
    assert "Moderna" in seeds          # global seed
    assert "IQVIA Holdings" in seeds   # NC-specific seed appended


def test_resolve_seeds_discovered():
    """
    Takes: A free-text term with a SEC client that discovers companies.
    Does: Resolves seeds.
    Returns: The discovered companies, tagged 'discovered'.
    """
    class FakeSec:
        def discover_companies(self, term, limit=15):
            return ["Freshpet", "Chewy"]

    seeds, res = _resolve_seeds("pet food", None, sec=FakeSec())
    assert res == "discovered"
    assert seeds == ["Freshpet", "Chewy"]


def test_resolve_seeds_default_when_discovery_empty():
    """
    Takes: A free-text term with discovery returning nothing.
    Does: Resolves seeds.
    Returns: The DEFAULT_SEEDS, tagged 'default'.
    """
    class FakeSec:
        def discover_companies(self, term, limit=15):
            return []

    seeds, res = _resolve_seeds("zxqw", None, sec=FakeSec())
    assert res == "default"
    assert seeds == orch.DEFAULT_SEEDS


def test_resolve_seeds_discovery_error_falls_back_to_default():
    """
    Takes: A free-text term with a SEC client that raises during discovery.
    Does: Resolves seeds.
    Returns: DEFAULT_SEEDS tagged 'default' (error swallowed).
    """
    class FakeSec:
        def discover_companies(self, term, limit=15):
            raise RuntimeError("efts 500")

    seeds, res = _resolve_seeds("zxqw", None, sec=FakeSec())
    assert res == "default"
    assert seeds == orch.DEFAULT_SEEDS


# ── Source validation walker ─────────────────────────────────────────────────

def test_validate_report_sources_counts_and_flags():
    """
    Takes: A small report tree with one double-sourced and one single-sourced
           (blocklisted) claim.
    Does: Walks the report validating sources.
    Returns: total=2, verified=1, with the bad claim recorded in issues.
    """
    report = {
        "a": {"sources": ["https://sec.gov/1", "https://pubmed.ncbi.nlm.nih.gov/2"]},
        "b": {"nested": {"sources": ["https://en.wikipedia.org/x",
                                     "https://sec.gov/3"]}},
    }
    result = _validate_report_sources(report, SourceTagger())
    assert result["total_claims"] == 2
    assert result["verified"] == 1
    assert result["unverified"] == 1
    assert result["issues"]


def test_empty_company_shape():
    """
    Takes: A company name.
    Does: Builds the empty-company stub.
    Returns: All expected keys with empty collections and an SEC fact source.
    """
    c = _empty_company("Acme")
    assert c["name"] == "Acme"
    assert c["trials"] == [] and c["pubmed"] == [] and c["nih_grants"] == []
    assert c["facts"]["source"] == "https://www.sec.gov"


# ── Concurrent per-company fetch ─────────────────────────────────────────────

def _stub_clients(facts=None, trials=None, pubmed=None, grants=None):
    """Build MagicMock clients for the four data sources."""
    sec = MagicMock()
    sec.get_company_facts.return_value = facts or {
        "legal_name": "Moderna", "source": "https://www.sec.gov"}
    sec.get_unc_alumni_from_proxy.return_value = []
    sec.get_unc_alumni_from_website.return_value = []
    tr = MagicMock(); tr.search_by_sponsor.return_value = trials or []
    pm = MagicMock(); pm.search_unc_with_company.return_value = pubmed or []
    nih = MagicMock(); nih.unc_grants_mentioning.return_value = grants or []
    return sec, tr, pm, nih


def test_fetch_one_company_assembles_and_flags_unc_trials():
    """
    Takes: Mocked clients where one trial carries a UNC signal.
    Does: Fetches one company's data concurrently.
    Returns: A dict whose unc_trials holds only the UNC-flagged trial.
    """
    trials = [
        {"nct_id": "NCT1", "unc_signal": "UNC Chapel Hill", "url": "u1"},
        {"nct_id": "NCT2", "unc_signal": "", "url": "u2"},
    ]
    sec, tr, pm, nih = _stub_clients(trials=trials)
    out = _fetch_one_company("Moderna", sec=sec, trials=tr, pubmed=pm, nih=nih)
    assert out["name"] == "Moderna"
    assert len(out["trials"]) == 2
    assert [t["nct_id"] for t in out["unc_trials"]] == ["NCT1"]


def test_fetch_one_company_merges_proxy_and_web_alumni():
    """
    Takes: A public company with DEF 14A proxy filings; proxy and website each
           return one alumnus, with one overlapping name.
    Does: Fetches one company's data.
    Returns: Alumni deduped by lowercased name.
    """
    facts = {"legal_name": "Moderna", "cik": "1682852",
             "website": "https://m.com", "source": "https://www.sec.gov",
             "filings_by_form": {"DEF 14A": [{"url": "https://sec.gov/def14a/"}]}}
    sec, tr, pm, nih = _stub_clients(facts=facts)
    sec.get_unc_alumni_from_proxy.return_value = [{"name": "Jane Doe"}]
    sec.get_unc_alumni_from_website.return_value = [
        {"name": "Jane Doe"}, {"name": "Bob Roe"}]
    out = _fetch_one_company("Moderna", sec=sec, trials=tr, pubmed=pm, nih=nih)
    names = sorted(p["name"] for p in out["unc_alumni"])
    assert names == ["Bob Roe", "Jane Doe"]  # deduped


def test_fetch_one_company_swallows_client_errors():
    """
    Takes: Clients whose lookups raise exceptions.
    Does: Fetches one company's data.
    Returns: A well-formed stub (defaults) rather than propagating the error.
    """
    sec, tr, pm, nih = _stub_clients()
    tr.search_by_sponsor.side_effect = RuntimeError("ct.gov down")
    pm.search_unc_with_company.side_effect = RuntimeError("pubmed down")
    out = _fetch_one_company("Moderna", sec=sec, trials=tr, pubmed=pm, nih=nih)
    assert out["trials"] == []
    assert out["pubmed"] == []


def test_fetch_all_concurrent_returns_in_order():
    """
    Takes: Two company names with mocked fetch.
    Does: Fetches all companies concurrently within the deadline.
    Returns: One result per name, preserving input order.
    """
    sec, tr, pm, nih = _stub_clients()
    out = _fetch_all_concurrent(["Moderna", "Pfizer"],
                                sec=sec, trials=tr, pubmed=pm, nih=nih)
    assert [c["name"] for c in out] == ["Moderna", "Pfizer"]


def test_fetch_all_concurrent_empty_list():
    """
    Takes: No company names.
    Does: Runs the concurrent fetch.
    Returns: An empty list (no pool spun up).
    """
    assert _fetch_all_concurrent([]) == []


# ── Streaming endpoint ───────────────────────────────────────────────────────

def test_run_pipeline_stream_emits_done_frame(monkeypatch):
    """
    Takes: A streaming pipeline request with per-company fetch mocked.
    Does: Consumes the SSE stream.
    Returns: A terminal 'done' frame carrying the assembled report.
    """
    monkeypatch.setattr(orch, "_fetch_one_company",
                        lambda name, **kw: _empty_company(name))
    with client.stream("POST", "/run-pipeline-stream",
                       json={"sector": "biotech", "companies": ["Moderna"]}) as r:
        assert r.status_code == 200
        frames = []
        for line in r.iter_lines():
            if line and line.startswith("data: "):
                frames.append(json.loads(line[len("data: "):]))
    types = [f.get("type") for f in frames]
    assert "stage" in types
    assert "done" in types
    done = next(f for f in frames if f["type"] == "done")
    assert "section4_profiles" in done["report"]

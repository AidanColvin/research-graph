"""ARIA-PI Orchestrator — free, no API keys.

Flow per request:
  1. Pick seed companies for the sector (curated list).
  2. Fetch real, citable data per company from free public APIs:
       • SEC EDGAR submissions  (facts + recent filings)
       • ClinicalTrials.gov v2  (pipeline)
       • PubMed (Entrez)        (UNC alignment / co-authorship)
  3. Hand to the deterministic ReportBuilder which assembles the
     7-section report using real URLs as sources.
  4. Validate sources against the blocklist (no Wikipedia / aggregators).
  5. Return the report.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import uvicorn

from aria_pi.clients.clinicaltrials_client import ClinicalTrialsClient
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.pubmed_client import PubMedClient
from aria_pi.clients.nih_reporter_client import NIHReporterClient
from aria_pi.builders.report_builder import ReportBuilder
from aria_pi.utils.source_tagger import SourceTagger
from aria_pi.sectors import (
    seeds_for as _seeds_for,
    canonical_sector,
    SECTOR_SEEDS,
    DEFAULT_SEEDS,
)


app = FastAPI(title="ARIA-PI Orchestrator", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




class PipelineRequest(BaseModel):
    sector: str
    companies: Optional[List[str]] = None
    company_override: Optional[str] = None  # legacy


@app.get("/")
async def root():
    return {"service": "ARIA-PI", "version": "0.3.0",
            "endpoints": ["/status", "/run-pipeline"]}


@app.get("/status")
async def get_status():
    return {
        "status": "online",
        "mode": "free — no API keys required",
        "data_sources": ["SEC EDGAR", "ClinicalTrials.gov", "PubMed (Entrez)"],
    }


@app.post("/run-pipeline")
async def run_pipeline(req: PipelineRequest):
    try:
        sec = SECEdgarClient()
        trials = ClinicalTrialsClient()
        tagger = SourceTagger()
        builder = ReportBuilder()
        pubmed = PubMedClient()
        nih = NIHReporterClient()

        override = req.companies or ([req.company_override] if req.company_override else None)
        seeds, resolution = _resolve_seeds(req.sector, override, sec)

        # 1. Real data collection per company — runs all sources in parallel
        # for up to 10 candidate companies within the Vercel 60s budget.
        company_data = _fetch_all_concurrent(
            seeds[:10], sec=sec, trials=trials, pubmed=pubmed, nih=nih
        )

        # 2. Deterministic synthesis
        report = builder.build(req.sector, {"sector": req.sector, "companies": company_data})

        # 3. Source-blocklist validation
        report["_validation"] = _validate_report_sources(report, tagger)
        report["_meta"] = {
            "mode": "free",
            "seed_companies": seeds[:10],
            "resolution": resolution,  # "curated" | "discovered" | "override" | "default"
            "pubmed_enabled": bool(pubmed),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }

        payload = {"sector": req.sector, "status": "COMPLETED", "data": report}
        return JSONResponse(
            content=payload,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# Wall-clock budget for the entire data-collection phase. Vercel Hobby caps
# serverless functions at 60s; we reserve the remainder for report assembly +
# cold-start margin. Whatever data has returned by the deadline is used as-is —
# the ReportBuilder derives a complete, sector-specific report from partial
# data (SEC EDGAR is the fast, reliable backbone; PubMed/NIH/Trials enrich it).
FETCH_BUDGET_SECONDS = 44


def _resolve_seeds(sector: str, override, sec) -> tuple[List[str], str]:
    """Decide which companies a report covers, in priority order:

      1. override    — caller passed explicit companies.
      2. curated      — the sector maps to one of our 24 canonical sectors,
                        which have hand-picked top-10 lists (highest quality).
      3. discovered   — ANY other free-text term ("pasta", "video games"):
                        pull real, currently-traded companies live from SEC
                        EDGAR full-text search. This is what makes the tool
                        work for arbitrary searches instead of defaulting.
      4. default      — only if SEC discovery returns nothing (network/odd
                        term): a small generic anchor list, clearly flagged.
    """
    if override:
        return list(override), "override"
    canon = canonical_sector(sector)
    if canon and canon in SECTOR_SEEDS:
        return SECTOR_SEEDS[canon], "curated"
    try:
        discovered = sec.discover_companies(sector, limit=10)
    except Exception as e:
        print(f"discovery failed for '{sector}': {e}")
        discovered = []
    if discovered:
        return discovered, "discovered"
    return DEFAULT_SEEDS, "default"


def _empty_company(name: str) -> dict:
    return {"name": name, "facts": {"legal_name": name, "source": "https://www.sec.gov"},
            "trials": [], "unc_trials": [], "pubmed": [], "pubmed_coi": [],
            "nih_grants": [], "unc_alumni": []}


def _fetch_one_company(name: str, sec, trials, pubmed, nih) -> dict:
    """Run the data-source lookups for one company in parallel.

    PubMed is deliberately limited to ONE combined query (was 7+ per company)
    because the unauthenticated E-utilities endpoint rate-limits to ~3 req/s
    and the school-by-school + COI fan-out was the dominant cause of timeouts.
    """
    def safe(fn, label, default):
        try:
            return fn()
        except Exception as e:
            print(f"{label} failed for {name}: {e}")
            return default

    defaults = {
        "facts": {"legal_name": name, "source": "https://www.sec.gov"},
        "trials": [], "pubmed": [], "nih_grants": [],
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            "facts": pool.submit(safe,
                lambda: sec.get_company_facts(name), "SEC", defaults["facts"]),
            "trials": pool.submit(safe,
                lambda: trials.search_by_sponsor(name), "Trials", []),
            "pubmed": pool.submit(safe,
                lambda: pubmed.search_unc_with_company(name, max_results=8),
                "PubMed", []),
            "nih_grants": pool.submit(safe,
                lambda: nih.unc_grants_mentioning(name, max_results=8),
                "NIH Reporter", []),
        }
        results = {}
        for k, f in futures.items():
            try:
                results[k] = f.result(timeout=FETCH_BUDGET_SECONDS)
            except Exception as e:
                print(f"{k} timed out for {name}: {e}")
                results[k] = defaults[k]

    company_trials = results["trials"] or []
    unc_trials = [t for t in company_trials if t.get("unc_signal")]

    # Alumni fetch runs after facts — needs the CIK and DEF 14A URLs from facts
    cik = str(results["facts"].get("cik") or "")
    proxy_filings = (results["facts"].get("filings_by_form") or {}).get("DEF 14A", [])
    unc_alumni = safe(
        lambda: sec.get_unc_alumni_from_proxy(cik, proxy_filings),
        "Alumni", [],
    ) if cik else []  # private companies have no CIK → skip entirely

    return {
        "name": name,
        "facts": results["facts"],
        "trials": company_trials[:12],
        "unc_trials": unc_trials,
        "pubmed": results["pubmed"],
        "pubmed_coi": [],
        "nih_grants": results["nih_grants"],
        "unc_alumni": unc_alumni,
    }


def _fetch_all_concurrent(names: List[str], **clients) -> List[dict]:
    """Fetch data for every named company concurrently within a hard deadline.

    The total wait can never exceed FETCH_BUDGET_SECONDS: any company whose
    data has not returned by the deadline is filled with an SEC-only stub so
    the report still renders. This is what makes the endpoint reliable for
    every sector inside the serverless time limit.
    """
    if not names:
        return []
    out_by_name: dict[str, dict] = {n: _empty_company(n) for n in names}
    deadline = time.monotonic() + FETCH_BUDGET_SECONDS
    with ThreadPoolExecutor(max_workers=len(names)) as pool:
        future_to_name = {
            pool.submit(_fetch_one_company, n, **clients): n for n in names
        }
        for fut, name in future_to_name.items():
            remaining = deadline - time.monotonic()
            try:
                out_by_name[name] = fut.result(timeout=max(0.1, remaining))
            except Exception as e:
                print(f"Company fetch deadline/err for {name}: {e}")
                # keep the SEC-only stub already in out_by_name
    return [out_by_name[n] for n in names]


def _validate_report_sources(report: dict, tagger: SourceTagger) -> dict:
    issues: List[dict] = []
    valid = 0
    total = 0

    def visit(node, path="root"):
        nonlocal valid, total
        if isinstance(node, dict):
            srcs = node.get("sources")
            if isinstance(srcs, list) and srcs:
                total += 1
                ok, clean = tagger.validate_claim("", srcs)
                if ok:
                    valid += 1
                else:
                    issues.append({"path": path, "sources": srcs,
                                   "reason": f"Only {len(clean)} valid sources"})
            for k, v in node.items():
                visit(v, f"{path}.{k}")
        elif isinstance(node, list):
            for i, item in enumerate(node):
                visit(item, f"{path}[{i}]")

    visit(report)
    return {"total_claims": total, "verified": valid,
            "unverified": total - valid, "issues": issues[:20]}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

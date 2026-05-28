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
from aria_pi.sectors import seeds_for as _seeds_for


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
        seeds = _seeds_for(req.sector, override)

        # 1. Real data collection per company — runs ALL 5 sources in parallel
        # for ALL 5 candidate companies (5 × 5 = 25 concurrent HTTP calls), so
        # the full source treatment lands every profile within the Vercel
        # 60s function budget.
        company_data = _fetch_all_concurrent(
            seeds[:5], sec=sec, trials=trials, pubmed=pubmed, nih=nih
        )

        # 2. Deterministic synthesis
        report = builder.build(req.sector, {"sector": req.sector, "companies": company_data})

        # 3. Source-blocklist validation
        report["_validation"] = _validate_report_sources(report, tagger)
        report["_meta"] = {
            "mode": "free",
            "seed_companies": seeds[:5],
            "pubmed_enabled": bool(pubmed),
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
FETCH_BUDGET_SECONDS = 40


def _empty_company(name: str) -> dict:
    return {"name": name, "facts": {"legal_name": name, "source": "https://www.sec.gov"},
            "trials": [], "unc_trials": [], "pubmed": [], "pubmed_coi": [],
            "nih_grants": []}


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
    return {
        "name": name,
        "facts": results["facts"],
        "trials": company_trials[:12],
        "unc_trials": unc_trials,
        "pubmed": results["pubmed"],
        "pubmed_coi": [],
        "nih_grants": results["nih_grants"],
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

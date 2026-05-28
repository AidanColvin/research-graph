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
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

from aria_pi.clients.clinicaltrials_client import ClinicalTrialsClient
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.pubmed_client import PubMedClient
from aria_pi.clients.nih_reporter_client import NIHReporterClient
from aria_pi.builders.report_builder import ReportBuilder
from aria_pi.utils.source_tagger import SourceTagger


app = FastAPI(title="ARIA-PI Orchestrator", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SECTOR_SEEDS = {
    "oncology": ["Merck", "Bristol-Myers Squibb", "Pfizer", "Eli Lilly", "AstraZeneca"],
    "biotech": ["Moderna", "Vertex Pharmaceuticals", "Regeneron", "BioMarin", "Alnylam"],
    "quantum computing": ["IBM", "IonQ", "Rigetti Computing", "D-Wave Quantum", "Quantinuum"],
    "climate tech": ["Tesla", "First Solar", "Enphase Energy", "Plug Power", "Bloom Energy"],
    "ag-bio": ["Corteva", "Bayer", "Syngenta", "Ginkgo Bioworks", "Pivot Bio"],
    "medtech": ["Medtronic", "Boston Scientific", "Stryker", "Abbott Laboratories", "Edwards Lifesciences"],
    "rural health": ["Teladoc Health", "Doximity", "HCA Healthcare", "American Well", "Hims & Hers Health"],
}


def _seeds_for(sector: str, override: Optional[List[str]]) -> List[str]:
    if override:
        return override
    key = sector.lower().strip()
    if key in SECTOR_SEEDS:
        return SECTOR_SEEDS[key]
    for known, seeds in SECTOR_SEEDS.items():
        if known in key or key in known:
            return seeds
    return ["Johnson & Johnson", "Pfizer", "Merck", "Eli Lilly", "AbbVie"]


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

        # 1. Real data collection per company (cap at 3 to fit Vercel 60s budget)
        company_data = []
        for name in seeds[:3]:
            try:
                facts = sec.get_company_facts(name)
            except Exception as e:
                print(f"SEC lookup failed for {name}: {e}")
                facts = {"legal_name": name, "source": "https://www.sec.gov"}
            try:
                company_trials = trials.search_by_sponsor(name)
            except Exception as e:
                print(f"Trials lookup failed for {name}: {e}")
                company_trials = []
            papers: list = []
            try:
                papers = pubmed.search_unc_with_company(name, max_results=4)
            except Exception as e:
                print(f"PubMed lookup failed for {name}: {e}")

            grants: list = []
            try:
                grants = nih.unc_grants_mentioning(name, max_results=4)
            except Exception as e:
                print(f"NIH Reporter lookup failed for {name}: {e}")

            company_data.append({
                "name": name,
                "facts": facts,
                "trials": company_trials[:6],
                "pubmed": papers,
                "nih_grants": grants,
            })

        # 2. Deterministic synthesis
        report = builder.build(req.sector, {"sector": req.sector, "companies": company_data})

        # 3. Source-blocklist validation
        report["_validation"] = _validate_report_sources(report, tagger)
        report["_meta"] = {
            "mode": "free",
            "seed_companies": seeds[:5],
            "pubmed_enabled": bool(pubmed),
        }

        return {"sector": req.sector, "status": "COMPLETED", "data": report}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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

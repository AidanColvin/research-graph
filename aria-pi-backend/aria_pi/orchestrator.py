"""ARIA-PI Orchestrator — full partnership intelligence pipeline.

Flow per request:
  1. Fetch real data from SEC EDGAR + ClinicalTrials.gov for seed companies in the sector.
  2. Pass that data to Claude with strict sourcing instructions.
  3. Claude returns a structured JSON report following the template.
  4. SourceTagger validates claims against the blocklist.
  5. Return JSON to the frontend.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

from aria_pi.clients.clinicaltrials_client import ClinicalTrialsClient
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.claude_client import ClaudeClient
from aria_pi.utils.source_tagger import SourceTagger


app = FastAPI(title="ARIA-PI Orchestrator", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Sector → seed company candidates ──────────────────────────────────────────
# Used when no explicit companies are passed. Keeps the demo flow alive while
# the BD team builds out their own seed list per sector.
SECTOR_SEEDS = {
    "oncology": ["Merck", "Bristol-Myers Squibb", "Pfizer", "Eli Lilly", "AstraZeneca"],
    "biotech": ["Moderna", "Vertex Pharmaceuticals", "Regeneron", "BioMarin", "Alnylam"],
    "quantum computing": ["IBM", "IonQ", "Rigetti Computing", "D-Wave", "Quantinuum"],
    "climate tech": ["Tesla", "First Solar", "Enphase Energy", "Plug Power", "Bloom Energy"],
    "ag-bio": ["Corteva", "Bayer", "Syngenta", "Ginkgo Bioworks", "Pivot Bio"],
    "medtech": ["Medtronic", "Boston Scientific", "Stryker", "Abbott", "Edwards Lifesciences"],
    "rural health": ["Teladoc", "Doximity", "HCA Healthcare", "Amwell", "Hims & Hers"],
}


def _seeds_for(sector: str, override: Optional[List[str]]) -> List[str]:
    if override:
        return override
    key = sector.lower().strip()
    if key in SECTOR_SEEDS:
        return SECTOR_SEEDS[key]
    # Best-effort fuzzy match
    for known, seeds in SECTOR_SEEDS.items():
        if known in key or key in known:
            return seeds
    # Generic fallback so the pipeline still runs on unknown sectors
    return ["Johnson & Johnson", "Pfizer", "Merck", "Eli Lilly", "AbbVie"]


class PipelineRequest(BaseModel):
    sector: str
    companies: Optional[List[str]] = None
    company_override: Optional[str] = None  # legacy


@app.get("/")
async def root():
    return {"service": "ARIA-PI", "version": "0.2.0", "endpoints": ["/status", "/run-pipeline"]}


@app.get("/status")
async def get_status():
    claude = ClaudeClient()
    return {
        "status": "online",
        "claude_live": claude.is_live,
        "model": claude.model,
        "modules_loaded": ["SEC EDGAR", "ClinicalTrials.gov", "PubMed", "SourceTagger", "Claude"],
    }


@app.post("/run-pipeline")
async def run_pipeline(req: PipelineRequest):
    """Generate a full partnership intelligence report for the requested sector."""
    try:
        sec = SECEdgarClient()
        trials = ClinicalTrialsClient()
        tagger = SourceTagger()
        claude = ClaudeClient()

        override = req.companies or ([req.company_override] if req.company_override else None)
        seeds = _seeds_for(req.sector, override)

        # 1. Fetch real, attributable data per seed company
        company_data = []
        for name in seeds[:5]:
            facts = sec.get_company_facts(name)
            company_trials = trials.search_by_sponsor(name)
            company_data.append({
                "name": name,
                "facts": facts,
                "trials": company_trials[:5],
            })

        # 2. Hand to Claude for structured synthesis
        real_data = {"sector": req.sector, "companies": company_data}
        report = claude.generate_report(req.sector, real_data)

        # 3. Validate every sourced claim against the blocklist
        validation = _validate_report_sources(report, tagger)
        report["_validation"] = validation
        report["_meta"] = {
            "claude_live": claude.is_live,
            "model": claude.model,
            "seed_companies": seeds[:5],
        }

        return {"sector": req.sector, "status": "COMPLETED", "data": report}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def _validate_report_sources(report: dict, tagger: SourceTagger) -> dict:
    """Walk the report and flag any claim whose sources fail the 2-source rule."""
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

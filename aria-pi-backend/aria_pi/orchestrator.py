from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel

from aria_pi.clients.clinicaltrials_client import ClinicalTrialsClient
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.utils.source_tagger import SourceTagger

app = FastAPI(title="ARIA-PI Orchestrator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PipelineRequest(BaseModel):
    sector: str
    company_override: str = None

@app.get("/status")
async def get_status():
    """
    Takes: Nothing
    Does: Health check for the API
    Returns: JSON status dictionary
    """
    return {"status": "online", "modules_loaded": ["ClinicalTrials", "SEC", "SourceTagger"]}

@app.post("/run-pipeline")
async def run_pipeline(req: PipelineRequest):
    """
    Takes: PipelineRequest object with sector name
    Does: Executes the data retrieval pipeline for the given sector
    Returns: JSON payload containing structured report data
    """
    try:
        sec_client = SECEdgarClient()
        trials_client = ClinicalTrialsClient()
        tagger = SourceTagger()
        
        target_company = req.company_override or "Johnson & Johnson"
        
        facts = sec_client.get_company_facts(target_company)
        trials = trials_client.search_by_sponsor(target_company)
        
        mock_sources = ["https://clinicaltrials.gov/123", "https://pubmed.ncbi.nlm.nih.gov/456"]
        validated_claim = tagger.tag_or_flag(f"{target_company} has an active pipeline.", mock_sources, "Stage 4")
        
        return {
            "sector": req.sector,
            "status": "COMPLETED",
            "data": {
                "company_name": target_company,
                "facts": facts,
                "pipeline_trial_count": len(trials),
                "verified_claims": [
                    {
                        "text": validated_claim.text,
                        "is_verified": validated_claim.is_verified
                    }
                ]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

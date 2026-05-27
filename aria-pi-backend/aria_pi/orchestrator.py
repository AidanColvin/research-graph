from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="ARIA-PI Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/status")
async def get_status():
    """
    Takes: Nothing
    Does: Checks if the API is active
    Returns: JSON status dictionary
    """
    return {"status": "online", "current_stage": "IDLE"}

@app.post("/run/{sector}")
async def run_pipeline(sector: str):
    """
    Takes: Sector name as a string
    Does: Initiates the 8-stage ARIA pipeline for the given sector
    Returns: JSON confirmation dictionary
    """
    return {"message": f"Pipeline started for {sector}", "stage": "SECTOR_OVERVIEW"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

from pydantic import BaseModel
from typing import List, Dict, Optional
from aria_pi.models.claim import Claim

class CompanyProfile(BaseModel):
    company_name: str
    facts: Dict[str, str]
    pipeline: List[Claim]
    partnering_history: List[Claim]
    unc_alignment: List[Claim]
    what_unc_offers: List[Claim]

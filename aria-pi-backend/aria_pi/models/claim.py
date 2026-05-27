from pydantic import BaseModel
from typing import List, Optional

class Claim(BaseModel):
    text: str
    sources: List[str]
    is_verified: bool = False
    stage: str
    company_name: Optional[str] = None
    unverified_reason: Optional[str] = None

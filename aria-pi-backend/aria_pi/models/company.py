from pydantic import BaseModel
from typing import List, Optional

class Company(BaseModel):
    name: str
    score: int = 0
    risk_flag: bool = False
    exclusion_reason: Optional[str] = None

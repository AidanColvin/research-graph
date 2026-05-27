import os
import yaml
from pydantic import BaseModel

class Config(BaseModel):
    companies_per_report: int = 5
    selection_score_threshold: int = 55
    claude_model: str = "claude-3-5-sonnet-20240620"

def load_config() -> Config:
    """
    Takes: Nothing
    Does: Loads the configuration settings
    Returns: Config object
    """
    return Config()

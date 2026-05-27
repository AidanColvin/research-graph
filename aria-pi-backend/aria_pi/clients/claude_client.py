class ClaudeClient:
    def __init__(self, api_key: str = None):
        """
        Takes: api_key as a string.
        Does: Initializes a MOCK client that costs $0.
        Returns: Nothing.
        """
        print("Initialized FREE MOCK Claude Client.")

    def synthesize_section(self, system_prompt: str, user_prompt: str, raw_sources: list[dict], model: str = "mock-model") -> str:
        """
        Takes: Prompts and sources.
        Does: Returns fake markdown data instantly for UI testing.
        Returns: String.
        """
        return """
### [MOCK DATA] Sector Overview

This is a simulated response so you can test your frontend UI for free. 
* **Market Size:** $45 Billion [1][2]
* **UNC Alignment:** Strong ties to Gillings School of Global Public Health [3]

**Talking Point:**
Company X has a massive pipeline that aligns perfectly with our recent data assets.
"""

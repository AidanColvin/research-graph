import requests

class SECEdgarClient:
    def __init__(self):
        """
        Takes: Nothing.
        Does: Initializes the SEC EDGAR API client with required headers.
        Returns: Nothing.
        """
        self.base_url = "https://efts.sec.gov/LATEST/search-index"
        # SEC requires a user-agent in the format: CompanyName ContactEmail
        self.headers = {"User-Agent": "InnovateCarolina research.intelligence@unc.edu"}

    def get_company_facts(self, company_name: str) -> dict:
        """
        Takes: company_name as a string.
        Does: Retrieves basic corporate facts from recent SEC filings.
        Returns: A dictionary of company facts.
        """
        params = {"q": company_name}
        try:
            response = requests.get(self.base_url, headers=self.headers, params=params)
            response.raise_for_status()
            data = response.json()
            
            hits = data.get("hits", {}).get("hits", [])
            if not hits:
                return {}
                
            # Extract from the most relevant recent filing
            source = hits[0].get("_source", {})
            return {
                "legal_name": source.get("display_names", [company_name])[0],
                "ciks": source.get("ciks", []),
                "sic": source.get("sics", [""])[0],
                "source": "SEC EDGAR"
            }
        except Exception as e:
            print(f"SEC EDGAR API error: {e}")
            return {}

import requests

class ClinicalTrialsClient:
    def __init__(self):
        """
        Takes: Nothing.
        Does: Initializes the ClinicalTrials.gov API client.
        Returns: Nothing.
        """
        self.base_url = "https://clinicaltrials.gov/api/v2/studies"

    def search_by_sponsor(self, sponsor_name: str) -> list[dict]:
        """
        Takes: sponsor_name as a string.
        Does: Searches for clinical trials sponsored by the given company.
        Returns: A list of trial dictionaries containing NCT ID, title, and phase.
        """
        params = {
            "query.term": sponsor_name,
            "pageSize": 10
        }
        try:
            response = requests.get(self.base_url, params=params, timeout=6)
            response.raise_for_status()
            data = response.json()
            
            trials = []
            for study in data.get("studies", []):
                protocol = study.get("protocolSection", {})
                identification = protocol.get("identificationModule", {})
                design = protocol.get("designModule", {})
                
                trials.append({
                    "nct_id": identification.get("nctId", ""),
                    "title": identification.get("briefTitle", ""),
                    "phase": ", ".join(design.get("phases", [])),
                    "url": f"https://clinicaltrials.gov/study/{identification.get('nctId', '')}"
                })
            return trials
        except Exception as e:
            print(f"ClinicalTrials API error: {e}")
            return []

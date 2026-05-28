"""PubMed Entrez client — free, no API key required.

Uses direct HTTP against E-utilities (no Biopython dependency) so it works
reliably on Vercel Python serverless. Searches both AFFILIATION and TEXT
to catch UNC↔industry co-authored publications, which are the primary
public signal of an existing research relationship.
"""
import requests
from typing import List
import xml.etree.ElementTree as ET

ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
EMAIL = "research.intelligence@unc.edu"
TOOL = "aria-pi"


class PubMedClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key
        self.timeout = 8

    def search_unc_with_company(self, company_name: str, max_results: int = 5) -> List[dict]:
        """Find publications co-authored by UNC affiliation that also mention the company.

        Query strategy: search PubMed for `(<company>[Title/Abstract]) AND
        (UNC Chapel Hill[Affiliation])`. This is the most reliable way to
        surface real co-authored work — which universities must disclose as
        a relationship under research-integrity policies.
        """
        term = (f'("{company_name}"[Title/Abstract] OR {company_name}[Affiliation])'
                f' AND ("University of North Carolina"[Affiliation]'
                f' OR "UNC Chapel Hill"[Affiliation])')
        return self._run(term, max_results)

    def search_coi_disclosures(self, company_name: str, max_results: int = 3) -> List[dict]:
        """Find UNC-authored papers that disclose a relationship with the company.

        Journals require COI disclosures (consulting fees, equity, research
        funding) in the body of the paper. Searching `<company> AND
        ("conflict of interest" OR "disclosure" OR "funding")` against a UNC
        affiliation surfaces these public disclosures.
        """
        term = (f'("{company_name}"[Title/Abstract])'
                f' AND ("conflict of interest"[Title/Abstract]'
                f'      OR "disclosure"[Title/Abstract]'
                f'      OR "funding"[Title/Abstract])'
                f' AND ("University of North Carolina"[Affiliation]'
                f'      OR "UNC Chapel Hill"[Affiliation])')
        return self._run(term, max_results)

    def search_by_affiliation(self, query: str, affiliation: str, max_results: int = 5) -> List[dict]:
        """Legacy entry point kept for compatibility."""
        term = f"({query}) AND ({affiliation}[Affiliation])"
        return self._run(term, max_results)

    def _run(self, term: str, max_results: int) -> List[dict]:
        params = {
            "db": "pubmed",
            "term": term,
            "retmax": str(max_results),
            "retmode": "json",
            "tool": TOOL,
            "email": EMAIL,
        }
        if self.api_key:
            params["api_key"] = self.api_key

        try:
            r = requests.get(ESEARCH, params=params, timeout=self.timeout)
            r.raise_for_status()
            ids = (r.json().get("esearchresult") or {}).get("idlist") or []
        except Exception as e:
            print(f"PubMed esearch error: {e}")
            return []

        if not ids:
            return []

        # Pull summaries
        sp = {
            "db": "pubmed",
            "id": ",".join(ids),
            "retmode": "json",
            "tool": TOOL,
            "email": EMAIL,
        }
        if self.api_key:
            sp["api_key"] = self.api_key

        try:
            r = requests.get(ESUMMARY, params=sp, timeout=self.timeout)
            r.raise_for_status()
            result = r.json().get("result") or {}
        except Exception as e:
            print(f"PubMed esummary error: {e}")
            return []

        papers = []
        for pmid in ids:
            item = result.get(pmid) or {}
            if not item:
                continue
            authors_raw = item.get("authors") or []
            authors = [a.get("name") for a in authors_raw if a.get("name")][:4]
            pubdate = item.get("pubdate") or ""
            papers.append({
                "pmid": pmid,
                "title": item.get("title") or "",
                "authors": authors,
                "journal": item.get("fulljournalname") or item.get("source") or "",
                "year": pubdate[:4] if pubdate else "",
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            })
        return papers

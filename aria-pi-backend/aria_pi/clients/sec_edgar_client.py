"""SEC EDGAR client — fully free, no API key required.

Uses two SEC endpoints:
  1. efts.sec.gov/LATEST/search-index  — full-text filing search
  2. data.sec.gov/submissions/CIK{cik}.json  — rich company submissions
"""
import requests
from typing import Optional

USER_AGENT = "InnovateCarolina research.intelligence@unc.edu"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}


class SECEdgarClient:
    def __init__(self):
        self.search_url = "https://efts.sec.gov/LATEST/search-index"
        self.submissions_url = "https://data.sec.gov/submissions/CIK{cik}.json"

    def get_company_facts(self, company_name: str) -> dict:
        """Search EDGAR for a company and return enriched facts.

        Returns a dict with legal_name, cik, sic, ticker, hq, employees,
        and recent filings (with URLs). Empty fields when SEC has nothing.
        """
        cik = self._find_cik(company_name)
        if not cik:
            return {"legal_name": company_name, "source": "https://www.sec.gov"}

        try:
            url = self.submissions_url.format(cik=str(cik).zfill(10))
            r = requests.get(url, headers=HEADERS, timeout=6)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"SEC submissions error: {e}")
            return {"legal_name": company_name, "cik": cik, "source": "https://www.sec.gov"}

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", []) or []
        dates = recent.get("filingDate", []) or []
        accessions = recent.get("accessionNumber", []) or []
        primary_docs = recent.get("primaryDocument", []) or []

        recent_filings = []
        for i in range(min(len(forms), 40)):
            recent_filings.append({
                "form": forms[i],
                "date": dates[i] if i < len(dates) else "",
                "url": _filing_url(cik, accessions[i] if i < len(accessions) else "",
                                   primary_docs[i] if i < len(primary_docs) else ""),
            })

        addresses = data.get("addresses", {}) or {}
        biz = addresses.get("business", {}) or {}
        hq = f"{biz.get('city', '')}, {biz.get('stateOrCountry', '')}".strip(", ")

        return {
            "legal_name": data.get("name", company_name),
            "cik": cik,
            "sic": data.get("sicDescription", "") or data.get("sic", ""),
            "tickers": data.get("tickers", []) or [],
            "exchanges": data.get("exchanges", []) or [],
            "hq": hq,
            "website": data.get("website", "") or "",
            "category": data.get("category", "") or "",
            "entity_type": data.get("entityType", "") or "",
            "recent_filings": recent_filings,
            "edgar_url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}",
            "source": "https://www.sec.gov",
        }

    def _find_cik(self, company_name: str) -> Optional[str]:
        try:
            r = requests.get(self.search_url, headers=HEADERS,
                             params={"q": company_name}, timeout=6)
            r.raise_for_status()
            hits = r.json().get("hits", {}).get("hits", []) or []
            for hit in hits:
                ciks = (hit.get("_source", {}) or {}).get("ciks", []) or []
                if ciks:
                    return str(ciks[0]).lstrip("0") or ciks[0]
            return None
        except Exception as e:
            print(f"SEC search error: {e}")
            return None


def _filing_url(cik: str, accession: str, doc: str) -> str:
    if not accession:
        return f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"
    acc_clean = accession.replace("-", "")
    if doc:
        return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_clean}/{doc}"
    return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_clean}/"

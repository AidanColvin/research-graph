"""SEC EDGAR client — fully free, no API key required.

Uses two SEC endpoints:
  1. efts.sec.gov/LATEST/search-index  — full-text filing search
  2. data.sec.gov/submissions/CIK{cik}.json  — rich company submissions
"""
import requests
from typing import Optional

USER_AGENT = "InnovateCarolina research.intelligence@unc.edu"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

_TICKERS_CACHE: list | None = None


def _load_tickers() -> list:
    """Load SEC's official company-tickers map once per cold start.

    Returns a list of dicts: [{cik_str, ticker, title}, ...]
    """
    global _TICKERS_CACHE
    if _TICKERS_CACHE is not None:
        return _TICKERS_CACHE
    try:
        r = requests.get("https://www.sec.gov/files/company_tickers.json",
                         headers=HEADERS, timeout=8)
        r.raise_for_status()
        raw = r.json()
        _TICKERS_CACHE = list(raw.values()) if isinstance(raw, dict) else []
    except Exception as e:
        print(f"SEC tickers load error: {e}")
        _TICKERS_CACHE = []
    return _TICKERS_CACHE


class SECEdgarClient:
    def __init__(self):
        self.search_url = "https://efts.sec.gov/LATEST/search-index"
        self.submissions_url = "https://data.sec.gov/submissions/CIK{cik}.json"
        self.companyfacts_url = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

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

        # Pull headline financials from XBRL company facts
        xbrl = self._get_xbrl_facts(cik)

        # Separate out specific filing types for prominent display
        by_form: dict[str, list] = {}
        for f in recent_filings:
            by_form.setdefault(f.get("form", "OTHER"), []).append(f)

        edgar_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"
        return {
            "legal_name": data.get("name", company_name),
            "cik": cik,
            "sic": str(data.get("sicDescription") or data.get("sic") or ""),
            "tickers": data.get("tickers", []) or [],
            "exchanges": data.get("exchanges", []) or [],
            "hq": hq,
            "website": data.get("website", "") or "",
            "category": data.get("category", "") or "",
            "entity_type": data.get("entityType", "") or "",
            "fiscal_year_end": data.get("fiscalYearEnd", "") or "",
            "recent_filings": recent_filings,
            "filings_by_form": {
                "10-K": by_form.get("10-K", [])[:3],
                "10-Q": by_form.get("10-Q", [])[:3],
                "8-K": by_form.get("8-K", [])[:5],
                "DEF 14A": by_form.get("DEF 14A", [])[:2],
                "S-1": by_form.get("S-1", [])[:1],
            },
            "edgar_url": edgar_url,
            "xbrl": xbrl,
            "source": "https://www.sec.gov",
        }

    def _get_xbrl_facts(self, cik: str) -> dict:
        """Pull headline financials from SEC's XBRL company-facts endpoint.

        Returns the most recent ANNUAL (10-K) reported value for each concept,
        with the form, accession number, and URL so each fact is independently
        verifiable.
        """
        try:
            url = self.companyfacts_url.format(cik=str(cik).zfill(10))
            r = requests.get(url, headers=HEADERS, timeout=6)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"XBRL fetch error for CIK {cik}: {e}")
            return {}

        us_gaap = ((data.get("facts") or {}).get("us-gaap") or {})
        dei = ((data.get("facts") or {}).get("dei") or {})

        def latest_annual(concept_name: str, unit: str, source: dict = us_gaap):
            concept = source.get(concept_name) or {}
            entries = ((concept.get("units") or {}).get(unit) or [])
            # Prefer 10-K filings (annual). Fall back to most recent.
            annual = [e for e in entries if e.get("form") == "10-K" and e.get("fp") == "FY"]
            pool = annual or entries
            if not pool:
                return None
            pick = max(pool, key=lambda e: e.get("end", ""))
            accn = pick.get("accn", "")
            acc_clean = accn.replace("-", "")
            url = (f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_clean}/"
                   f"{accn}-index.htm") if accn else (
                f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}")
            return {
                "value": pick.get("val"),
                "end": pick.get("end"),
                "fy": pick.get("fy"),
                "form": pick.get("form"),
                "url": url,
            }

        # Try preferred concept, fall back to alternates
        revenue = (latest_annual("Revenues", "USD")
                   or latest_annual("RevenueFromContractWithCustomerExcludingAssessedTax", "USD")
                   or latest_annual("SalesRevenueNet", "USD"))
        return {
            "revenue": revenue,
            "rd_expense": latest_annual("ResearchAndDevelopmentExpense", "USD"),
            "net_income": latest_annual("NetIncomeLoss", "USD"),
            "total_assets": latest_annual("Assets", "USD"),
            "stockholders_equity": latest_annual("StockholdersEquity", "USD"),
            "employees": latest_annual("EntityNumberOfEmployees", "pure", source=dei),
            "shares_outstanding": latest_annual("EntityCommonStockSharesOutstanding", "shares", source=dei),
        }

    def _find_cik(self, company_name: str) -> Optional[str]:
        """Resolve a company name → CIK using SEC's official ticker map first,
        then fall back to full-text search."""
        q = (company_name or "").lower().strip()
        tickers = _load_tickers()
        # Exact-ish match on title or ticker. Score by overlap and short prefix.
        best = None
        best_score = 0
        for t in tickers:
            title = (t.get("title") or "").lower()
            sym = (t.get("ticker") or "").lower()
            if not title:
                continue
            score = 0
            if q == sym:
                score = 100
            elif q == title:
                score = 95
            elif title.startswith(q + " ") or title.startswith(q + ","):
                score = 80
            elif q in title.split():
                score = 60
            elif q in title:
                score = 40
            if score > best_score:
                best_score = score
                best = t
        if best and best_score >= 40:
            return str(best["cik_str"])

        # Fallback to full-text search
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

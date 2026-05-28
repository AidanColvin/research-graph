"""SEC EDGAR client — fully free, no API key required.

Uses two SEC endpoints:
  1. efts.sec.gov/LATEST/search-index  — full-text filing search
  2. data.sec.gov/submissions/CIK{cik}.json  — rich company submissions
"""
import time
import requests
from datetime import date
from typing import Optional, List

USER_AGENT = "InnovateCarolina research.intelligence@unc.edu"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

_TICKERS_CACHE: list | None = None
_CIK_TITLE_CACHE: dict | None = None


def _active_cik_titles() -> dict:
    """Map {int(cik): official_title} for every currently-traded SEC filer.

    Used to filter full-text search hits down to live, public companies so
    discovery never surfaces defunct shells (e.g. THQ, Midway)."""
    global _CIK_TITLE_CACHE
    if _CIK_TITLE_CACHE is not None:
        return _CIK_TITLE_CACHE
    out: dict = {}
    for t in _load_tickers():
        try:
            out[int(t["cik_str"])] = t.get("title") or ""
        except (KeyError, ValueError, TypeError):
            continue
    _CIK_TITLE_CACHE = out
    return out


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

    def discover_companies(self, term: str, limit: int = 10) -> List[str]:
        """Find real, currently-traded public companies for ANY free-text term.

        Strategy: SEC EDGAR full-text search over recent 10-K annual reports
        (the filing where a company describes its own business), then keep only
        hits that resolve to a CIK present in SEC's official ticker map — i.e.
        companies that are actually public and active today. This is what lets
        the pipeline build a genuine, sector-relevant report for searches like
        "pasta" or "video games" instead of falling back to a default list.

        Every returned name resolves cleanly back to a CIK via _find_cik, so the
        downstream SEC/NIH/trial/PubMed lookups all key off real EDGAR data.
        """
        term = (term or "").strip()
        if not term:
            return []
        active = _active_cik_titles()
        if not active:
            return []
        # Bias toward live filers: last ~4 fiscal years of 10-K business
        # descriptions. Phrase-quote multi-word terms for precision.
        q = f'"{term}"' if " " in term else term
        start = date(date.today().year - 4, 1, 1).isoformat()
        end = date.today().isoformat()

        # Pull a few pages so we can RANK companies by how often the term
        # appears in their filings. A company whose 10-Ks repeatedly match the
        # term is far more on-topic than one with a single incidental mention
        # (which is how noise like "Vail Resorts" for "pasta" used to slip in).
        #
        # The first page is fetched exactly like a plain single query (no
        # `from`) because that form is the most reliable; SEC's efts endpoint
        # intermittently 500s on paginated/rapid requests, so extra pages are
        # strictly best-effort and a later failure never discards earlier hits.
        freq: dict[int, int] = {}
        order: list[int] = []

        def ingest(hits: list) -> None:
            for h in hits:
                for c in (h.get("_source", {}) or {}).get("ciks", []) or []:
                    try:
                        ci = int(c)
                    except (ValueError, TypeError):
                        continue
                    if ci not in active:
                        continue
                    if ci not in freq:
                        order.append(ci)
                    freq[ci] = freq.get(ci, 0) + 1

        base = {"q": q, "forms": "10-K", "startdt": start, "enddt": end}
        for page in range(3):  # ~30 hits total, best-effort
            params = dict(base)
            if page > 0:
                params["from"] = page * 10
                time.sleep(0.35)  # be gentle: efts throttles rapid requests
            try:
                r = requests.get(self.search_url, headers=HEADERS,
                                 timeout=8, params=params)
                r.raise_for_status()
                hits = r.json().get("hits", {}).get("hits", []) or []
            except Exception as e:
                print(f"SEC discovery error for '{term}' (page {page}): {e}")
                if page == 0:
                    return []  # genuine failure — nothing to rank
                break          # keep whatever earlier pages returned
            if not hits:
                break
            ingest(hits)

        # Rank by match frequency (desc), then first-appearance (SEC relevance).
        first_seen = {ci: i for i, ci in enumerate(order)}
        ranked = sorted(order, key=lambda ci: (-freq[ci], first_seen[ci]))
        return [active[ci] for ci in ranked[:limit]]

    def get_company_facts(self, company_name: str) -> dict:
        """Search EDGAR for a company and return enriched facts.

        Returns a dict with legal_name, cik, sic, ticker, hq, employees,
        and recent filings (with URLs). Empty fields when SEC has nothing.
        """
        cik = self._find_cik(company_name)
        if not cik:
            # No CIK => not a current SEC filer (e.g. a private company like
            # OpenAI, Anthropic, or Epic Systems). Say so honestly instead of
            # later printing a false "SEC-registered" claim downstream.
            return {"legal_name": company_name, "is_public": False,
                    "source": "https://www.sec.gov"}

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
            "is_public": True,
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
            elif len(q) >= 5 and q in title:
                score = 50
            if score > best_score:
                best_score = score
                best = t
        # Require a reasonably strong match. A bare substring (old score 40)
        # let private names like "OpenAI" mis-resolve to unrelated public filers
        # that merely contain the token, producing wrong, "doesn't-make-sense"
        # company data. We now demand a whole-word or exact match (>= 50).
        if best and best_score >= 50:
            return str(best["cik_str"])

        # Fallback to full-text search, but only trust a hit whose resolved
        # company title actually shares a word with the query — otherwise the
        # top hit is just some filer that *mentions* the name (e.g. a 10-K
        # naming "OpenAI"), which would attribute the wrong company's data.
        try:
            active = _active_cik_titles()
            q_tokens = {w for w in q.split() if len(w) >= 4}
            r = requests.get(self.search_url, headers=HEADERS,
                             params={"q": company_name}, timeout=6)
            r.raise_for_status()
            hits = r.json().get("hits", {}).get("hits", []) or []
            for hit in hits:
                ciks = (hit.get("_source", {}) or {}).get("ciks", []) or []
                for c in ciks:
                    try:
                        ci = int(c)
                    except (ValueError, TypeError):
                        continue
                    title = (active.get(ci) or "").lower()
                    if not title:
                        continue
                    title_tokens = set(title.split())
                    if q == title or (q_tokens and q_tokens & title_tokens):
                        return str(ci)
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

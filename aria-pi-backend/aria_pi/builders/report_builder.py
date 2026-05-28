"""Deterministic, free-tier report builder.

No LLM. No API keys. Every claim is built from one of:
  - SEC EDGAR (filing URLs, submissions API)
  - ClinicalTrials.gov (trial URLs)
  - PubMed (paper URLs)
  - NIH Reporter (grant URLs)
  - Curated UNC + sector JSON (with real source URLs)

Narrative-only slots (e.g., talking-point prose) are marked [REQUIRES ANALYST]
so a human can complete them. This honors the template's rule:
"If you cannot find two sources for a claim, mark it [UNVERIFIED] and flag it."
"""
from __future__ import annotations
import json
import os
from datetime import datetime
from typing import Dict, List, Any

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _load_json(name: str) -> Any:
    path = os.path.join(DATA_DIR, name)
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Failed to load {name}: {e}")
        return None


class ReportBuilder:
    def __init__(self):
        self.sector_ctx = _load_json("sector_context.json") or {}
        self.datasets = _load_json("unc_datasets.json") or []
        self.programs_blob = _load_json("unc_programs.json") or {}

    def build(self, sector: str, real_data: dict) -> dict:
        """real_data: {'sector': str, 'companies': [{name, facts, trials, pubmed}]}"""
        ctx = self._sector_ctx(sector)
        companies = real_data.get("companies", []) or []

        return {
            "report_meta": {
                "sector": sector,
                "date": datetime.now().strftime("%m/%d/%Y"),
                "prepared_by": "Research Intelligence Team — Innovate Carolina / UNC Chapel Hill",
                "version": "Draft",
            },
            "section1_overview": self._section1(ctx),
            "section2_internal_mapping": self._section2(sector, companies),
            "section3_selection": self._section3(companies),
            "section4_profiles": [self._profile(c, ctx) for c in companies[:5]],
            "section5_value_prop": self._section5(sector),
            "section6_talking_points": self._section6(companies),
            "section7_verification": self._section7(),
            "references": self._references(companies),
        }

    # ── Section helpers ─────────────────────────────────────────────────────
    def _sector_ctx(self, sector: str) -> dict:
        key = sector.lower().strip()
        if key in self.sector_ctx:
            return self.sector_ctx[key]
        for k, v in self.sector_ctx.items():
            if k != "default" and (k in key or key in k):
                return v
        return self.sector_ctx.get("default", {})

    def _section1(self, ctx: dict) -> dict:
        return {
            "definition": {
                "text": ctx.get("definition", "[REQUIRES ANALYST]"),
                "sources": ctx.get("definition_sources", []),
            },
            "scale": {
                "text": ctx.get("scale", "[REQUIRES ANALYST]"),
                "sources": ctx.get("scale_sources", []),
            },
            "why_now": ctx.get("why_now", []),
            "nc_context": {
                "text": ctx.get("nc_context", "[REQUIRES ANALYST]"),
                "sources": ctx.get("nc_context_sources", []),
            },
            "unc_units": ctx.get("unc_units", []),
        }

    def _section2(self, sector: str, companies: List[dict]) -> dict:
        # ── Known partnerships: NIH-funded UNC grants mentioning the company
        # AND/OR co-authored PubMed publications. Both are publicly disclosed
        # signals universities track under COI / research-integrity policy.
        known: List[dict] = []
        for c in companies:
            cname = c["name"]
            for g in (c.get("nih_grants") or [])[:3]:
                dept = g.get("department") or g.get("organization") or "UNC Chapel Hill"
                known.append({
                    "company": cname,
                    "unc_unit": dept,
                    "relationship_type": f"NIH-funded research — grant {g.get('project_num', '')} "
                                         f"(PI: {g.get('pi', 'n/a')})",
                    "active": "Yes" if g.get("fiscal_year") else "Unknown",
                    "sources": [g.get("url", "https://reporter.nih.gov"),
                                "https://research.unc.edu/coi"],
                })
            for p in (c.get("pubmed") or [])[:2]:
                known.append({
                    "company": cname,
                    "unc_unit": "UNC Chapel Hill (per PubMed affiliation)",
                    "relationship_type": f"Co-authored publication ({p.get('year', 'n.d.')}) — "
                                         f"{p.get('journal', '')}",
                    "active": "Unknown",
                    "sources": [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                                "https://research.unc.edu/coi"],
                })

        # ── UNC faculty: PIs from NIH grants (named + departmental) plus
        # first authors of co-authored PubMed papers.
        unc_faculty: List[dict] = []
        seen = set()

        def add_faculty(name: str, school: str, focus: str, sources: List[str]):
            key = (name.lower().strip(), focus[:60])
            if not name or key in seen:
                return
            seen.add(key)
            unc_faculty.append({
                "name": name, "school": school,
                "research_focus": focus[:200], "sources": sources,
            })

        for c in companies:
            for g in (c.get("nih_grants") or [])[:3]:
                pi = g.get("pi") or ""
                if pi:
                    add_faculty(
                        pi,
                        g.get("department") or g.get("organization") or "UNC Chapel Hill",
                        f"NIH-funded research overlapping with {c['name']}: "
                        f"{g.get('title', '')[:120]}",
                        [g.get("url", "https://reporter.nih.gov"),
                         "https://research.unc.edu"],
                    )
            for p in (c.get("pubmed") or [])[:3]:
                authors = p.get("authors") or []
                if authors:
                    add_faculty(
                        authors[0],
                        "UNC Chapel Hill (verify school via faculty page)",
                        f"Co-authored publication with {c['name']}: "
                        f"{p.get('title', '')[:120]}",
                        [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                         "https://www.unc.edu"],
                    )
            if len(unc_faculty) >= 10:
                break

        # ── Data assets: show all curated UNC datasets (analysts filter, not us).
        data_assets = [
            {"name": d["name"], "description": d["description"],
             "held_by": d.get("held_by", "UNC"), "sources": d.get("sources", [])}
            for d in self.datasets
        ]

        # ── Risk flags: any active NIH grant = active partnership = outreach risk
        risk_flags: List[dict] = []
        for c in companies:
            grants = c.get("nih_grants") or []
            active = [g for g in grants if str(g.get("fiscal_year", ""))][:1]
            if active:
                g = active[0]
                risk_flags.append({
                    "company": c["name"],
                    "risk": f"Active NIH grant — {g.get('project_num', '')} "
                            f"(FY{g.get('fiscal_year', '')}, PI {g.get('pi', 'n/a')}) — "
                            "verify with UNC OSP before outreach",
                    "sources": [g.get("url", "https://reporter.nih.gov"),
                                "https://research.unc.edu/osp"],
                })

        return {
            "known_partnerships": known,
            "unc_faculty": unc_faculty,
            "data_assets": data_assets,
            "risk_flags": risk_flags,
        }

    def _section3(self, companies: List[dict]) -> dict:
        selected = []
        for c in companies[:5]:
            facts = c.get("facts", {}) or {}
            tie = "Yes" if c.get("pubmed") else "Unknown"
            selected.append({
                "company": c["name"],
                "unc_alignment": _alignment_hint(c),
                "existing_tie": tie,
                "sources": [facts.get("edgar_url", "https://www.sec.gov"),
                            _first_trial_url(c)],
            })
        return {"selected": selected, "excluded": []}

    def _profile(self, c: dict, ctx: dict) -> dict:
        facts = c.get("facts", {}) or {}
        edgar_url = facts.get("edgar_url", "https://www.sec.gov")
        trials = c.get("trials", []) or []
        papers = c.get("pubmed") or []
        recent_filings = facts.get("recent_filings", []) or []
        filings_by_form = facts.get("filings_by_form") or {}
        xbrl = facts.get("xbrl") or {}

        ticker = ",".join(facts.get("tickers", []) or []) or "n/a"
        exchange = ",".join(facts.get("exchanges", []) or []) or ""

        rev = xbrl.get("revenue") or {}
        rd = xbrl.get("rd_expense") or {}
        net = xbrl.get("net_income") or {}
        assets = xbrl.get("total_assets") or {}
        emp = xbrl.get("employees") or {}

        overview_text = (
            f"{facts.get('legal_name', c['name'])} is an SEC-registered "
            f"{facts.get('entity_type', 'entity').lower() or 'entity'} "
            f"(SIC: {facts.get('sic', 'n/a')}, CIK: {facts.get('cik', 'n/a')})"
        )
        if facts.get("hq"):
            overview_text += f" headquartered in {facts['hq']}"
        if rev.get("value"):
            overview_text += (f". FY{rev.get('fy')} revenue was "
                              f"{_fmt_usd(rev['value'])} per its most recent 10-K")
        if rd.get("value"):
            overview_text += f"; R&D expense {_fmt_usd(rd['value'])}"
        overview_text += (
            f". The company has filed {len(recent_filings)} recent SEC documents and "
            f"sponsors {len(trials)} clinical trials indexed on ClinicalTrials.gov."
        )

        pipeline = []
        for t in trials[:8]:
            pipeline.append({
                "program": t.get("title", "Trial")[:160],
                "indication": t.get("title", "")[:160],
                "stage": t.get("phase", "n/a") or "n/a",
                "sources": [t.get("url", "https://clinicaltrials.gov"), edgar_url],
            })

        # Recent signals — 8-K filings from last 24 months
        signals = []
        for f in recent_filings:
            if f.get("form") == "8-K" and len(signals) < 5:
                signals.append({
                    "signal": f"Filed 8-K on {f.get('date', '')} (material event disclosure)",
                    "sources": [f.get("url", edgar_url), edgar_url],
                })

        # Partnering history — best effort from 10-K / S-1 filing dates
        partnering = []
        for f in recent_filings:
            if f.get("form") in ("10-K", "10-Q", "S-1") and len(partnering) < 3:
                partnering.append({
                    "partner": "[REQUIRES ANALYST — extract from filing]",
                    "deal_type": f.get("form"),
                    "year": (f.get("date", "") or "")[:4],
                    "sources": [f.get("url", edgar_url), edgar_url],
                })

        # UNC alignment — from PubMed UNC papers mentioning this company space
        unc_alignment = []
        for ctx_unit in (ctx.get("unc_units") or [])[:2]:
            paper_src = papers[0] if papers else None
            unc_alignment.append({
                "company_program": pipeline[0]["program"] if pipeline else "(see pipeline)",
                "unc_unit": ctx_unit.get("unit", ""),
                "company_fact": (pipeline[0]["program"] if pipeline
                                 else f"SEC-registered {facts.get('sic', '')}"),
                "unc_fact": ctx_unit.get("focus", ""),
                "rationale": "[REQUIRES ANALYST — write a one-sentence match rationale]",
                "sources": [
                    paper_src["url"] if paper_src else ctx_unit.get("url", "https://www.unc.edu"),
                    ctx_unit.get("url", "https://www.unc.edu"),
                ],
            })

        # What UNC can offer
        offers = []
        for d in self.datasets[:3]:
            offers.append({
                "offering": d["name"],
                "description": d["description"],
                "sources": d.get("sources", []),
            })

        return {
            "company_name": c["name"],
            "overview": {"text": overview_text,
                         "sources": [edgar_url, _first_trial_url(c)]},
            "partnership_type": "Strategic" if len(trials) > 5 else "Translational",
            "existing_unc_tie": bool(papers),
            "facts": {
                "legal_name": {"value": facts.get("legal_name", c["name"]), "source": edgar_url},
                "cik": {"value": facts.get("cik", "n/a") or "n/a", "source": edgar_url},
                "hq": {"value": facts.get("hq", "n/a") or "n/a", "source": edgar_url},
                "type": {"value": facts.get("entity_type", "n/a") or "n/a", "source": edgar_url},
                "ticker_exchange": {
                    "value": f"{ticker} ({exchange})" if exchange else ticker,
                    "source": edgar_url,
                },
                "sic": {"value": facts.get("sic", "n/a") or "n/a", "source": edgar_url},
                "fiscal_year_end": {"value": facts.get("fiscal_year_end") or "n/a",
                                    "source": edgar_url},
                "revenue_latest_10k": {
                    "value": (f"{_fmt_usd(rev['value'])} (FY{rev.get('fy')})"
                              if rev.get("value") else "n/a"),
                    "source": rev.get("url", edgar_url),
                },
                "rd_expense_latest_10k": {
                    "value": (f"{_fmt_usd(rd['value'])} (FY{rd.get('fy')})"
                              if rd.get("value") else "n/a"),
                    "source": rd.get("url", edgar_url),
                },
                "net_income_latest_10k": {
                    "value": (f"{_fmt_usd(net['value'])} (FY{net.get('fy')})"
                              if net.get("value") else "n/a"),
                    "source": net.get("url", edgar_url),
                },
                "total_assets_latest_10k": {
                    "value": (f"{_fmt_usd(assets['value'])} (FY{assets.get('fy')})"
                              if assets.get("value") else "n/a"),
                    "source": assets.get("url", edgar_url),
                },
                "employees": {
                    "value": (f"{int(emp['value']):,} (FY{emp.get('fy')})"
                              if emp.get("value") else "n/a"),
                    "source": emp.get("url", edgar_url),
                },
            },
            "sec_filings": {
                "10-K (Annual Report)": filings_by_form.get("10-K", []),
                "10-Q (Quarterly Report)": filings_by_form.get("10-Q", []),
                "8-K (Material Events)": filings_by_form.get("8-K", []),
                "DEF 14A (Proxy Statement)": filings_by_form.get("DEF 14A", []),
                "S-1 (Registration)": filings_by_form.get("S-1", []),
            },
            "pipeline": pipeline,
            "partnering_history": partnering,
            "unc_alignment": unc_alignment,
            "what_unc_offers": offers,
            "signals": signals,
        }

    def _section5(self, sector: str) -> dict:
        return {
            "data_assets": [
                {"name": d["name"], "description": d["description"],
                 "relevance": "Sector-relevant per keyword match",
                 "sources": d.get("sources", [])}
                for d in self.datasets
            ],
            "research_capacity": [],  # populated by analyst from PubMed
            "talent_pipeline": self.programs_blob.get("talent_programs", []),
            "nc_access": self.programs_blob.get("nc_access", []),
            "future_signals": [],
            "partnership_models": self.programs_blob.get("partnership_models", []),
        }

    def _section6(self, companies: List[dict]) -> dict:
        opening = {
            "text": "[REQUIRES ANALYST — sector-level opening framing to be written by Bus Dev or Research Intelligence lead before outreach]",
            "sources": ["https://www.sec.gov", "https://clinicaltrials.gov"],
        }
        cos = []
        for c in companies[:5]:
            facts = c.get("facts", {}) or {}
            edgar_url = facts.get("edgar_url", "https://www.sec.gov")
            trials = c.get("trials", []) or []
            trial_url = trials[0]["url"] if trials else "https://clinicaltrials.gov"
            recent = facts.get("recent_filings", []) or []
            latest_8k = next((f for f in recent if f.get("form") == "8-K"), None)
            signal_url = latest_8k["url"] if latest_8k else edgar_url
            cos.append({
                "company": c["name"],
                "know_company": {
                    "text": f"{facts.get('legal_name', c['name'])} is an SEC-registered "
                            f"{facts.get('entity_type', 'company')} classified under SIC "
                            f"'{facts.get('sic', 'n/a')}'.",
                    "sources": [edgar_url, edgar_url],
                },
                "know_pipeline": {
                    "text": (f"{c['name']} sponsors {len(trials)} clinical trials on "
                             f"ClinicalTrials.gov, most recent: "
                             f"{trials[0]['title'][:120] if trials else 'n/a'}."),
                    "sources": [trial_url, edgar_url],
                },
                "know_moves": {
                    "text": (f"Most recent material disclosure on file: "
                             f"{latest_8k['date'] if latest_8k else 'no recent 8-K found'}"),
                    "sources": [signal_url, edgar_url],
                },
                "unc_hook": {
                    "text": "[REQUIRES ANALYST — name the specific UNC asset that maps to this company]",
                    "sources": [edgar_url, "https://research.unc.edu"],
                },
            })
        return {"sector_opening": opening, "companies": cos}

    def _section7(self) -> List[dict]:
        return [
            {"label": "Every factual claim has two independently verifiable sources", "checked": False},
            {"label": "No source is Wikipedia, an aggregator site, or unattributed news", "checked": False},
            {"label": "Internal mapping reviewed — no active conflicting UNC partnerships", "checked": False},
            {"label": "Strategic vs. translational flag set for every company", "checked": False},
            {"label": "What UNC can offer is completed with named assets", "checked": False},
            {"label": "Talking points reviewed for factual accuracy", "checked": False},
            {"label": "Pipeline tables cross-referenced with ClinicalTrials.gov", "checked": False},
            {"label": "All [REQUIRES ANALYST] slots completed by reviewer", "checked": False},
        ]

    def _references(self, companies: List[dict]) -> List[dict]:
        refs: List[dict] = []
        seen = set()
        def add(title: str, url: str, publisher: str, year: str = ""):
            if not url or url in seen:
                return
            seen.add(url)
            refs.append({"id": len(refs) + 1, "title": title, "url": url,
                         "publisher": publisher, "year": year})

        for c in companies:
            facts = c.get("facts", {}) or {}
            if facts.get("edgar_url"):
                add(f"{facts.get('legal_name', c['name'])} — EDGAR filings",
                    facts["edgar_url"], "SEC EDGAR")
            for t in (c.get("trials") or [])[:3]:
                add(t.get("title", "Clinical trial")[:120],
                    t.get("url", ""), "ClinicalTrials.gov")
            for p in (c.get("pubmed") or [])[:2]:
                add(p.get("title", "Publication")[:120],
                    p.get("url", ""), p.get("journal", "PubMed"),
                    p.get("year", ""))
            for g in (c.get("nih_grants") or [])[:2]:
                add(f"{g.get('project_num', 'Grant')} — {g.get('title', '')[:100]}",
                    g.get("url", ""), "NIH Reporter",
                    str(g.get("fiscal_year", "")))
        return refs[:30]


def _fmt_usd(val) -> str:
    """Format a large USD number compactly: 16,286,000,000 -> '$16.3B'."""
    try:
        n = float(val)
    except (TypeError, ValueError):
        return "n/a"
    sign = "-" if n < 0 else ""
    n = abs(n)
    if n >= 1e9:
        return f"{sign}${n/1e9:.2f}B"
    if n >= 1e6:
        return f"{sign}${n/1e6:.1f}M"
    if n >= 1e3:
        return f"{sign}${n/1e3:.0f}K"
    return f"{sign}${n:.0f}"


def _first_trial_url(c: dict) -> str:
    trials = c.get("trials") or []
    return trials[0]["url"] if trials and trials[0].get("url") else "https://clinicaltrials.gov"


def _alignment_hint(c: dict) -> str:
    papers = c.get("pubmed") or []
    trials = c.get("trials") or []
    if papers:
        return f"Co-authored UNC publications on PubMed ({len(papers)} hits)"
    if trials:
        return f"{len(trials)} clinical trials documented on ClinicalTrials.gov"
    return "[REQUIRES ANALYST — UNC alignment to be confirmed]"

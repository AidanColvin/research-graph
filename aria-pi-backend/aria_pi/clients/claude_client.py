import os
import json
import re
from typing import Optional

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


class ClaudeClient:
    """Produces structured partnership intelligence reports via the Anthropic API.

    Falls back to a structured stub when no API key is configured so the
    frontend can still render the full visual layout for development.
    """

    DEFAULT_MODEL = "claude-sonnet-4-5"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model or os.environ.get("ANTHROPIC_MODEL", self.DEFAULT_MODEL)
        self.client = None
        if self.api_key and HAS_ANTHROPIC:
            try:
                self.client = anthropic.Anthropic(api_key=self.api_key)
            except Exception as e:
                print(f"Anthropic init failed, using stub: {e}")
                self.client = None

    @property
    def is_live(self) -> bool:
        return self.client is not None

    def generate_report(self, sector: str, real_data: dict) -> dict:
        """Generate a full structured 7-section partnership intelligence report.

        Takes: sector name and a dict of pre-fetched real data (SEC facts,
        ClinicalTrials results, UNC faculty hints) for one or more companies.
        Returns: JSON dict matching the report schema.
        """
        if not self.client:
            return _stub_report(sector, real_data)

        system_prompt = _system_prompt()
        user_prompt = _user_prompt(sector, real_data)

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            text = response.content[0].text if response.content else ""
            return _parse_json(text) or _stub_report(sector, real_data)
        except Exception as e:
            print(f"Claude API error, using stub: {e}")
            return _stub_report(sector, real_data)


def _system_prompt() -> str:
    return (
        "You are a research analyst at the UNC Chapel Hill Innovate Carolina "
        "Research Intelligence Team. You produce partnership intelligence reports "
        "that inform Bus Dev outreach to industry partners.\n\n"
        "STRICT SOURCING RULES — non-negotiable:\n"
        "• Every factual claim must be backed by exactly two independently verifiable sources.\n"
        "• Acceptable source domains: company website, sec.gov, pubmed.ncbi.nlm.nih.gov, "
        "clinicaltrials.gov, reporter.nih.gov, *.unc.edu (faculty / center pages), "
        "peer-reviewed journals, government databases, press releases on the company's own domain.\n"
        "• Forbidden sources: wikipedia.org, crunchbase.com, zoominfo.com, linkedin.com, "
        "aggregator sites, unattributed news articles.\n"
        "• If a claim cannot be double-sourced, set verified=false and include "
        "[UNVERIFIED] in the text. Do not invent sources.\n"
        "• Do not infer, estimate, or generalize. Write only what the sources confirm.\n\n"
        "OUTPUT FORMAT: Respond with valid JSON only. No prose before or after. "
        "Follow the schema in the user message exactly. Use real URLs you are confident exist."
    )


def _user_prompt(sector: str, real_data: dict) -> str:
    context = json.dumps(real_data, indent=2, default=str)[:6000]
    schema = _schema_example()
    return (
        f"Build a partnership intelligence report for the **{sector}** sector "
        f"for UNC Chapel Hill.\n\n"
        f"PRE-FETCHED REAL DATA (use these URLs as your primary sources):\n"
        f"```json\n{context}\n```\n\n"
        f"Produce a JSON report matching this exact schema:\n"
        f"```json\n{schema}\n```\n\n"
        f"Requirements:\n"
        f"- Select 3–5 strong industry candidates in the sector.\n"
        f"- For each, complete the full company profile with pipeline, partnering history, "
        f"UNC alignment (name real UNC schools — Gillings, SOM, Eshelman, CHIP, Lineberger), "
        f"and what UNC offers.\n"
        f"- Every 'sources' array must contain TWO URLs from acceptable domains.\n"
        f"- The verification checklist defaults to unchecked (false).\n"
        f"- Return JSON only. No markdown fence, no commentary."
    )


def _schema_example() -> str:
    return """{
  "report_meta": {
    "sector": "string",
    "date": "MM/DD/YYYY",
    "prepared_by": "Research Intelligence Team — Innovate Carolina / UNC Chapel Hill",
    "version": "Draft"
  },
  "section1_overview": {
    "definition": {"text": "string", "sources": ["url", "url"]},
    "scale": {"text": "string", "sources": ["url", "url"]},
    "why_now": [{"signal": "string", "sources": ["url", "url"]}],
    "nc_context": {"text": "string", "sources": ["url", "url"]},
    "unc_units": [{"unit": "string", "focus": "string", "url": "url"}]
  },
  "section2_internal_mapping": {
    "known_partnerships": [{"company": "string", "unc_unit": "string", "relationship_type": "string", "active": "Yes|No|Unknown", "sources": ["url", "url"]}],
    "unc_faculty": [{"name": "string", "school": "string", "research_focus": "string", "sources": ["url", "url"]}],
    "data_assets": [{"name": "string", "description": "string", "held_by": "string", "sources": ["url", "url"]}],
    "risk_flags": [{"company": "string", "risk": "string", "sources": ["url", "url"]}]
  },
  "section3_selection": {
    "selected": [{"company": "string", "unc_alignment": "string", "existing_tie": "Yes|No|Unknown", "sources": ["url", "url"]}],
    "excluded": [{"company": "string", "reason": "string", "sources": ["url", "url"]}]
  },
  "section4_profiles": [{
    "company_name": "string",
    "overview": {"text": "string", "sources": ["url", "url"]},
    "partnership_type": "Strategic|Translational|Both",
    "existing_unc_tie": false,
    "facts": {
      "legal_name": {"value": "string", "source": "url"},
      "hq": {"value": "string", "source": "url"},
      "website": {"value": "string", "source": "url"},
      "type": {"value": "Public|Private|Subsidiary", "source": "url"},
      "ticker_parent": {"value": "string", "source": "url"},
      "employees": {"value": "string", "source": "url"},
      "founded": {"value": "string", "source": "url"},
      "revenue": {"value": "string", "source": "url"}
    },
    "pipeline": [{"program": "string", "indication": "string", "stage": "string", "sources": ["url", "url"]}],
    "partnering_history": [{"partner": "string", "deal_type": "string", "year": "string", "sources": ["url", "url"]}],
    "unc_alignment": [{"company_program": "string", "unc_unit": "string", "company_fact": "string", "unc_fact": "string", "rationale": "string", "sources": ["url", "url"]}],
    "what_unc_offers": [{"offering": "string", "description": "string", "sources": ["url", "url"]}],
    "signals": [{"signal": "string", "sources": ["url", "url"]}]
  }],
  "section5_value_prop": {
    "data_assets": [{"name": "string", "description": "string", "relevance": "string", "sources": ["url", "url"]}],
    "research_capacity": [{"name": "string", "role": "string", "expertise": "string", "sources": ["url", "url"]}],
    "talent_pipeline": [{"program": "string", "school": "string", "output": "string", "sources": ["url", "url"]}],
    "nc_access": [{"asset": "string", "description": "string", "sources": ["url", "url"]}],
    "future_signals": [{"signal": "string", "sources": ["url", "url"]}],
    "partnership_models": [{"model": "string", "description": "string", "unit": "string"}]
  },
  "section6_talking_points": {
    "sector_opening": {"text": "string", "sources": ["url", "url"]},
    "companies": [{
      "company": "string",
      "know_company": {"text": "string", "sources": ["url", "url"]},
      "know_pipeline": {"text": "string", "sources": ["url", "url"]},
      "know_moves": {"text": "string", "sources": ["url", "url"]},
      "unc_hook": {"text": "string", "sources": ["url", "url"]}
    }]
  },
  "section7_verification": [
    {"label": "Every factual claim has two independently verifiable sources", "checked": false},
    {"label": "No source is Wikipedia, aggregator, or unattributed news", "checked": false},
    {"label": "Internal mapping cross-checked — no active conflicting UNC partnerships", "checked": false},
    {"label": "Strategic vs. translational flag set for every company", "checked": false},
    {"label": "What UNC can offer completed with named assets", "checked": false},
    {"label": "Talking points reviewed for factual accuracy", "checked": false},
    {"label": "Pipeline tables cross-referenced with ClinicalTrials.gov", "checked": false}
  ],
  "references": [{"id": 1, "title": "string", "year": "string", "publisher": "string", "url": "url"}]
}"""


def _parse_json(text: str) -> Optional[dict]:
    text = text.strip()
    # Strip markdown fences if Claude wrapped the JSON
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to extract the largest JSON object
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
        return None


def _stub_report(sector: str, real_data: dict) -> dict:
    """Structured stub used when no API key is configured.

    Mirrors the live schema so the frontend renders identically.
    """
    from datetime import datetime
    today = datetime.now().strftime("%m/%d/%Y")
    company_facts = real_data.get("companies", [])
    primary = company_facts[0] if company_facts else {"name": "Sample Company", "facts": {}, "trials": []}

    return {
        "report_meta": {
            "sector": sector,
            "date": today,
            "prepared_by": "Research Intelligence Team — Innovate Carolina / UNC Chapel Hill",
            "version": "Draft",
        },
        "section1_overview": {
            "definition": {
                "text": f"[STUB — set ANTHROPIC_API_KEY for live data] {sector} sector overview.",
                "sources": ["https://www.sec.gov", "https://reporter.nih.gov"],
            },
            "scale": {
                "text": "Market data unavailable in stub mode.",
                "sources": ["https://www.sec.gov", "https://reporter.nih.gov"],
            },
            "why_now": [
                {"signal": "Configure ANTHROPIC_API_KEY to populate real signals.",
                 "sources": ["https://reporter.nih.gov", "https://www.sec.gov"]}
            ],
            "nc_context": {
                "text": "NC-specific context populated in live mode.",
                "sources": ["https://www.ncbiotech.org", "https://research.unc.edu"],
            },
            "unc_units": [
                {"unit": "Gillings School of Global Public Health", "focus": "Population health research",
                 "url": "https://sph.unc.edu"},
                {"unit": "UNC Lineberger Comprehensive Cancer Center", "focus": "Cancer translational research",
                 "url": "https://unclineberger.org"},
            ],
        },
        "section2_internal_mapping": {
            "known_partnerships": [],
            "unc_faculty": [],
            "data_assets": [
                {"name": "Carolina Data Warehouse for Health (CDWH)",
                 "description": "Clinical, research, and administrative data from UNC Health.",
                 "held_by": "UNC Health / NC TraCS",
                 "sources": ["https://tracs.unc.edu", "https://www.med.unc.edu"]},
            ],
            "risk_flags": [],
        },
        "section3_selection": {
            "selected": [
                {"company": primary["name"], "unc_alignment": "TBD in live mode",
                 "existing_tie": "Unknown",
                 "sources": ["https://www.sec.gov", "https://clinicaltrials.gov"]}
            ],
            "excluded": [],
        },
        "section4_profiles": [
            {
                "company_name": primary["name"],
                "overview": {
                    "text": f"Stub profile — set ANTHROPIC_API_KEY to generate. SEC facts: {primary.get('facts', {}).get('legal_name', 'n/a')}.",
                    "sources": ["https://www.sec.gov", primary.get("website", "https://www.sec.gov")],
                },
                "partnership_type": "Strategic",
                "existing_unc_tie": False,
                "facts": {
                    "legal_name": {"value": primary.get("facts", {}).get("legal_name", "Unknown"),
                                   "source": "https://www.sec.gov"},
                    "hq": {"value": "Unknown", "source": "https://www.sec.gov"},
                    "website": {"value": "Unknown", "source": "https://www.sec.gov"},
                    "type": {"value": "Public", "source": "https://www.sec.gov"},
                    "ticker_parent": {"value": "n/a", "source": "https://www.sec.gov"},
                    "employees": {"value": "n/a", "source": "https://www.sec.gov"},
                    "founded": {"value": "n/a", "source": "https://www.sec.gov"},
                    "revenue": {"value": "n/a", "source": "https://www.sec.gov"},
                },
                "pipeline": [
                    {"program": t.get("title", "Trial"), "indication": "see trial",
                     "stage": t.get("phase", "n/a"),
                     "sources": [t.get("url", "https://clinicaltrials.gov"), "https://www.sec.gov"]}
                    for t in primary.get("trials", [])[:3]
                ],
                "partnering_history": [],
                "unc_alignment": [],
                "what_unc_offers": [],
                "signals": [],
            }
        ],
        "section5_value_prop": {
            "data_assets": [], "research_capacity": [], "talent_pipeline": [],
            "nc_access": [], "future_signals": [],
            "partnership_models": [
                {"model": "Sponsored Research Agreement",
                 "description": "Company funds a defined UNC research project.",
                 "unit": "Innovate Carolina"},
                {"model": "License / IP Commercialization",
                 "description": "UNC licenses a technology to the company.",
                 "unit": "UNC Office of Technology Commercialization"},
                {"model": "Data Access Agreement",
                 "description": "Company accesses a UNC dataset under formal agreement.",
                 "unit": "NC TraCS"},
                {"model": "Fellowship or Internship Placement",
                 "description": "Company hosts a UNC student in a structured program.",
                 "unit": "Innovate Carolina"},
                {"model": "Clinical Research Collaboration",
                 "description": "Company runs a trial through UNC Health.",
                 "unit": "UNC Health / NC TraCS"},
            ],
        },
        "section6_talking_points": {
            "sector_opening": {"text": "Stub talking point — configure API for real output.",
                               "sources": ["https://www.sec.gov", "https://reporter.nih.gov"]},
            "companies": [],
        },
        "section7_verification": [
            {"label": "Every factual claim has two independently verifiable sources", "checked": False},
            {"label": "No source is Wikipedia, aggregator, or unattributed news", "checked": False},
            {"label": "Internal mapping cross-checked — no active conflicting UNC partnerships", "checked": False},
            {"label": "Strategic vs. translational flag set for every company", "checked": False},
            {"label": "What UNC can offer completed with named assets", "checked": False},
            {"label": "Talking points reviewed for factual accuracy", "checked": False},
            {"label": "Pipeline tables cross-referenced with ClinicalTrials.gov", "checked": False},
        ],
        "references": [],
        "_stub": True,
    }

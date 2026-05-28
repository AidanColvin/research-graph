"""NIH Reporter client — free public API, no key required.

Reporter is the public registry of NIH-funded research. Every grant has a
disclosed PI, organization, department, and dollar amount. If a UNC PI has
NIH funding related to a target company's research area — or if the
company appears in the grant text — that's a documented relationship
universities must disclose under conflict-of-interest policies.

Endpoint:
  POST https://api.reporter.nih.gov/v2/projects/search

Docs:
  https://api.reporter.nih.gov/
"""
import requests
from typing import List

ENDPOINT = "https://api.reporter.nih.gov/v2/projects/search"


class NIHReporterClient:
    def __init__(self):
        self.timeout = 8

    def unc_grants_mentioning(self, company_name: str, max_results: int = 5) -> List[dict]:
        """Search UNC-awarded NIH grants whose text mentions the company.

        Returns a list of dicts with PI, department, project number, agency,
        award year, fiscal year, and a stable reporter.nih.gov project URL.
        """
        payload = {
            "criteria": {
                "org_names": [
                    "UNIV OF NORTH CAROLINA CHAPEL HILL",
                ],
                "advanced_text_search": {
                    "operator": "and",
                    "search_field": "all",
                    "search_text": company_name,
                },
            },
            "include_fields": [
                "ProjectNum", "ProjectTitle", "ContactPiName", "PrincipalInvestigators",
                "Organization", "OrgName", "OrgDept", "FiscalYear", "AwardAmount",
                "AgencyIcAdmin", "ProjectStartDate", "ProjectEndDate",
            ],
            "offset": 0,
            "limit": max_results,
            "sort_field": "fiscal_year",
            "sort_order": "desc",
        }

        try:
            r = requests.post(ENDPOINT, json=payload, timeout=self.timeout)
            r.raise_for_status()
            results = (r.json() or {}).get("results", []) or []
        except Exception as e:
            print(f"NIH Reporter error for {company_name}: {e}")
            return []

        grants = []
        for g in results:
            proj_num = g.get("project_num") or g.get("ProjectNum") or ""
            pi_name = ""
            pis = g.get("principal_investigators") or g.get("PrincipalInvestigators") or []
            if pis and isinstance(pis, list):
                pi_name = pis[0].get("full_name") or pis[0].get("FullName") or ""
            if not pi_name:
                pi_name = g.get("contact_pi_name") or g.get("ContactPiName") or ""
            org = g.get("organization") or g.get("Organization") or {}
            dept = (org.get("org_dept") if isinstance(org, dict) else "") or ""
            org_name = (org.get("org_name") if isinstance(org, dict) else "") or g.get("OrgName", "")
            grants.append({
                "project_num": proj_num,
                "title": g.get("project_title") or g.get("ProjectTitle") or "",
                "pi": pi_name,
                "department": dept,
                "organization": org_name,
                "fiscal_year": g.get("fiscal_year") or g.get("FiscalYear") or "",
                "agency": g.get("agency_ic_admin", {}).get("name", "") if isinstance(g.get("agency_ic_admin"), dict) else "",
                "url": f"https://reporter.nih.gov/project-details/{proj_num}" if proj_num else "https://reporter.nih.gov",
            })
        return grants

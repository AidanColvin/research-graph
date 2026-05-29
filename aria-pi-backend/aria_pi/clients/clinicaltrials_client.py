"""ClinicalTrials.gov v2 API client — free, no key required.

Returns per-trial: NCT id, title, phase, status, sponsor, collaborators,
locations, and a stable URL. Collaborator detection is the key signal —
when UNC appears in sponsorCollaboratorsModule.collaborators or
contactsLocationsModule.locations.facility, that is a publicly disclosed
trial-level relationship between the sponsor and UNC.
"""
import re
import requests
from typing import List

# Common legal-entity suffixes that carry no discriminating information.
_NOISE = {'inc', 'corp', 'ltd', 'llc', 'lp', 'plc', 'co', 'the', 'and',
          'of', 'for', 'a', 'an', 'is', 'by', 'at'}


def _sponsor_tokens(name: str) -> set:
    """Meaningful lowercase tokens from an org name, noise words removed."""
    tokens = re.split(r'[\s,\.\-\(\)&/]+', (name or '').lower())
    return {t for t in tokens if len(t) >= 3 and t not in _NOISE}


def _is_actual_sponsor(company_name: str, lead: str, collabs: List[str]) -> bool:
    """Return True only when the company is a genuine trial sponsor/collaborator.

    The old `query.term` approach matched any trial where the company name
    appeared anywhere — including trial *descriptions*.  "Apple cider vinegar"
    trials showed up under Apple Inc.; random research devices under Samsung.
    This check requires the company's meaningful name tokens to overlap with
    those of the actual lead sponsor or a listed collaborator.
    """
    q = _sponsor_tokens(company_name)
    if not q:
        return False
    if q & _sponsor_tokens(lead):
        return True
    return any(q & _sponsor_tokens(c) for c in collabs)


class ClinicalTrialsClient:
    def __init__(self):
        self.base_url = "https://clinicaltrials.gov/api/v2/studies"

    def search_by_sponsor(self, sponsor_name: str) -> List[dict]:
        # query.spons searches specifically in sponsor and collaborator name
        # fields — far more precise than query.term (full-text), which would
        # match a trial titled "Apple Cider Vinegar Study" under Apple Inc.
        # We fetch a larger page and post-filter to the genuine matches.
        params = {"query.spons": sponsor_name, "pageSize": 20}
        try:
            response = requests.get(self.base_url, params=params, timeout=6)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"ClinicalTrials API error: {e}")
            return []

        trials: List[dict] = []
        for study in data.get("studies", []) or []:
            protocol = study.get("protocolSection") or {}
            ident = protocol.get("identificationModule") or {}
            design = protocol.get("designModule") or {}
            status_mod = protocol.get("statusModule") or {}
            sponsors = protocol.get("sponsorCollaboratorsModule") or {}
            locations_mod = protocol.get("contactsLocationsModule") or {}

            lead_sponsor = (sponsors.get("leadSponsor") or {}).get("name", "")
            collaborators_raw = sponsors.get("collaborators") or []
            collaborators = [c.get("name") for c in collaborators_raw if c.get("name")]

            # Post-filter: drop trials where the company isn't actually a sponsor
            if not _is_actual_sponsor(sponsor_name, lead_sponsor, collaborators):
                continue

            facilities = []
            for loc in (locations_mod.get("locations") or []):
                fac = loc.get("facility") or ""
                if fac:
                    facilities.append(fac)

            unc_signal = _detect_unc(collaborators + facilities)

            nct_id = ident.get("nctId", "")
            trials.append({
                "nct_id": nct_id,
                "title": ident.get("briefTitle", ""),
                "phase": ", ".join(design.get("phases") or []),
                "status": status_mod.get("overallStatus", ""),
                "lead_sponsor": lead_sponsor,
                "collaborators": collaborators[:6],
                "facilities": facilities[:6],
                "unc_signal": unc_signal,
                "url": f"https://clinicaltrials.gov/study/{nct_id}",
            })
        return trials


def _detect_unc(strs: List[str]) -> str:
    """Return the first string that looks UNC-affiliated, or ''. """
    for s in strs:
        low = (s or "").lower()
        if ("unc " in low or "north carolina" in low or "lineberger" in low
                or "gillings" in low or "chapel hill" in low):
            return s
    return ""

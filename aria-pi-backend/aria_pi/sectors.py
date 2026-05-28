"""Shared sector resolution — single source of truth for both the
orchestrator (which picks seed companies) and the report builder (which picks
curated sector context). Keeping these aligned ensures a search resolves to the
SAME sector for company selection and for definition / NC context / UNC units.
"""
from typing import List, Optional

# Canonical sector key → 5 ticker-resolvable seed companies.
SECTOR_SEEDS = {
    # ── Life sciences / health ────────────────────────────────────────────
    "oncology": ["Merck", "Bristol-Myers Squibb", "Pfizer", "Eli Lilly", "AstraZeneca"],
    "biotech": ["Moderna", "Vertex Pharmaceuticals", "Regeneron", "BioMarin", "Alnylam"],
    "pharmaceutical": ["Johnson & Johnson", "Pfizer", "Merck", "Eli Lilly", "AbbVie"],
    "ag-bio": ["Corteva", "Bayer", "Syngenta", "Ginkgo Bioworks", "Pivot Bio"],
    "medtech": ["Medtronic", "Boston Scientific", "Stryker", "Abbott Laboratories", "Edwards Lifesciences"],
    "rural health": ["Teladoc Health", "Doximity", "HCA Healthcare", "American Well", "Hims & Hers Health"],
    # ── Technology ────────────────────────────────────────────────────────
    "technology": ["Apple", "Microsoft", "NVIDIA", "Alphabet", "Meta Platforms"],
    "software": ["Microsoft", "Salesforce", "Adobe", "ServiceNow", "Snowflake"],
    "artificial intelligence": ["NVIDIA", "Microsoft", "Alphabet", "Palantir Technologies", "C3.ai"],
    "semiconductors": ["NVIDIA", "Advanced Micro Devices", "Intel", "Broadcom", "Qualcomm"],
    "cybersecurity": ["CrowdStrike", "Palo Alto Networks", "Fortinet", "Zscaler", "Okta"],
    "cloud computing": ["Amazon", "Microsoft", "Alphabet", "Oracle", "Snowflake"],
    "fintech": ["Visa", "Mastercard", "PayPal", "Block", "Fiserv"],
    "quantum computing": ["IBM", "IonQ", "Rigetti Computing", "D-Wave Quantum", "Microsoft"],
    "robotics": ["Intuitive Surgical", "Rockwell Automation", "Teradyne", "Zebra Technologies", "Symbotic"],
    "telecom": ["Verizon", "AT&T", "T-Mobile US", "Cisco Systems", "Comcast"],
    # ── Energy / climate / mobility ───────────────────────────────────────
    "climate tech": ["Tesla", "First Solar", "Enphase Energy", "Plug Power", "Bloom Energy"],
    "energy": ["NextEra Energy", "First Solar", "Enphase Energy", "Bloom Energy", "Plug Power"],
    "automotive": ["Tesla", "General Motors", "Ford Motor", "Rivian Automotive", "Lucid Group"],
    "aerospace": ["Boeing", "Lockheed Martin", "RTX", "Northrop Grumman", "General Dynamics"],
    # ── Consumer / industrial / finance ───────────────────────────────────
    "consumer": ["Procter & Gamble", "Coca-Cola", "PepsiCo", "Nike", "Costco Wholesale"],
    "retail": ["Walmart", "Amazon", "Costco Wholesale", "Target", "Home Depot"],
    "finance": ["JPMorgan Chase", "Bank of America", "Goldman Sachs", "Morgan Stanley", "BlackRock"],
    "industrial": ["Caterpillar", "Honeywell International", "General Electric", "3M", "Emerson Electric"],
}

# Broad domain per sector — used to pick which UNC datasets / talent programs
# are relevant. "health" assets only surface for health sectors, etc.
SECTOR_DOMAIN = {
    "oncology": "health", "biotech": "health", "pharmaceutical": "health",
    "ag-bio": "health", "medtech": "health", "rural health": "health",
    "technology": "tech", "software": "tech", "artificial intelligence": "tech",
    "semiconductors": "tech", "cybersecurity": "tech", "cloud computing": "tech",
    "quantum computing": "tech", "robotics": "tech", "telecom": "tech",
    "fintech": "business", "finance": "business", "consumer": "business",
    "retail": "business", "industrial": "business",
    "climate tech": "energy", "energy": "energy", "automotive": "energy",
    "aerospace": "energy",
}

# Keyword → canonical sector key. Lets free-text / misspelled searches route to
# a sensible curated sector. Order matters: earlier, more-specific rules win.
_KEYWORD_ROUTES = [
    (("oncolog", "cancer", "tumor"), "oncology"),
    (("pharma", "drug", "therapeut", "medicine"), "pharmaceutical"),
    (("biotech", "biolog", "genom", "gene therap", "mrna"), "biotech"),
    (("medtech", "medical device", "diagnostic", "imaging"), "medtech"),
    (("rural", "telehealth", "telemedicine"), "rural health"),
    (("agric", "ag-bio", "agbio", "crop", "farm"), "ag-bio"),
    (("semiconductor", "chip", "microchip", "foundry"), "semiconductors"),
    (("cyber", "infosec", "security software"), "cybersecurity"),
    (("artificial intel", "machine learn", "genai", "llm", "deep learn", "neural"), "artificial intelligence"),
    (("cloud", "saas", "data warehouse"), "cloud computing"),
    (("fintech", "payment", "banking tech"), "fintech"),
    (("quantum",), "quantum computing"),
    (("robot", "automation"), "robotics"),
    (("telecom", "wireless", "broadband", "5g", "network"), "telecom"),
    (("software", "app ", "platform", "devtool"), "software"),
    (("climate", "clean energy", "decarbon", "carbon", "solar", "renewable"), "climate tech"),
    (("energy", "utility", "power grid", "grid", "battery"), "energy"),
    (("automot", "electric vehicle", "mobility", "vehicle"), "automotive"),
    (("aerospace", "defense", "defence", "aviation", "space"), "aerospace"),
    (("bank", "insurance", "asset manage", "capital market", "invest"), "finance"),
    (("retail", "ecommerce", "e-commerce", "store"), "retail"),
    (("consumer", "cpg", "apparel", "food", "beverage"), "consumer"),
    (("industrial", "manufactur", "machinery", "logistics"), "industrial"),
    (("tech", "computing", "digital", "internet", "hardware", "data"), "technology"),
]

# Fuzzy keyword routes that tolerate a missing/garbled vowel (e.g. "t4chnolgy").
# Checked only after the exact routes above fail.
_FUZZY_ROUTES = [
    ("technology", "technology"),
    ("software", "software"),
    ("pharma", "pharmaceutical"),
    ("biotech", "biotech"),
    ("finance", "finance"),
    ("energy", "energy"),
    ("retail", "retail"),
]

DEFAULT_SEEDS = ["Apple", "Microsoft", "Amazon", "Alphabet", "JPMorgan Chase"]


def _collapse(s: str) -> str:
    """Lowercase and strip vowels + non-alphanumerics for fuzzy matching."""
    return "".join(ch for ch in s.lower() if ch.isalpha() and ch not in "aeiou0123456789")


def canonical_sector(sector: str) -> Optional[str]:
    """Resolve a raw sector string to a canonical SECTOR_SEEDS key, or None."""
    key = (sector or "").lower().strip()
    if not key:
        return None
    if key in SECTOR_SEEDS:
        return key
    for known in SECTOR_SEEDS:
        if known in key or key in known:
            return known
    for needles, target in _KEYWORD_ROUTES:
        if any(n.strip() in key for n in needles):
            return target
    # Fuzzy: tolerate misspellings by comparing consonant skeletons.
    skel = _collapse(key)
    for token, target in _FUZZY_ROUTES:
        if skel and _collapse(token) in skel:
            return target
    return None


def seeds_for(sector: str, override: Optional[List[str]] = None) -> List[str]:
    if override:
        return override
    canon = canonical_sector(sector)
    return SECTOR_SEEDS.get(canon, DEFAULT_SEEDS) if canon else DEFAULT_SEEDS


def domain_for(sector: str) -> str:
    """Broad domain (health / tech / business / energy) for a raw sector."""
    canon = canonical_sector(sector)
    return SECTOR_DOMAIN.get(canon, "general") if canon else "general"

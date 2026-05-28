"""Shared sector resolution — single source of truth for both the
orchestrator (which picks seed companies) and the report builder (which picks
curated sector context). Keeping these aligned ensures a search resolves to the
SAME sector for company selection and for definition / NC context / UNC units.
"""
from typing import List, Optional

# Canonical sector key → top-10 companies per sector.
SECTOR_SEEDS = {
    # ── Life sciences / health ────────────────────────────────────────────
    "oncology": ["Merck", "Bristol-Myers Squibb", "Pfizer", "Eli Lilly", "AstraZeneca",
                 "Roche", "Novartis", "Johnson & Johnson", "Regeneron", "Incyte"],
    "biotech": ["Moderna", "Vertex Pharmaceuticals", "Regeneron", "BioMarin", "Alnylam",
                "Biogen", "Gilead Sciences", "Amgen", "Seagen", "Neurocrine Biosciences"],
    "pharmaceutical": ["Johnson & Johnson", "Pfizer", "Merck", "Eli Lilly", "AbbVie",
                       "Bristol-Myers Squibb", "AstraZeneca", "Novartis", "Roche", "GSK"],
    "ag-bio": ["Corteva", "Bayer", "Syngenta", "Ginkgo Bioworks", "Pivot Bio",
               "Nutrien", "CF Industries", "Mosaic", "FMC Corporation", "American Vanguard"],
    "medtech": ["Medtronic", "Boston Scientific", "Stryker", "Abbott Laboratories", "Edwards Lifesciences",
                "Becton Dickinson", "Zimmer Biomet", "Intuitive Surgical", "ResMed", "Hologic"],
    "rural health": ["Teladoc Health", "Doximity", "HCA Healthcare", "American Well", "Hims & Hers Health",
                     "LifePoint Health", "Community Health Systems", "Encompass Health", "Acadia Healthcare", "Tenet Healthcare"],
    # Broad "healthcare" umbrella — deliberately diversified across payers,
    # pharma, medical devices, pharmacy/health services, and hospital systems
    # so a generic "healthcare" search returns the marquee players across the
    # whole sector, not just pharma.
    "healthcare": ["UnitedHealth Group", "Johnson & Johnson", "Pfizer", "Eli Lilly", "Merck",
                   "Abbott Laboratories", "CVS Health", "Cigna", "Elevance Health", "HCA Healthcare"],
    # Electronic health records / health IT. Epic Systems and Meditech are private
    # (no SEC filings), so this curated set covers the public, sourceable EHR and
    # health-IT vendors. A search for "Epic" or "EHR" routes here.
    "health it": ["Oracle", "Veeva Systems", "Doximity", "Health Catalyst", "Evolent Health",
                  "Phreesia", "Definitive Healthcare", "Computer Programs and Systems", "Teladoc Health", "Premier"],
    # ── Technology ────────────────────────────────────────────────────────
    "technology": ["Apple", "Microsoft", "NVIDIA", "Alphabet", "Meta Platforms",
                   "Amazon", "Samsung", "Intel", "IBM", "Oracle"],
    "software": ["Microsoft", "Salesforce", "Adobe", "ServiceNow", "Snowflake",
                 "Workday", "Intuit", "Autodesk", "Palantir Technologies", "Veeva Systems"],
    # Public, SEC-filing AI leaders only — private labs (OpenAI, Anthropic, xAI)
    # don't file with the SEC, so they can't be sourced from free public filings
    # and would render as empty/inaccurate profiles. We cover the public AI value
    # chain instead: chips, hyperscalers, model platforms, and AI software.
    "artificial intelligence": ["NVIDIA", "Microsoft", "Alphabet", "Amazon", "Meta Platforms",
                                 "Palantir Technologies", "Advanced Micro Devices", "Broadcom",
                                 "Oracle", "C3.ai"],
    "semiconductors": ["NVIDIA", "Advanced Micro Devices", "Intel", "Broadcom", "Qualcomm",
                       "Texas Instruments", "Micron Technology", "Applied Materials", "Lam Research", "TSMC"],
    "cybersecurity": ["CrowdStrike", "Palo Alto Networks", "Fortinet", "Zscaler", "Okta",
                      "SentinelOne", "Tenable Holdings", "CyberArk Software", "Varonis Systems", "Rapid7"],
    "cloud computing": ["Amazon", "Microsoft", "Alphabet", "Oracle", "Snowflake",
                        "Salesforce", "IBM", "VMware", "Cloudflare", "DigitalOcean"],
    "fintech": ["Visa", "Mastercard", "PayPal", "Block", "Fiserv",
                "Stripe", "Adyen", "Affirm Holdings", "Marqeta", "SoFi Technologies"],
    "quantum computing": ["IBM", "IonQ", "Rigetti Computing", "D-Wave Quantum", "Microsoft",
                          "Honeywell International", "Alphabet", "Intel", "PsiQuantum", "Quantinuum"],
    "robotics": ["Intuitive Surgical", "Rockwell Automation", "Teradyne", "Zebra Technologies", "Symbotic",
                 "ABB", "Fanuc", "KUKA", "iRobot", "Boston Dynamics"],
    "telecom": ["Verizon", "AT&T", "T-Mobile US", "Cisco Systems", "Comcast",
                "Charter Communications", "Lumen Technologies", "Crown Castle", "American Tower", "Qualcomm"],
    # ── Energy / climate / mobility ───────────────────────────────────────
    "climate tech": ["Tesla", "First Solar", "Enphase Energy", "Plug Power", "Bloom Energy",
                     "SunPower", "Array Technologies", "Sunrun", "Sunnova Energy", "Stem"],
    "energy": ["NextEra Energy", "First Solar", "Enphase Energy", "Bloom Energy", "Plug Power",
               "ExxonMobil", "Chevron", "ConocoPhillips", "Schlumberger", "Halliburton"],
    "automotive": ["Tesla", "General Motors", "Ford Motor", "Rivian Automotive", "Lucid Group",
                   "Toyota", "Volkswagen", "Stellantis", "Fisker", "NIO"],
    "aerospace": ["Boeing", "Lockheed Martin", "RTX", "Northrop Grumman", "General Dynamics",
                  "L3Harris Technologies", "Textron", "Leidos Holdings", "HEICO", "TransDigm Group"],
    # ── Consumer / industrial / finance ───────────────────────────────────
    "consumer": ["Procter & Gamble", "Coca-Cola", "PepsiCo", "Nike", "Costco Wholesale",
                 "Unilever", "Colgate-Palmolive", "Kimberly-Clark", "Estee Lauder", "Church & Dwight"],
    "retail": ["Walmart", "Amazon", "Costco Wholesale", "Target", "Home Depot",
               "Lowe's", "Kroger", "TJX Companies", "Dollar General", "Best Buy"],
    "finance": ["JPMorgan Chase", "Bank of America", "Goldman Sachs", "Morgan Stanley", "BlackRock",
                "Wells Fargo", "Citigroup", "Charles Schwab", "American Express", "Berkshire Hathaway"],
    "insurance": ["Berkshire Hathaway", "Progressive", "Allstate", "Travelers", "Chubb",
                  "MetLife", "Prudential Financial", "American International Group", "Aflac", "Marsh & McLennan"],
    "industrial": ["Caterpillar", "Honeywell International", "General Electric", "3M", "Emerson Electric",
                   "Parker Hannifin", "Eaton", "Illinois Tool Works", "Deere & Company", "Cummins"],
}

# Broad domain per sector — used to pick which UNC datasets / talent programs
# are relevant. "health" assets only surface for health sectors, etc.
SECTOR_DOMAIN = {
    "oncology": "health", "biotech": "health", "pharmaceutical": "health",
    "ag-bio": "health", "medtech": "health", "rural health": "health",
    "health it": "health", "healthcare": "health",
    "technology": "tech", "software": "tech", "artificial intelligence": "tech",
    "semiconductors": "tech", "cybersecurity": "tech", "cloud computing": "tech",
    "quantum computing": "tech", "robotics": "tech", "telecom": "tech",
    "fintech": "business", "finance": "business", "insurance": "business",
    "consumer": "business", "retail": "business", "industrial": "business",
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
    (("ehr", "electronic health record", "electronic medical record", "emr ",
      "epic", "cerner", "meditech", "health it", "health information",
      "clinical software"), "health it"),
    (("rural", "telehealth", "telemedicine"), "rural health"),
    (("hospital", "managed care", "health system", "healthcare", "health care",
      "payer", "health plan"), "healthcare"),
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
    (("insurance", "insurer", "reinsur", "underwrit", "actuar"), "insurance"),
    (("bank", "asset manage", "capital market", "invest", "credit card",
      "wealth manage", "financial service"), "finance"),
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


# Short / ambiguous abbreviations that must match the WHOLE input exactly —
# never as a substring (e.g. "ai" must not match "retail", "it" must not match
# "fintech"). Checked by equality only.
_EXACT_ALIASES = {
    "ai": "artificial intelligence",
    "ml": "artificial intelligence",
    "genai": "artificial intelligence",
    "llm": "artificial intelligence",
    "ehr": "health it",
    "emr": "health it",
    "health it": "health it",
    "big tech": "technology",
    "biotechnology": "biotech",
    "pharma": "pharmaceutical",
    "health care": "healthcare",
    "healthcare": "healthcare",
    "health": "healthcare",
    "financial services": "finance",
    "financial service": "finance",
    "financial": "finance",
    "banking": "finance",
}


def canonical_sector(sector: str) -> Optional[str]:
    """Resolve a raw sector string to a canonical SECTOR_SEEDS key, or None.

    Order matters: exact key, then whole-string abbreviations, then keyword
    routes, then (length-guarded) loose containment, then fuzzy skeleton match.
    The length guard prevents tiny tokens like "ai" from matching by accident
    inside longer sector names ("retAIl").
    """
    key = (sector or "").lower().strip()
    if not key:
        return None
    if key in SECTOR_SEEDS:
        return key
    if key in _EXACT_ALIASES:
        return _EXACT_ALIASES[key]
    for needles, target in _KEYWORD_ROUTES:
        if any(n.strip() in key for n in needles):
            return target
    if len(key) >= 4:
        for known in SECTOR_SEEDS:
            if known in key or key in known:
                return known
    # Fuzzy: tolerate misspellings by comparing consonant skeletons.
    skel = _collapse(key)
    if len(skel) >= 3:
        for token, target in _FUZZY_ROUTES:
            if _collapse(token) in skel:
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

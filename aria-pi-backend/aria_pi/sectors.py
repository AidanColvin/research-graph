"""Shared sector resolution — single source of truth for both the
orchestrator (which picks seed companies) and the report builder (which picks
curated sector context). Keeping these aligned ensures a search resolves to the
SAME sector for company selection and for definition / NC context / UNC units.
"""
from typing import List, Optional

# Canonical sector key → top-15 companies per sector.
# 15 seeds give the orchestrator enough candidates to surface the 10 most
# data-rich companies for a full report even when 1–2 firms are private or
# return sparse SEC/trials data within the fetch budget.
SECTOR_SEEDS = {
    # ── Life sciences / health ────────────────────────────────────────────
    "oncology": ["Merck", "Bristol-Myers Squibb", "Pfizer", "Eli Lilly", "AstraZeneca",
                 "Roche", "Novartis", "Johnson & Johnson", "Regeneron", "Incyte",
                 "Amgen", "Gilead Sciences", "AbbVie", "Sanofi", "Blueprint Medicines"],
    "biotech": ["Moderna", "Vertex Pharmaceuticals", "Regeneron", "BioMarin", "Alnylam",
                "Biogen", "Gilead Sciences", "Amgen", "Neurocrine Biosciences", "Karuna Therapeutics",
                "CRISPR Therapeutics", "Beam Therapeutics", "Intellia Therapeutics", "Recursion Pharmaceuticals", "Arctus Biotherapeutics"],
    "pharmaceutical": ["Johnson & Johnson", "Pfizer", "Merck", "Eli Lilly", "AbbVie",
                       "Bristol-Myers Squibb", "AstraZeneca", "Novartis", "Roche", "GSK",
                       "Sanofi", "Amgen", "Gilead Sciences", "Takeda Pharmaceutical", "Biogen"],
    "ag-bio": ["Corteva", "Bayer", "Syngenta", "Ginkgo Bioworks", "Pivot Bio",
               "Nutrien", "CF Industries", "Mosaic", "FMC Corporation", "American Vanguard",
               "Scotts Miracle-Gro", "ICL Group", "Balchem Corporation", "Innospec", "Cabot Corporation"],
    "medtech": ["Medtronic", "Boston Scientific", "Stryker", "Abbott Laboratories", "Edwards Lifesciences",
                "Becton Dickinson", "Zimmer Biomet", "Intuitive Surgical", "ResMed", "Hologic",
                "Align Technology", "DexCom", "Insulet Corporation", "Haemonetics", "Merit Medical Systems"],
    "rural health": ["Teladoc Health", "Doximity", "HCA Healthcare", "Hims & Hers Health",
                     "LifePoint Health", "Community Health Systems", "Encompass Health", "Acadia Healthcare",
                     "Tenet Healthcare", "Option Care Health",
                     "Amedisys", "LHC Group", "National HealthCare Corporation", "Privia Health", "Accolade"],
    # Broad "healthcare" umbrella — deliberately diversified across payers,
    # pharma, medical devices, pharmacy/health services, and hospital systems.
    "healthcare": ["UnitedHealth Group", "Johnson & Johnson", "Pfizer", "Eli Lilly", "Merck",
                   "Abbott Laboratories", "CVS Health", "Cigna", "Elevance Health", "HCA Healthcare",
                   "Humana", "Molina Healthcare", "Centene Corporation", "Tenet Healthcare", "DaVita"],
    # Electronic health records / health IT. Epic Systems and Meditech are private
    # (no SEC filings), so this curated set covers public, sourceable vendors.
    "health it": ["Oracle", "Veeva Systems", "Doximity", "Health Catalyst", "Evolent Health",
                  "Phreesia", "Definitive Healthcare", "Computer Programs and Systems", "Teladoc Health", "Premier",
                  "Inovalon Holdings", "Consensus Cloud Solutions", "Alignment Healthcare", "Accolade", "Privia Health"],
    # ── Technology ────────────────────────────────────────────────────────
    # FAANG + major public tech: Meta (Facebook), Apple, Amazon, Netflix,
    # Alphabet (Google) plus Microsoft, NVIDIA, and top hardware/enterprise players.
    "technology": ["Apple", "Microsoft", "NVIDIA", "Alphabet", "Meta Platforms",
                   "Amazon", "Netflix", "Intel", "IBM", "Oracle",
                   "Cisco Systems", "Qualcomm", "Broadcom", "Advanced Micro Devices", "Salesforce"],
    "software": ["Microsoft", "Salesforce", "Adobe", "ServiceNow", "Snowflake",
                 "Workday", "Intuit", "Autodesk", "Palantir Technologies", "Veeva Systems",
                 "Zoom Video Communications", "HubSpot", "Datadog", "MongoDB", "Atlassian"],
    # Public, SEC-filing AI leaders only — private labs (OpenAI, Anthropic, xAI)
    # don't file with the SEC, so they can't be sourced from free public filings.
    "artificial intelligence": ["NVIDIA", "Microsoft", "Alphabet", "Amazon", "Meta Platforms",
                                 "Palantir Technologies", "Advanced Micro Devices", "Broadcom",
                                 "Oracle", "C3.ai",
                                 "Snowflake", "Salesforce", "IBM", "Intel", "Cisco Systems"],
    "semiconductors": ["NVIDIA", "Advanced Micro Devices", "Intel", "Broadcom", "Qualcomm",
                       "Texas Instruments", "Micron Technology", "Applied Materials", "Lam Research", "TSMC",
                       "Marvell Technology", "Analog Devices", "NXP Semiconductors", "ON Semiconductor", "Skyworks Solutions"],
    "cybersecurity": ["CrowdStrike", "Palo Alto Networks", "Fortinet", "Zscaler", "Okta",
                      "SentinelOne", "Tenable Holdings", "CyberArk Software", "Varonis Systems", "Rapid7",
                      "Cloudflare", "Check Point Software", "Qualys", "Darktrace", "Rubrik"],
    "cloud computing": ["Amazon", "Microsoft", "Alphabet", "Oracle", "Snowflake",
                        "Salesforce", "IBM", "Cloudflare", "DigitalOcean", "Akamai Technologies",
                        "MongoDB", "HashiCorp", "Fastly", "Rackspace Technology", "Nutanix"],
    "fintech": ["Visa", "Mastercard", "PayPal", "Block", "Fiserv",
                "Adyen", "Affirm Holdings", "Marqeta", "SoFi Technologies", "Global Payments",
                "Flywire Corporation", "Green Dot Corporation", "Nuvei Corporation", "Repay Holdings", "Payoneer Global"],
    "quantum computing": ["IBM", "IonQ", "Rigetti Computing", "D-Wave Quantum", "Microsoft",
                          "Honeywell International", "Alphabet", "Intel", "Amazon", "NVIDIA",
                          "Leidos Holdings", "Booz Allen Hamilton", "Raytheon Technologies", "SAIC", "Northrop Grumman"],
    "robotics": ["Intuitive Surgical", "Rockwell Automation", "Teradyne", "Zebra Technologies", "Symbotic",
                 "ABB", "Cognex", "Roper Technologies", "Applied Industrial Technologies", "Watts Water Technologies",
                 "Keyence", "Yaskawa Electric", "Omron", "Brooks Automation", "Onto Innovation"],
    "telecom": ["Verizon", "AT&T", "T-Mobile US", "Cisco Systems", "Comcast",
                "Charter Communications", "Lumen Technologies", "Crown Castle", "American Tower", "Qualcomm",
                "DISH Network", "Telephone and Data Systems", "SBA Communications", "Calix", "Ribbon Communications"],
    # ── Energy / climate / mobility ───────────────────────────────────────
    "climate tech": ["Tesla", "First Solar", "Enphase Energy", "Plug Power", "Bloom Energy",
                     "Array Technologies", "Sunrun", "Sunnova Energy", "Stem", "Fluence Energy",
                     "Shoals Technologies", "Altus Power", "TPI Composites", "Clearway Energy", "Pattern Energy"],
    "energy": ["NextEra Energy", "First Solar", "Enphase Energy", "Bloom Energy", "Plug Power",
               "ExxonMobil", "Chevron", "ConocoPhillips", "Schlumberger", "Halliburton",
               "Duke Energy", "Southern Company", "Dominion Energy", "Entergy", "Consolidated Edison"],
    "automotive": ["Tesla", "General Motors", "Ford Motor", "Rivian Automotive", "Lucid Group",
                   "Toyota", "Volkswagen", "Stellantis", "NIO", "Li Auto",
                   "Aptiv", "BorgWarner", "Lear Corporation", "Modine Manufacturing", "Dorman Products"],
    "aerospace": ["Boeing", "Lockheed Martin", "RTX", "Northrop Grumman", "General Dynamics",
                  "L3Harris Technologies", "Textron", "Leidos Holdings", "HEICO", "TransDigm Group",
                  "Spirit AeroSystems", "Moog", "Mercury Systems", "Curtiss-Wright", "Ducommun"],
    # ── Consumer / industrial / finance ───────────────────────────────────
    "consumer": ["Procter & Gamble", "Coca-Cola", "PepsiCo", "Nike", "Costco Wholesale",
                 "Unilever", "Colgate-Palmolive", "Kimberly-Clark", "Estee Lauder", "Church & Dwight",
                 "Clorox", "Hershey", "General Mills", "Hasbro", "Mattel"],
    "retail": ["Walmart", "Amazon", "Costco Wholesale", "Target", "Home Depot",
               "Lowe's", "Kroger", "TJX Companies", "Dollar General", "Best Buy",
               "Dollar Tree", "Walgreens Boots Alliance", "Macy's", "Ross Stores", "Gap"],
    "finance": ["JPMorgan Chase", "Bank of America", "Goldman Sachs", "Morgan Stanley", "BlackRock",
                "Wells Fargo", "Citigroup", "Charles Schwab", "American Express", "Berkshire Hathaway",
                "U.S. Bancorp", "PNC Financial Services", "State Street", "T. Rowe Price", "Raymond James Financial"],
    "insurance": ["Berkshire Hathaway", "Progressive", "Allstate", "Travelers", "Chubb",
                  "MetLife", "Prudential Financial", "American International Group", "Aflac", "Marsh & McLennan",
                  "Unum Group", "Principal Financial Group", "Lincoln National", "Sun Life Financial", "Reinsurance Group of America"],
    "industrial": ["Caterpillar", "Honeywell International", "General Electric", "3M", "Emerson Electric",
                   "Parker Hannifin", "Eaton", "Illinois Tool Works", "Deere & Company", "Cummins",
                   "Rockwell Automation", "Dover Corporation", "Xylem", "IDEX Corporation", "Watts Water Technologies"],
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


# Generic catch-all sectors. A bare single word ("food", "tech", "energy")
# may map here, but a qualified multi-word term ("pet food", "solar panels",
# "electric vehicle") is too specific to force into a broad bucket — those
# fall through to live SEC discovery, which surfaces the actual niche players
# (Freshpet, First Solar, Rivian) instead of generic megacaps.
_BROAD_TARGETS = {
    "consumer", "retail", "technology", "industrial",
    "energy", "automotive", "climate tech", "software",
}


def canonical_sector(sector: str) -> Optional[str]:
    """Resolve a raw sector string to a canonical SECTOR_SEEDS key, or None.

    Order matters: exact key, then whole-string abbreviations, then keyword
    routes, then (length-guarded) loose containment, then fuzzy skeleton match.

    Returning None is a feature, not a failure: it signals the orchestrator to
    research the term live via SEC EDGAR full-text discovery. So we deliberately
    decline to match a niche, qualified term (e.g. "pet food", "solar panels")
    to a broad curated bucket — discovery yields a far more relevant company set.
    """
    key = (sector or "").lower().strip()
    if not key:
        return None
    if key in SECTOR_SEEDS:
        return key
    if key in _EXACT_ALIASES:
        return _EXACT_ALIASES[key]

    single_token = " " not in key
    for needles, target in _KEYWORD_ROUTES:
        broad = target in _BROAD_TARGETS
        for n in needles:
            nn = n.strip()
            if nn not in key:
                continue
            # Broad catch-alls only fire on a bare single-word input; a
            # multi-word qualifier ("pet food") should be researched live.
            # Specific sectors (insurance, oncology, pharma…) still match on
            # substring, so "car insurance" → insurance is preserved.
            if broad and not single_token:
                continue
            return target

    # Loose containment — single-token inputs only, and never into a broad
    # bucket, so niche multi-word terms keep falling through to discovery.
    if single_token and len(key) >= 4:
        for known in SECTOR_SEEDS:
            if known in _BROAD_TARGETS:
                continue
            if known in key or key in known:
                return known

    # Fuzzy: tolerate misspellings by comparing consonant skeletons.
    skel = _collapse(key)
    if len(skel) >= 3 and single_token:
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

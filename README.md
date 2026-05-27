# ARIA-PI — Automated Research Intelligence for Academic Partnership Intelligence

**Version:** 0.1.0  
**Maintainer:** Research Intelligence Team — Innovate Carolina / UNC Chapel Hill  
**Status:** Specification / Pre-build  
**Last Updated:** 2026-05-27  

---

## Table of Contents

1. [Overview](#1-overview)
2. [What This Program Does](#2-what-this-program-does)
3. [System Architecture](#3-system-architecture)
4. [Pipeline Stages](#4-pipeline-stages)
5. [Data Sources and APIs](#5-data-sources-and-apis)
6. [Directory Structure](#6-directory-structure)
7. [Installation](#7-installation)
8. [Configuration](#8-configuration)
9. [Usage](#9-usage)
10. [Module Reference](#10-module-reference)
11. [Output Format](#11-output-format)
12. [Verification Layer](#12-verification-layer)
13. [Limitations and Human Review Gates](#13-limitations-and-human-review-gates)
14. [Dependencies](#14-dependencies)
15. [Environment Variables](#15-environment-variables)
16. [Roadmap](#16-roadmap)

---

## 1. Overview

ARIA-PI automates the Research Intelligence Team's end-to-end workflow for producing partnership intelligence reports. It takes a sector name and optional company list as input and produces a fully structured, source-cited Markdown report ready for human verification before delivery to the Business Development team.

The program does not replace human judgment. It eliminates the mechanical labor — searching, pulling, formatting, cross-referencing — so the analyst's time is spent on verification, relationship judgment, and strategic framing.

Every claim the program writes is tagged with its source URLs. Any claim that cannot be double-sourced is flagged `[UNVERIFIED]` rather than guessed.

---

## 2. What This Program Does

The program replicates the following Research Intelligence Team workflow in sequence:

```
Sector Input
    |
    v
Stage 1: Sector Overview
    — Market data, NC context, UNC unit mapping
    |
    v
Stage 2: Internal Mapping
    — Existing UNC partnerships, faculty expertise, data assets, risk flags
    |
    v
Stage 3: Company Selection
    — Scoring and filtering against five criteria, exclusion logging
    |
    v
Stage 4: Company Profiles
    — Facts table, pipeline, partnering history, UNC alignment, what UNC offers
    |
    v
Stage 5: Value Proposition
    — Sector-level UNC assets, talent, infrastructure, partnership models
    |
    v
Stage 6: Talking Points
    — Four-point structured talking points per company for Bus Dev
    |
    v
Stage 7: Report Assembly
    — All sections merged into a single structured Markdown report
    |
    v
Stage 8: Verification Pass
    — Source count check, unverified flag scan, completeness check
    |
    v
Output: Full report .md file + verification log
```

---

## 3. System Architecture

```
aria_pi/
├── orchestrator.py          # Entry point. Runs the full pipeline in sequence.
├── config.py                # Loads environment variables and user config.
│
├── stages/
│   ├── sector_overview.py   # Stage 1
│   ├── internal_mapping.py  # Stage 2
│   ├── company_selection.py # Stage 3
│   ├── company_profiler.py  # Stage 4
│   ├── value_proposition.py # Stage 5
│   ├── talking_points.py    # Stage 6
│   ├── report_assembler.py  # Stage 7
│   └── verification.py      # Stage 8
│
├── clients/
│   ├── pubmed_client.py     # NCBI E-utilities wrapper
│   ├── nih_reporter_client.py
│   ├── clinicaltrials_client.py
│   ├── sec_edgar_client.py
│   ├── openalex_client.py
│   ├── web_search_client.py # Tavily API wrapper
│   └── claude_client.py     # Anthropic API wrapper
│
├── models/
│   ├── sector.py            # Sector dataclass
│   ├── company.py           # Company dataclass
│   ├── profile.py           # Profile dataclass
│   ├── claim.py             # Claim + source pair dataclass
│   └── report.py            # Full report dataclass
│
├── utils/
│   ├── source_tagger.py     # Attaches and validates source URLs to claims
│   ├── deduplicator.py      # Removes duplicate sources and companies
│   ├── formatter.py         # Renders dataclasses to Markdown sections
│   └── logger.py            # Structured logging
│
├── data/
│   ├── unc_units.json       # Master list of UNC schools, centers, URLs
│   ├── unc_faculty.json     # Seeded faculty list; supplemented by API lookup
│   ├── unc_datasets.json    # Known UNC data assets with descriptions
│   └── partnership_models.json
│
├── tests/
│   ├── test_pubmed_client.py
│   ├── test_internal_mapping.py
│   ├── test_company_profiler.py
│   ├── test_verification.py
│   └── fixtures/
│
├── output/                  # Generated reports written here
├── logs/                    # Run logs written here
├── .env                     # API keys (not committed)
├── requirements.txt
└── README.md
```

---

## 4. Pipeline Stages

### Stage 1 — Sector Overview (`sector_overview.py`)

**Input:** Sector name string (e.g., `"oncology diagnostics"`)  
**Output:** `SectorOverview` dataclass with four populated fields and source lists

**What it does:**

1. Queries Tavily web search for market size and growth data using structured queries: `"{sector} market size 2024 site:statista.com OR site:nih.gov OR site:cms.gov"`.
2. Queries NIH Reporter for active grants in the sector to establish funding signal. Endpoint: `https://api.reporter.nih.gov/v2/projects/search`.
3. Queries PubMed for recent high-citation publications in the sector with UNC Chapel Hill affiliation. Endpoint: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`.
4. Searches `unc_units.json` against the sector keywords to identify relevant UNC units.
5. Passes all raw results to Claude with a structured prompt to synthesize the four subsections of the Sector Overview.
6. Every sentence Claude writes is checked by `source_tagger.py` to confirm at least two sources exist in the raw results before that sentence is kept.

**Human review required:** NC-specific context and non-obvious players. The program flags this subsection for analyst review because web search alone is insufficient for identifying non-obvious NC industry connections (e.g., agricultural sectors, manufacturing).

---

### Stage 2 — Internal Mapping (`internal_mapping.py`)

**Input:** Sector name, list of candidate company names (optional at this stage)  
**Output:** `InternalMap` dataclass containing partnership table, faculty table, data asset table, risk flag table

**What it does:**

1. Queries NIH Reporter for grants where the company name appears as a sponsor or collaborator alongside a UNC affiliation.
2. Queries PubMed for co-authored publications between named UNC faculty and each candidate company. Search format: `"{company_name}"[Affiliation] AND "University of North Carolina"[Affiliation]`.
3. Queries OpenAlex for institutional collaboration records. Endpoint: `https://api.openalex.org/works`.
4. Loads `unc_faculty.json` and `unc_datasets.json` and filters by sector keyword match.
5. Passes all hits to Claude to classify relationship type (Research / Licensing / Gift / Sponsored / Alumni) and assess whether the relationship appears active or inactive based on publication and grant dates.
6. Flags any company with an active relationship (grant or publication within 36 months) as a relationship risk. These companies are written to the risk table and a `RISK_FLAG` field is set on the company object.

**Critical behavior:** A company with an active `RISK_FLAG` cannot be moved to Stage 3 for profiling without a `risk_override: true` field set manually in the config by the analyst. The program enforces this gate.

---

### Stage 3 — Company Selection (`company_selection.py`)

**Input:** Candidate company list (from user input or generated by Stage 1 web search), `InternalMap` from Stage 2  
**Output:** `CompanySelectionResult` with selected companies, excluded companies, and scores

**What it does:**

1. If no company list is provided by the user, the program generates candidates by querying Tavily for `"{sector} companies partnering with universities research collaboration"` and extracting company names from results using Claude.
2. Each candidate is scored against five criteria:

| Criterion | Score Weight | Data Source |
|---|---|---|
| Pipeline or platform aligns with named UNC faculty or center | 30 | PubMed, NIH Reporter, `unc_faculty.json` |
| Documented external partnering or licensing history | 25 | Company website, SEC EDGAR |
| No active conflicting UNC partnership | Pass/Fail gate | Stage 2 risk flags |
| NC presence or NC industry relevance | 20 | Tavily, SEC EDGAR HQ field |
| Active BD or licensing team | 25 | Company website careers page, LinkedIn public data |

3. Companies below a configurable score threshold (default: 55/100) are excluded and logged with reason.
4. Top N companies (default: 5, configurable) advance to Stage 4.
5. All excluded companies are written to the exclusion log with the criteria they failed.

---

### Stage 4 — Company Profiler (`company_profiler.py`)

**Input:** List of selected `Company` objects  
**Output:** List of `CompanyProfile` dataclasses, one per company

**What it does per company:**

1. **Facts table:** Queries SEC EDGAR full-text search for company filings to extract legal name, HQ, company type, employee count, and revenue. Endpoint: `https://efts.sec.gov/LATEST/search-index?q={company_name}`. Supplements with Tavily for private companies not on EDGAR.

2. **Pipeline:** Queries ClinicalTrials.gov for active and completed trials. Endpoint: `https://clinicaltrials.gov/api/v2/studies?query.term={company_name}`. Also pulls from company website pipeline page via Tavily fetch.

3. **Partnering history:** Queries SEC EDGAR 8-K filings for partnership and licensing announcements. Supplements with Tavily search: `"{company_name}" "research agreement" OR "license agreement" OR "sponsored research" site:{company_domain}`.

4. **UNC alignment:** For each pipeline program identified, queries PubMed for UNC faculty publications in the same indication and mechanism space. Constructs alignment pairings: company program → UNC faculty or center. Each pairing requires two sources on the company side and two sources on the UNC side before it is written.

5. **What UNC can offer:** Loads `unc_datasets.json` and `unc_faculty.json`, filters by relevance to this company's pipeline, and constructs the offerings table. Claude writes the "why it matters to this company" cell using the company pipeline data as context.

6. **Key signals:** Queries Tavily for company news in the last 24 months filtered to the company's own domain. Extracts deal announcements, funding rounds, and hiring signals.

**Source enforcement:** `source_tagger.py` runs after each subsection. Any claim without two valid URLs is tagged `[UNVERIFIED — ANALYST REVIEW REQUIRED]` and written to the verification log.

---

### Stage 5 — Value Proposition (`value_proposition.py`)

**Input:** `SectorOverview`, `InternalMap`, list of `CompanyProfile` objects  
**Output:** `ValueProposition` dataclass

**What it does:**

1. Aggregates all UNC data assets, faculty, and talent programs identified across Stages 2 and 4.
2. Deduplicates using `deduplicator.py` — if a faculty member appears in multiple profiles, they appear once in the value proposition.
3. Queries UNC school websites and NIH Reporter for forward-looking investment signals (new center grants, strategic plan announcements).
4. Claude writes the forward value signal bullets using only the sourced results as input. It is not permitted to project or speculate — it can only report what the sources state.
5. Loads `partnership_models.json` and filters to models that are relevant to this sector based on the pipeline types identified in Stage 4.

---

### Stage 6 — Talking Points (`talking_points.py`)

**Input:** List of `CompanyProfile` objects, `SectorOverview`, `ValueProposition`  
**Output:** `TalkingPoints` dataclass with sector-level opening and four points per company

**What it does:**

1. For each company, extracts the four highest-confidence facts from the profile: one strategic or financial fact, one pipeline fact, one partnering signal, and the strongest UNC alignment pairing.
2. Claude formats each fact into one to two sentences suitable for a first conversation. The prompt instructs Claude to write in plain language with no filler and to stay strictly within the sourced facts provided.
3. Source tags are carried forward from the profile — each talking point retains its two source URLs.
4. The sector-level opening is synthesized from the Sector Overview subsections.

---

### Stage 7 — Report Assembly (`report_assembler.py`)

**Input:** All stage outputs  
**Output:** Single `.md` file following the Partnership Intelligence Report template

**What it does:**

1. `formatter.py` renders each dataclass into its corresponding Markdown section using the template structure.
2. Sections are assembled in order: header, Section 1 through 6, verification checklist, references.
3. References are deduplicated and numbered sequentially. In-text citations are updated to match the final reference numbers.
4. The output file is written to `output/{sector_slug}_{YYYYMMDD}.md`.
5. A separate `output/{sector_slug}_{YYYYMMDD}_verification_log.md` is written containing all `[UNVERIFIED]` flags and their locations.

---

### Stage 8 — Verification Pass (`verification.py`)

**Input:** Assembled report `.md` file  
**Output:** Verification log, pass/fail status per check

**Checks run:**

| Check | Method | Fail Behavior |
|---|---|---|
| Every claim has two sources | Count source tags per sentence | Flag claim, add to log |
| No Wikipedia or aggregator sources | URL pattern match against blocklist | Flag source, add to log |
| No active risk-flagged company in outreach list | Cross-reference Stage 2 risk flags | Hard stop — blocks report output |
| Strategic vs. translational flag set for all companies | Field presence check | Flag company, add to log |
| "What UNC can offer" has named assets (no generic text) | Keyword scan for banned phrases | Flag cell, add to log |
| All talking points have source tags | Tag presence check per point | Flag point, add to log |
| Company facts table fully populated | Null field check | Flag field, add to log |

**Banned generic phrases** (checked in "What UNC can offer" cells):
- "strong research capacity"
- "world-class"
- "leading institution"
- "robust pipeline"
- "innovative"
- "cutting-edge"

If any hard-stop condition is triggered, the report is not written to output. It is written to `output/blocked/` with the blocking reason logged.

---

## 5. Data Sources and APIs

| Source | What It Provides | Endpoint / Access | Auth Required |
|---|---|---|---|
| NCBI PubMed E-utilities | Publications, co-authorship, UNC faculty research | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` | API key (free) |
| NIH Reporter | Active and historical NIH grants, sponsors, PIs | `https://api.reporter.nih.gov/v2/projects/search` | None |
| ClinicalTrials.gov | Company-sponsored trials, phases, indications | `https://clinicaltrials.gov/api/v2/studies` | None |
| SEC EDGAR | Filings, 8-K announcements, company facts | `https://efts.sec.gov/LATEST/search-index` | None |
| OpenAlex | Academic publication and institutional collaboration graph | `https://api.openalex.org/works` | None (polite pool) |
| Tavily Search API | Web search with domain filtering | `https://api.tavily.com/search` | API key (paid) |
| Anthropic Claude API | Synthesis, drafting, classification | `https://api.anthropic.com/v1/messages` | API key (paid) |
| `unc_units.json` | Internal master list of UNC schools and centers | Local file | None |
| `unc_faculty.json` | Seeded faculty list with research focus | Local file, updated by PubMed queries | None |
| `unc_datasets.json` | Known UNC data assets | Local file, maintained by team | None |

---

## 6. Directory Structure

```
aria_pi/
├── orchestrator.py
├── config.py
├── stages/
│   ├── __init__.py
│   ├── sector_overview.py
│   ├── internal_mapping.py
│   ├── company_selection.py
│   ├── company_profiler.py
│   ├── value_proposition.py
│   ├── talking_points.py
│   ├── report_assembler.py
│   └── verification.py
├── clients/
│   ├── __init__.py
│   ├── pubmed_client.py
│   ├── nih_reporter_client.py
│   ├── clinicaltrials_client.py
│   ├── sec_edgar_client.py
│   ├── openalex_client.py
│   ├── web_search_client.py
│   └── claude_client.py
├── models/
│   ├── __init__.py
│   ├── sector.py
│   ├── company.py
│   ├── profile.py
│   ├── claim.py
│   └── report.py
├── utils/
│   ├── __init__.py
│   ├── source_tagger.py
│   ├── deduplicator.py
│   ├── formatter.py
│   └── logger.py
├── data/
│   ├── unc_units.json
│   ├── unc_faculty.json
│   ├── unc_datasets.json
│   └── partnership_models.json
├── tests/
│   ├── __init__.py
│   ├── test_pubmed_client.py
│   ├── test_internal_mapping.py
│   ├── test_company_profiler.py
│   ├── test_verification.py
│   └── fixtures/
│       ├── sample_pubmed_response.json
│       ├── sample_nih_reporter_response.json
│       └── sample_clinicaltrials_response.json
├── output/
│   └── blocked/
├── logs/
├── .env
├── .env.example
├── requirements.txt
├── pyproject.toml
└── README.md
```

---

## 7. Installation

Requires Python 3.11 or higher.

```bash
# Clone the repository
git clone https://github.com/your-org/aria-pi.git
cd aria-pi

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
.venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment variable template and fill in your keys
cp .env.example .env
```

---

## 8. Configuration

### `.env` file

```
ANTHROPIC_API_KEY=your_anthropic_key_here
TAVILY_API_KEY=your_tavily_key_here
NCBI_API_KEY=your_ncbi_key_here         # Optional but raises PubMed rate limit
```

### `config.yaml` (runtime configuration)

```yaml
# How many companies to profile per report
companies_per_report: 5

# Minimum selection score out of 100 to advance a company to profiling
selection_score_threshold: 55

# Number of months back to consider a UNC relationship "active" for risk flagging
relationship_active_window_months: 36

# Number of months back to include in "key recent signals"
signals_window_months: 24

# Claude model to use for synthesis
claude_model: claude-sonnet-4-20250514

# Maximum tokens per Claude call
claude_max_tokens: 4096

# Output directory
output_dir: ./output

# Log directory
log_dir: ./logs

# Whether to stop the pipeline on first hard-stop verification failure
hard_stop_on_risk_flag: true

# UNC affiliation strings to use in PubMed queries
unc_affiliation_strings:
  - "University of North Carolina at Chapel Hill"
  - "UNC Chapel Hill"
  - "UNC-Chapel Hill"
  - "Gillings School of Global Public Health"
  - "UNC School of Medicine"
  - "Eshelman School of Pharmacy"
  - "UNC CHIP"
  - "UNC Lineberger"
  - "UNC Health"
```

---

## 9. Usage

### Run a full pipeline

```bash
python orchestrator.py --sector "oncology diagnostics" --output-name oncology_dx
```

### Run with a predefined company list

```bash
python orchestrator.py \
  --sector "oncology diagnostics" \
  --companies "Foundation Medicine,Guardant Health,Tempus AI,Veracyte,Exact Sciences" \
  --output-name oncology_dx
```

### Run a single stage for testing

```bash
python orchestrator.py \
  --sector "oncology diagnostics" \
  --stage internal_mapping \
  --companies "Foundation Medicine,Guardant Health"
```

### Override a risk flag (analyst approval required)

```bash
python orchestrator.py \
  --sector "oncology diagnostics" \
  --companies "Foundation Medicine,Guardant Health" \
  --risk-override "Foundation Medicine" \
  --output-name oncology_dx
```

The `--risk-override` flag requires a justification string and is logged with the analyst's username from the OS environment.

### CLI reference

```
usage: orchestrator.py [-h] --sector SECTOR
                       [--companies COMPANIES]
                       [--output-name OUTPUT_NAME]
                       [--stage STAGE]
                       [--risk-override COMPANY_NAME]
                       [--config CONFIG_PATH]
                       [--dry-run]

Arguments:
  --sector          Required. Sector name string.
  --companies       Optional. Comma-separated list of company names.
                    If omitted, the program generates candidates from web search.
  --output-name     Optional. Base filename for output files. Defaults to sector slug.
  --stage           Optional. Run only one stage by name for debugging.
  --risk-override   Optional. Company name to override a risk flag. Requires analyst review.
  --config          Optional. Path to a config.yaml file. Defaults to ./config.yaml.
  --dry-run         Run the full pipeline but do not write output files.
                    Logs all actions and source counts to stdout.
```

---

## 10. Module Reference

### `clients/pubmed_client.py`

```python
class PubMedClient:
    def search_by_affiliation(self, query: str, affiliation: str, max_results: int = 20) -> list[dict]:
        """
        Search PubMed for publications matching a query with a given institution affiliation.

        Args:
            query: Search term — e.g., "KRAS inhibitor" or "rural health outcomes".
            affiliation: Institution affiliation string — e.g., "UNC Chapel Hill".
            max_results: Maximum number of results to return.

        Returns:
            List of publication dicts with keys: pmid, title, authors, journal, year, url.
        """

    def search_co_authorship(self, company_name: str, unc_affiliation: str, max_results: int = 10) -> list[dict]:
        """
        Search PubMed for papers co-authored by a company and a UNC-affiliated author.

        Args:
            company_name: Company name as it appears in PubMed affiliation fields.
            unc_affiliation: UNC affiliation string.
            max_results: Maximum number of results to return.

        Returns:
            List of publication dicts. Empty list if no co-authorship found.
        """
```

### `clients/nih_reporter_client.py`

```python
class NIHReporterClient:
    def search_grants(self, term: str, org_name: str = None, fiscal_years: list[int] = None) -> list[dict]:
        """
        Search NIH Reporter for active and historical grants.

        Args:
            term: Search term — e.g., sector name or company name.
            org_name: Filter by organization name — e.g., "University of North Carolina".
            fiscal_years: List of fiscal years to include. Defaults to last 5 years.

        Returns:
            List of grant dicts with keys: project_num, title, pi_names, org_name,
            total_cost, fiscal_year, abstract_text, url.
        """

    def search_company_as_sponsor(self, company_name: str) -> list[dict]:
        """
        Search for grants where the company appears as a sponsor or collaborator
        alongside a UNC affiliation.

        Args:
            company_name: Company name string.

        Returns:
            List of matching grant dicts. Empty list if none found.
        """
```

### `clients/clinicaltrials_client.py`

```python
class ClinicalTrialsClient:
    def search_by_sponsor(self, sponsor_name: str, status: list[str] = None) -> list[dict]:
        """
        Search ClinicalTrials.gov for trials sponsored by a given company.

        Args:
            sponsor_name: Company name as it appears in ClinicalTrials.gov sponsor field.
            status: List of statuses to include — e.g., ["RECRUITING", "ACTIVE_NOT_RECRUITING",
                    "COMPLETED"]. Defaults to all statuses.

        Returns:
            List of trial dicts with keys: nct_id, title, sponsor, phase,
            conditions, interventions, status, start_date, url.
        """
```

### `clients/sec_edgar_client.py`

```python
class SECEdgarClient:
    def get_company_facts(self, company_name: str) -> dict:
        """
        Retrieve company facts from SEC EDGAR including HQ, employee count,
        SIC code, and most recent revenue figure.

        Args:
            company_name: Company name string.

        Returns:
            Dict with keys: legal_name, hq_city, hq_state, employee_count,
            sic_code, revenue, fiscal_year_end, cik, url.
            Returns empty dict if company not found on EDGAR (private company).
        """

    def search_8k_filings(self, company_name: str, keywords: list[str], months_back: int = 24) -> list[dict]:
        """
        Search 8-K filings for partnership, licensing, or deal announcements.

        Args:
            company_name: Company name string.
            keywords: List of keywords to search within filing text —
                      e.g., ["license agreement", "research collaboration", "sponsored research"].
            months_back: How many months back to search filings.

        Returns:
            List of filing dicts with keys: date, filing_type, description, url.
        """
```

### `clients/claude_client.py`

```python
class ClaudeClient:
    def synthesize_section(self, system_prompt: str, user_prompt: str, raw_sources: list[dict]) -> str:
        """
        Send a structured prompt to Claude with raw source data and receive a
        synthesized prose or table section.

        Args:
            system_prompt: Role and constraint definition for Claude.
            user_prompt: The specific section prompt with raw data embedded.
            raw_sources: List of source dicts used in this section. Used by the
                         caller to validate source coverage after generation.

        Returns:
            Claude's response string. Caller is responsible for passing this
            to source_tagger.py before writing to report.
        """
```

### `utils/source_tagger.py`

```python
class SourceTagger:
    def validate_claim(self, claim_text: str, available_sources: list[str]) -> tuple[bool, list[str]]:
        """
        Check whether a claim can be backed by at least two sources from the
        available source list.

        Args:
            claim_text: The sentence or claim to validate.
            available_sources: List of source URLs gathered during the stage that
                               produced this claim.

        Returns:
            Tuple of (is_valid: bool, matched_sources: list[str]).
            is_valid is True only if len(matched_sources) >= 2.
        """

    def tag_or_flag(self, claim_text: str, available_sources: list[str]) -> str:
        """
        Return the claim with source tags appended if valid, or with
        [UNVERIFIED — ANALYST REVIEW REQUIRED] appended if not.

        Args:
            claim_text: The sentence or claim to tag.
            available_sources: List of source URLs from the stage context.

        Returns:
            Claim string with source tags or unverified flag.
        """
```

### `models/claim.py`

```python
@dataclass
class Claim:
    text: str                    # The claim sentence
    sources: list[str]           # List of source URLs (must have >= 2 to be valid)
    is_verified: bool            # True if sources >= 2 and sources pass blocklist check
    stage: str                   # Which pipeline stage produced this claim
    company_name: str | None     # Company context if applicable
    unverified_reason: str | None  # Why the claim is unverified, if applicable
```

---

## 11. Output Format

### Primary report file

```
output/{sector_slug}_{YYYYMMDD}.md
```

The report follows the Partnership Intelligence Report template exactly. All section headers, table structures, and field labels match the template. The report is ready to paste into the team's document system or send directly to Bus Dev after analyst verification.

### Verification log file

```
output/{sector_slug}_{YYYYMMDD}_verification_log.md
```

Contains:
- Run timestamp and config snapshot
- List of all `[UNVERIFIED]` claims with their location (section, company, field)
- List of all relationship risk flags with source URLs
- Selection score breakdown for all companies evaluated (included and excluded)
- Source count summary by section
- Hard stop conditions triggered (if any)

### Structured JSON output (optional)

```
output/{sector_slug}_{YYYYMMDD}.json
```

Enabled via `--json` flag. Contains all dataclass objects serialized to JSON. Used for downstream tooling or CRM import.

---

## 12. Verification Layer

The verification layer has two categories of checks: soft flags and hard stops.

**Soft flags** are written to the verification log and marked `[UNVERIFIED]` in the report. The report is still written to output. The analyst must resolve or accept each soft flag before sending to Bus Dev.

**Hard stops** prevent the report from being written to the main output directory. The report is written to `output/blocked/` with the blocking reason. An analyst must manually intervene.

| Check | Category | Trigger |
|---|---|---|
| Claim has fewer than two sources | Soft flag | `source_tagger.validate_claim` returns False |
| Source URL is on the blocklist | Soft flag | URL matches blocklist pattern |
| Generic phrase found in "What UNC can offer" | Soft flag | Keyword scan matches banned phrase list |
| Company facts table has null fields | Soft flag | Null field check on required fields |
| Talking point missing source tag | Soft flag | Tag presence check |
| Active risk-flagged company in report without override | Hard stop | Stage 2 risk flag + no override flag |
| Report has zero verified alignment pairings | Hard stop | Count of verified pairings < 1 |
| Verification checklist section missing | Hard stop | Section header check |

**Blocklisted source URL patterns:**
```
wikipedia.org
en.m.wikipedia.org
businesswire.com (allowed only if subdomain matches company domain)
prnewswire.com (allowed only if company is named in headline)
crunchbase.com
zoominfo.com
linkedin.com (not a citable source)
glassdoor.com
indeed.com
```

---

## 13. Limitations and Human Review Gates

The program does not replace analyst judgment. The following items require human review before any report is sent to Bus Dev.

| Item | Why Human Review Is Required |
|---|---|
| NC non-obvious industry connections | Web search alone does not reliably surface agricultural, manufacturing, or rural industry angles. The analyst must add these manually if relevant. |
| Relationship risk judgment | The program flags risks based on publication dates and grant records. Whether a relationship is sensitive enough to block outreach is a judgment call. |
| Company selection for private companies | SEC EDGAR does not cover private companies. Facts tables for private companies will have more null fields and require manual supplement. |
| Individual contact profiles | The program does not produce individual LinkedIn profiles. This step is owned by Bus Dev using LinkedIn Sales Navigator. |
| Final talking point tone | Claude writes talking points in plain language but the analyst should read each one before delivery to ensure they match the Bus Dev team's voice. |
| Verification checklist sign-off | The analyst must complete and sign the verification checklist. The program produces the checklist but cannot sign it. |

---

## 14. Dependencies

```
# requirements.txt

anthropic==0.25.0
tavily-python==0.3.3
biopython==1.83          # PubMed E-utilities wrapper
httpx==0.27.0            # Async HTTP client for API calls
pydantic==2.7.0          # Data validation for all dataclasses
python-dotenv==1.0.1     # Environment variable loading
pyyaml==6.0.1            # Config file parsing
rich==13.7.1             # Terminal output formatting
pytest==8.2.0            # Test runner
pytest-asyncio==0.23.6   # Async test support
```

---

## 15. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `TAVILY_API_KEY` | Yes | Tavily search API key from app.tavily.com |
| `NCBI_API_KEY` | No | NCBI API key. Without it, PubMed rate limit is 3 requests/second. With it, 10 requests/second. |
| `OUTPUT_DIR` | No | Override output directory path. Defaults to `./output`. |
| `LOG_LEVEL` | No | Logging verbosity. Options: `DEBUG`, `INFO`, `WARNING`. Defaults to `INFO`. |

---

## 16. Roadmap

**v0.1 — Core pipeline (current spec)**
- All eight stages functional
- PubMed, NIH Reporter, ClinicalTrials.gov, SEC EDGAR, Tavily integrations
- Markdown report output
- Verification layer with soft flags and hard stops

**v0.2 — Internal relationship database**
- Replace `unc_faculty.json` flat file with a queryable SQLite database
- Add a script to update the faculty database from PubMed queries on a schedule
- Add a partnerships history table populated from past reports

**v0.3 — Sector trend forecasting**
- Integrate OpenAlex citation graph to identify emerging research areas in a sector
- Add a "sector trajectory" subsection to the Sector Overview using citation trend data
- This addresses the meeting request: "using AI to see what does the future look like"

**v0.4 — CRM export**
- Export company and individual profile data to a structured format for CRM import
- Support CSV export of company facts tables for the Bus Dev Excel tracker
- Add a field to flag companies for Bus Dev that have NC alumni in leadership (requires manual input or LinkedIn data)

**v0.5 — Report versioning and diff**
- Track report versions for the same sector across time
- Flag when a company's pipeline, partnering history, or UNC relationship status has changed since the last report

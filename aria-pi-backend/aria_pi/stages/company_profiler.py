from aria_pi.models.profile import CompanyProfile
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.clinicaltrials_client import ClinicalTrialsClient
from aria_pi.utils.source_tagger import SourceTagger

class CompanyProfilerStage:
    def __init__(self):
        """
        Takes: Nothing.
        Does: Initializes the profiler with required data clients.
        Returns: Nothing.
        """
        self.sec = SECEdgarClient()
        self.trials = ClinicalTrialsClient()
        self.tagger = SourceTagger()

    def run(self, company_name: str) -> CompanyProfile:
        """
        Takes: A company name as a string.
        Does: Orchestrates data clients to build a comprehensive, validated profile.
        Returns: A populated CompanyProfile object.
        """
        # 1. Fetch Raw Data
        facts = self.sec.get_company_facts(company_name)
        trial_data = self.trials.search_by_sponsor(company_name)
        
        # 2. Process Pipeline Claims
        pipeline_claims = []
        for trial in trial_data:
            claim_text = f"Sponsors trial {trial['nct_id']} ({trial['phase']}) for {trial['title']}."
            # Enforce 2-source rule
            claim = self.tagger.tag_or_flag(claim_text, [trial['url'], facts.get('source', '')], "Stage 4")
            pipeline_claims.append(claim)

        # 3. Assemble Profile
        return CompanyProfile(
            company_name=company_name,
            facts={"legal_name": facts.get("legal_name", company_name), "sic": facts.get("sic", "Unknown")},
            pipeline=pipeline_claims,
            partnering_history=[],
            unc_alignment=[],
            what_unc_offers=[]
        )

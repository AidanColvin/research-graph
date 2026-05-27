from aria_pi.models.profile import CompanyProfile
from typing import List, Dict

class VerificationStage:
    def __init__(self):
        """
        Takes: Nothing.
        Does: Initializes the verification rules engine.
        Returns: Nothing.
        """
        self.banned_phrases = ["strong research capacity", "world-class", "leading institution"]

    def run(self, profiles: List[CompanyProfile]) -> Dict:
        """
        Takes: A list of populated CompanyProfile objects.
        Does: Runs soft and hard verification checks across all generated claims.
        Returns: A dictionary containing the verification log and pass/fail status.
        """
        log = {"hard_stops": [], "soft_flags": [], "status": "PASSED"}

        for profile in profiles:
            for claim in profile.pipeline + profile.partnering_history + profile.unc_alignment:
                if not claim.is_verified:
                    log["soft_flags"].append(f"[{profile.company_name}] Unverified Claim: {claim.text}")
                
                # Check for banned generic marketing phrases
                if any(phrase in claim.text.lower() for phrase in self.banned_phrases):
                    log["soft_flags"].append(f"[{profile.company_name}] Banned Phrase detected in claim.")

            # Hard Stop check
            if not profile.facts.get("legal_name"):
                log["hard_stops"].append(f"[{profile.company_name}] Missing critical SEC fact data.")
                log["status"] = "BLOCKED"

        return log

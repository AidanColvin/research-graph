from aria_pi.models.claim import Claim

class SourceTagger:
    def __init__(self):
        """
        Takes: Nothing.
        Does: Initializes the tagging engine with blocked domains.
        Returns: Nothing.
        """
        self.blocklist = [
            "wikipedia.org", "en.m.wikipedia.org", "crunchbase.com", 
            "zoominfo.com", "linkedin.com", "glassdoor.com", "indeed.com"
        ]

    def validate_claim(self, claim_text: str, available_sources: list[str]) -> tuple[bool, list[str]]:
        """
        Takes: The claim string and a list of URL strings.
        Does: Validates if the claim has at least two valid sources not on the blocklist.
        Returns: Tuple containing boolean (is_valid) and a list of matched, clean sources.
        """
        clean_sources = [
            src for src in available_sources 
            if not any(blocked in src for blocked in self.blocklist)
        ]
        
        # Enforce the strict 2-source minimum rule
        is_valid = len(clean_sources) >= 2
        return is_valid, clean_sources

    def tag_or_flag(self, claim_text: str, available_sources: list[str], stage: str) -> Claim:
        """
        Takes: The claim string, available source URLs, and pipeline stage name.
        Does: Creates a formal Claim object, flagging it if verification fails.
        Returns: A structured Claim object.
        """
        is_valid, matched_sources = self.validate_claim(claim_text, available_sources)
        
        reason = None
        if not is_valid:
            claim_text = f"{claim_text} [UNVERIFIED — ANALYST REVIEW REQUIRED]"
            reason = f"Only found {len(matched_sources)} valid sources (2 required)."

        return Claim(
            text=claim_text,
            sources=matched_sources,
            is_verified=is_valid,
            stage=stage,
            unverified_reason=reason
        )

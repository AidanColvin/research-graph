from Bio import Entrez
import os

class PubMedClient:
    def __init__(self, api_key: str = None):
        """
        Takes: api_key as a string.
        Does: Initializes the PubMed client connection.
        Returns: Nothing.
        """
        Entrez.email = "research.intelligence@unc.edu"
        if api_key:
            Entrez.api_key = api_key

    def search_by_affiliation(self, query: str, affiliation: str, max_results: int = 20) -> list[dict]:
        """
        Takes: query string, affiliation string, max_results integer.
        Does: Searches PubMed for publications matching the query and UNC affiliation.
        Returns: A list of dictionaries containing publication details.
        """
        search_term = f"({query}) AND ({affiliation}[Affiliation])"
        
        try:
            handle = Entrez.esearch(db="pubmed", term=search_term, retmax=max_results)
            record = Entrez.read(handle)
            handle.close()
            
            id_list = record.get("IdList", [])
            if not id_list:
                return []
                
            summary_handle = Entrez.esummary(db="pubmed", id=",".join(id_list))
            summaries = Entrez.read(summary_handle)
            summary_handle.close()
            
            results = []
            for item in summaries:
                results.append({
                    "pmid": item.get("Id", ""),
                    "title": item.get("Title", ""),
                    "authors": [author for author in item.get("AuthorList", [])],
                    "journal": item.get("Source", ""),
                    "year": item.get("PubDate", "")[:4],
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{item.get('Id', '')}/"
                })
            return results
        except Exception as e:
            print(f"PubMed search error: {e}")
            return []

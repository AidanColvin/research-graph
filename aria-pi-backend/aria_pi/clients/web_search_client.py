import os

try:
    from tavily import TavilyClient
    HAS_TAVILY = True
except ImportError:
    TavilyClient = None
    HAS_TAVILY = False

class WebSearchClient:
    def __init__(self, api_key: str = None):
        """
        Takes: Optional API key string.
        Does: Initializes the Tavily web search client or a free mock fallback.
        Returns: Nothing.
        """
        self.api_key = api_key or os.environ.get("TAVILY_API_KEY")
        if self.api_key and HAS_TAVILY:
            try:
                self.client = TavilyClient(api_key=self.api_key)
            except Exception as e:
                print(f"Tavily init failed, using mock search: {e}")
                self.client = None
        else:
            self.client = None
            if self.api_key and not HAS_TAVILY:
                print("Warning: tavily package not installed. Using free mock search.")
            else:
                print("Warning: No Tavily API key. Using free mock search.")

    def search_company_news(self, company_name: str) -> list[dict]:
        """
        Takes: company_name as a string.
        Does: Searches the web for recent news and partnership announcements.
        Returns: A list of result dictionaries with title and URL.
        """
        if not self.client:
            return [{"title": f"Mock News: {company_name} announces new partnership", "url": "https://example.com"}]
            
        try:
            query = f"{company_name} research agreement OR license agreement"
            response = self.client.search(query=query, search_depth="basic", max_results=3)
            return response.get("results", [])
        except Exception as e:
            print(f"Tavily Search error: {e}")
            return []

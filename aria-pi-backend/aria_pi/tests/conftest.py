"""Shared pytest fixtures and helpers for the ARIA-PI backend test suite.

Every test mocks external HTTP so the suite is hermetic — no test ever
touches the live SEC, PubMed, NIH, ClinicalTrials, Tavily, or Anthropic
endpoints. `FakeResponse` stands in for a `requests.Response`.
"""
import pytest


class FakeResponse:
    """Minimal stand-in for a `requests.Response` object.

    Supports the surface the clients actually use: `.json()`,
    `.raise_for_status()`, `.text`, `.status_code`, and `.iter_content()`.
    """

    def __init__(self, json_data=None, *, text="", status_code=200,
                 content=b"", raise_exc=None):
        self._json = json_data
        self.text = text
        self.status_code = status_code
        self._content = content or text.encode("utf-8")
        self._raise_exc = raise_exc

    def json(self):
        if self._json is None:
            raise ValueError("No JSON payload")
        return self._json

    def raise_for_status(self):
        if self._raise_exc is not None:
            raise self._raise_exc
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")

    def iter_content(self, chunk_size=1024):
        data = self._content
        for i in range(0, len(data), chunk_size):
            yield data[i:i + chunk_size]


@pytest.fixture
def fake_response():
    """Factory fixture so tests can build FakeResponse objects inline."""
    return FakeResponse


@pytest.fixture(autouse=True)
def _reset_sec_caches():
    """Reset SEC module-level caches between tests so a mocked ticker map in
    one test never leaks into another."""
    from aria_pi.clients import sec_edgar_client as sec
    sec._TICKERS_CACHE = None
    sec._CIK_TITLE_CACHE = None
    yield
    sec._TICKERS_CACHE = None
    sec._CIK_TITLE_CACHE = None

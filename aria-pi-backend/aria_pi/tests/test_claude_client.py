"""Tests for the Claude client.

No live Anthropic calls. Covers stub fallback when no key is set, JSON
parsing (including markdown-fenced output), the live path with a mocked
Anthropic SDK, and graceful error fallback to the stub.
"""
from unittest.mock import MagicMock, patch

from aria_pi.clients.claude_client import (
    ClaudeClient,
    _parse_json,
    _stub_report,
)


def test_no_key_is_not_live():
    """
    Takes: A client with no API key.
    Does: Checks is_live.
    Returns: False — the stub path is used.
    """
    client = ClaudeClient(api_key=None)
    # Force no env key influence
    client.client = None
    assert client.is_live is False


def test_generate_report_uses_stub_without_key():
    """
    Takes: A keyless client and minimal real_data.
    Does: Generates a report.
    Returns: The structured stub, flagged with _stub=True.
    """
    client = ClaudeClient(api_key=None)
    client.client = None
    report = client.generate_report("oncology", {"companies": []})
    assert report["_stub"] is True
    assert report["report_meta"]["sector"] == "oncology"


def test_parse_json_plain():
    """
    Takes: A plain JSON string.
    Does: Parses it.
    Returns: The decoded dict.
    """
    assert _parse_json('{"a": 1}') == {"a": 1}


def test_parse_json_strips_markdown_fence():
    """
    Takes: JSON wrapped in a ```json fence.
    Does: Parses it.
    Returns: The decoded dict (fence stripped).
    """
    assert _parse_json('```json\n{"a": 2}\n```') == {"a": 2}


def test_parse_json_extracts_embedded_object():
    """
    Takes: Text with prose around a JSON object.
    Does: Parses it via the largest-object fallback.
    Returns: The decoded dict.
    """
    assert _parse_json('Here you go: {"a": 3} thanks') == {"a": 3}


def test_parse_json_invalid_returns_none():
    """
    Takes: A string with no valid JSON.
    Does: Parses it.
    Returns: None.
    """
    assert _parse_json("not json at all") is None


def test_stub_report_has_all_sections():
    """
    Takes: A sector and one company in real_data.
    Does: Builds the stub report.
    Returns: All seven sections plus references, using the company name.
    """
    real = {"companies": [{"name": "Moderna", "facts": {"legal_name": "Moderna Inc."},
                           "trials": []}]}
    report = _stub_report("biotech", real)
    for key in ("section1_overview", "section2_internal_mapping",
                "section3_selection", "section4_profiles",
                "section5_value_prop", "section6_talking_points",
                "section7_verification", "references"):
        assert key in report
    assert report["section3_selection"]["selected"][0]["company"] == "Moderna"
    assert len(report["section7_verification"]) == 7


def test_generate_report_live_path_parses_response():
    """
    Takes: A client with a mocked Anthropic SDK returning JSON text.
    Does: Generates a report through the live path.
    Returns: The parsed JSON dict (not the stub).
    """
    client = ClaudeClient(api_key="key")
    mock_sdk = MagicMock()
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text='{"report_meta": {"sector": "x"}}')]
    mock_sdk.messages.create.return_value = mock_msg
    client.client = mock_sdk
    report = client.generate_report("x", {"companies": []})
    assert report == {"report_meta": {"sector": "x"}}


def test_generate_report_live_error_falls_back_to_stub():
    """
    Takes: A live client whose API call raises.
    Does: Generates a report.
    Returns: The stub (error swallowed), flagged _stub=True.
    """
    client = ClaudeClient(api_key="key")
    mock_sdk = MagicMock()
    mock_sdk.messages.create.side_effect = RuntimeError("rate limit")
    client.client = mock_sdk
    report = client.generate_report("x", {"companies": []})
    assert report.get("_stub") is True

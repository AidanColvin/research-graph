"""Vercel serverless entry point — exposes the FastAPI ASGI app.

Vercel's @vercel/python runtime detects the module-level `app` (an ASGI
application) and serves it directly. All routes (/status, /run-pipeline, …)
are handled by the FastAPI app defined in aria_pi.orchestrator.
"""
import os
import sys

# Ensure the project root (which contains the `aria_pi` package) is importable
# regardless of Vercel's function working directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aria_pi.orchestrator import app  # noqa: E402

# Vercel looks for `app` (ASGI) or `handler`. Expose `app`.
__all__ = ["app"]

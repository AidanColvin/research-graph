#!/bin/bash
set -euo pipefail

REPO_ROOT="$(pwd)"
REPORT_DIR="$REPO_ROOT/test-results"
mkdir -p "$REPORT_DIR"

echo "==> Using repo root: $REPO_ROOT"
echo "==> Installing test dependencies..."
python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet pytest pytest-cov pytest-asyncio httpx

echo "==> Running backend tests..."
python3 -m pytest . \
  -v -ra \
  --tb=short \
  --maxfail=20 \
  --junitxml="$REPORT_DIR/junit.xml" \
  --cov=. \
  --cov-report=term-missing \
  --cov-report=xml:"$REPORT_DIR/coverage.xml" \
  --cov-report=html:"$REPORT_DIR/htmlcov" \
  2>&1 | tee "$REPORT_DIR/pytest-terminal-output.txt"

TEST_EXIT=${PIPESTATUS[0]}
echo ""
echo "==> Test run complete with exit code: $TEST_EXIT"
echo "==> Artifacts saved to: $REPORT_DIR"
exit $TEST_EXIT

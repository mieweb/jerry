#!/usr/bin/env bash
# CI script — run locally or from GitHub Actions
# Usage: bash scripts/ci.sh
set -euo pipefail

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Type checking"
pnpm typecheck

echo "==> Linting"
pnpm lint

echo "==> Running tests"
pnpm test

echo "==> CI passed"

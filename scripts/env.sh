#!/usr/bin/env bash
# Sourced by the other scripts. Loads .env, fills GITHUB_PAT from the gh CLI if it is empty, and checks the secrets.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi

if [ -z "${GITHUB_PAT:-}" ] && command -v gh >/dev/null 2>&1; then
  GITHUB_PAT="$(gh auth token 2>/dev/null || true)"
fi
export GITHUB_PAT
export ENTERPRISE_AGENTGATEWAY_LICENSE_KEY="${ENTERPRISE_AGENTGATEWAY_LICENSE_KEY:-${AGENTGATEWAY_LICENSE_KEY:-}}"

need() { [ -n "${!1:-}" ] || { echo "Set $1 (see .env.example)." >&2; return 1; }; }

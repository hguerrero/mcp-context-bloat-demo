#!/usr/bin/env bash
# Starts agentregistry (Docker) and loads registry/servers.yaml into it. Needs Docker with Compose v2.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker compose -f "$ROOT/registry/docker-compose.yaml" up -d --wait
RESP="$(curl -fsS -X POST "${REGISTRY_URL:-http://localhost:12121}/v0/apply" -H 'Content-Type: application/yaml' --data-binary @"$ROOT/registry/servers.yaml")"
echo "registry: applied $(echo "$RESP" | grep -o '"status":"[a-z]*"' | sort | uniq -c | tr -s ' ' | tr '\n' ' ')"
echo "registry UI: ${REGISTRY_URL:-http://localhost:12121}"

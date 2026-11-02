#!/usr/bin/env bash
# Stops agentregistry. Add -v to also delete its data.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker compose -f "$ROOT/registry/docker-compose.yaml" down "$@"

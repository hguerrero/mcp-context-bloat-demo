#!/usr/bin/env bash
# Starts the gateway, the Jira stand-in and the workflow server in the background. Logs go to .run/.
# The registry (Docker) and Headroom (Python) have their own scripts: registry-up.sh and run-headroom.sh.
set -euo pipefail
. "$(dirname "$0")/env.sh"
need ENTERPRISE_AGENTGATEWAY_LICENSE_KEY; need ANTHROPIC_API_KEY; need GITHUB_PAT

BIN="${AGENTGATEWAY_BIN:-}"
if [ -z "$BIN" ]; then
  if [ -x "$HOME/.agentgateway/bin/agentgateway" ]; then BIN="$HOME/.agentgateway/bin/agentgateway"; else BIN="$(command -v agentgateway || true)"; fi
fi
[ -n "$BIN" ] || { echo "agentgateway not found. Install it: curl -fsSL https://run.solo.io/agentgateway/install | sh" >&2; exit 1; }
VERSION="$("$BIN" --version | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)"
case "$VERSION" in
  v20[0-9][0-9].*) ;;
  *) echo "$BIN is version '$VERSION', which is not the Solo Enterprise build. toolMode needs Enterprise." >&2
     echo "Install it with: curl -fsSL https://run.solo.io/agentgateway/install | sh   (or set AGENTGATEWAY_BIN)" >&2
     exit 1 ;;
esac

mkdir -p "$ROOT/.run"
"$ROOT/scripts/down.sh" quiet

start() { # name, command...
  local name="$1"; shift
  ( cd "$ROOT" && nohup "$@" < /dev/null > ".run/$name.log" 2>&1 & echo $! > ".run/$name.pid" )
}

start jira node mocks/jira/server.mjs
start flows npx tsx flows/server.ts
( cd "$ROOT/gateway" && nohup "$BIN" -f config.yaml < /dev/null > "$ROOT/.run/gateway.log" 2>&1 & echo $! > "$ROOT/.run/gateway.pid" )

echo -n "waiting for the gateway"
for _ in $(seq 1 40); do
  if curl -s -o /dev/null -m 1 -X POST localhost:3000/mcp/jira -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
       -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'; then break; fi
  echo -n "."; sleep 0.5
done
echo
echo "gateway $VERSION  http://localhost:3000   admin UI http://localhost:15000/ui"
echo "jira mock         http://localhost:8081"
echo "workflow server   http://localhost:3002/mcp"
echo "logs: .run/*.log   stop: scripts/down.sh"

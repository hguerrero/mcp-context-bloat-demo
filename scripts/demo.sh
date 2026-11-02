#!/usr/bin/env bash
# Presenter script. Each demo matches a marker in the deck. Press Enter between steps.
#
#   ./scripts/demo.sh 1        Demo 1: build the agent, then add MCP servers (stages 0 to 3)
#   ./scripts/demo.sh 2        Demo 2: tools just in time from agentregistry
#   ./scripts/demo.sh 3        Demo 3: compression with Headroom (needs ./scripts/run-headroom.sh running)
#   ./scripts/demo.sh 4        Demo 4: one endpoint, four tool modes
#   ./scripts/demo.sh 5        Demo 5 (optional): Arazzo workflows as tools
#   ./scripts/demo.sh finale   The one-demo version: baseline vs registry vs codeSearch in a single table
#   ./scripts/demo.sh check    Is everything up?
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/env.sh

step() { echo; echo "\$ $*"; [ -n "${NOPAUSE:-}" ] || read -r -p "  [Enter to run] " _; "$@"; }
agent() { npm run -s agent -- "$@"; }
cmp() { npm run -s compare; }

case "${1:-}" in
  check)
    echo -n "gateway:   "; curl -s -o /dev/null -m 2 -w '%{http_code}\n' -X POST localhost:3000/mcp/jira -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' || echo "DOWN (scripts/up.sh)"
    echo -n "registry:  "; curl -s -o /dev/null -m 2 -w '%{http_code}\n' localhost:12121/v0/ping || echo "DOWN (scripts/registry-up.sh)"
    echo -n "headroom:  "; curl -s -o /dev/null -m 2 -w '%{http_code}\n' localhost:8787/health || echo "DOWN (scripts/run-headroom.sh), only needed for demo 3"
    echo -n "flows:     "; curl -s -o /dev/null -m 2 -w '%{http_code}\n' -X POST localhost:3002/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' || echo "DOWN (scripts/up.sh)"
    ;;
  1)
    echo "Demo 1: the same one-line request, with more and more MCP servers connected."
    step agent --stage bare --task joke
    step agent --stage jokes --task joke
    step agent --stage github --task joke
    step agent --stage jira --task joke
    ;;
  2)
    echo "Demo 2: the agent starts with two registry tools and loads servers when the task needs them."
    step agent --stage registry --task joke
    step agent --stage registry --task github
    echo; echo "A task that needs all three servers is the case where this does not pay off:"
    step agent --stage registry --task release
    ;;
  3)
    echo "Demo 3: the same task with and without Headroom in front of the model (code mode keeps results small, search mode does not)."
    step agent --stage search --task release
    step agent --stage search --task release --headroom
    ;;
  4)
    echo "Demo 4: the three servers behind one endpoint, in four tool modes. Same task. CODE_HINT=1 tells the model to filter inside scripts."
    NOPAUSE=1 step env CODE_HINT=1 STAGES=standard,search,code,codeSearch TASK=release npm run -s compare
    ;;
  5)
    echo "Demo 5 (optional): an Arazzo workflow served as one MCP tool."
    step cat flows/release-brief.arazzo.yaml
    step agent --stage flows --task release
    ;;
  finale)
    echo "One demo: standard vs search vs codeSearch, on the task that needs all three servers. The standard row is the bloated baseline."
    NOPAUSE=1 step env CODE_HINT=1 STAGES=standard,search,codeSearch TASK=release npm run -s compare
    ;;
  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac

#!/usr/bin/env bash
# Stops what up.sh started. `down.sh quiet` stays silent.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$ROOT"/.run/*.pid; do
  [ -e "$f" ] || continue
  pid="$(cat "$f")"
  # npx starts a child, so stop the whole process group when we can
  kill "$pid" 2>/dev/null || true
  pkill -P "$pid" 2>/dev/null || true
  rm -f "$f"
done
# anything still holding our ports (a previous run that lost its pid file)
for port in 3000 8081 3002; do
  pid="$(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null || true)"
  [ -z "$pid" ] || kill $pid 2>/dev/null || true
done
[ "${1:-}" = quiet ] || echo "stopped"

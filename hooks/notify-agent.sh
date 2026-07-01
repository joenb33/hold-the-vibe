#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
PORT=17351

read_port_from_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  local parsed
  parsed="$(grep -o '"port"[[:space:]]*:[[:space:]]*[0-9]\+' "$file" 2>/dev/null | grep -o '[0-9]\+' | head -n 1 || true)"
  if [[ -n "$parsed" ]]; then
    PORT="$parsed"
    return 0
  fi
  return 1
}

read_port_from_file "${HOME}/.elevator-music/bridge.json" || \
  read_port_from_file "${HOME}/.copilot/elevator-music-bridge.json" || true

health() {
  curl -s -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1
}

post() {
  curl -s -m 2 -X POST "http://127.0.0.1:${PORT}$1" >/dev/null 2>&1
}

case "$ACTION" in
  start) TARGET="/activity/start" ;;
  stop) TARGET="/activity/stop" ;;
  stop-force) TARGET="/activity/stop?force=1" ;;
  *) exit 0 ;;
esac

if ! health; then
  sleep 0.25
  health || true
fi

if ! post "$TARGET"; then
  sleep 0.25
  post "$TARGET" || true
fi

exit 0

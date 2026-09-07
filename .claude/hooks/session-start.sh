#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm install
fi

if [ ! -x /usr/games/stockfish ] && ! command -v stockfish >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update -qq && apt-get install -y -qq stockfish
  else
    sudo apt-get update -qq && sudo apt-get install -y -qq stockfish
  fi
fi

# This sandbox terminates TLS with its own CA, which Node's fetch doesn't
# trust by default (curl picks it up from the shell env; Node doesn't).
# Scoped to this environment only via CLAUDE_ENV_FILE, never baked into
# package.json - a NODE_EXTRA_CA_CERTS pointing at a path that doesn't
# exist breaks TLS verification entirely on some platforms (confirmed on
# Windows) instead of falling back gracefully, so it must never ship to
# a real user's machine.
if [ -f /root/.ccr/ca-bundle.crt ]; then
  echo 'export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt' >> "$CLAUDE_ENV_FILE"
fi

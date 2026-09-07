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

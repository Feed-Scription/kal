#!/bin/bash

set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required"
  exit 1
fi

if [ -z "${PNPM_HOME:-}" ]; then
  case "$(uname -s)" in
    Darwin)
      export PNPM_HOME="$HOME/Library/pnpm"
      ;;
    Linux)
      export PNPM_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
      ;;
    *)
      pnpm setup
      echo "Please restart your shell and run: pnpm run link:global"
      exit 1
      ;;
  esac
fi

mkdir -p "$PNPM_HOME"
export PATH="$PNPM_HOME:$PATH"

pnpm --dir apps/engine link --global

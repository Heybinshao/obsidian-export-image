#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="$ROOT/fixtures/vault"
PLUGIN="$VAULT/.obsidian/plugins/obsidian-export-image"
mkdir -p "$PLUGIN"
cp "$ROOT/main.js" "$ROOT/manifest.json" "$ROOT/styles.css" "$PLUGIN/"
printf '[\n  "obsidian-export-image"\n]\n' > "$VAULT/.obsidian/community-plugins.json"
echo "installed into $PLUGIN"

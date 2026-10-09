#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/com.ulanzi.opnsense.ulanziPlugin"
DEST="$HOME/Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.ulanzi.opnsense.ulanziPlugin"

if [[ ! -f "$SRC/local-config.json" ]]; then
  echo "Hinweis: $SRC/local-config.json fehlt."
  echo "Kopiere local-config.example.json → local-config.json und trage API-Key/Secret ein."
fi

if [[ ! -f "$SRC/dist/app.js" ]]; then
  echo "Building plugin..."
  (cd "$SRC" && npm install && npm run build)
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
mkdir -p "$DEST"

rsync -a \
  --exclude node_modules \
  --exclude .git \
  --exclude '*.map' \
  "$SRC/" "$DEST/"

echo "Installed to: $DEST"
echo "Bitte Ulanzi Studio neu starten, dann Action 'WAN Traffic' auf eine Taste ziehen."

#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/com.ulanzi.sabnzbd.ulanziPlugin"
DEST="$HOME/Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.ulanzi.sabnzbd.ulanziPlugin"

if [[ ! -f "$SRC/dist/app.js" ]]; then
  echo "Building plugin..."
  (cd "$SRC" && npm install && npm run build)
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
mkdir -p "$DEST"

# Copy runtime files only (skip node_modules / source map clutter)
rsync -a \
  --exclude node_modules \
  --exclude .git \
  --exclude '*.map' \
  "$SRC/" "$DEST/"

echo "Installed to: $DEST"
echo "Bitte Ulanzi Studio neu starten, dann Action 'Download Status' auf eine Taste ziehen."

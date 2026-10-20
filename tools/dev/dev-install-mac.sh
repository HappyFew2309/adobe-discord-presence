#!/bin/bash
# macOS DEVELOPER install (unsigned): bash tools/dev/dev-install-mac.sh
set -e
ID="com.happyfew.discordpresence"
SRC="$(cd "$(dirname "$0")/../.." && pwd)/extension"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/$ID"
for v in 9 10 11 12 13 14; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed to $DEST — restart Premiere Pro / After Effects, then Window > Extensions > Discord Presence."

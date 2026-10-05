#!/bin/sh
# Copies the widgets, visualizers and skin into the MOLTamp folder; restart MOLTamp afterwards.
set -e
cd "$(dirname "$0")"
DEST="${MOLTAMP_HOME:-$HOME/Moltamp}"
if [ ! -d "$DEST" ]; then
  echo "MOLTamp folder not found: $DEST (launch MOLTamp once, or set MOLTAMP_HOME)" >&2
  exit 1
fi
mkdir -p "$DEST/widgets" "$DEST/visualizers" "$DEST/skins"
cp -R widgets/. "$DEST/widgets/"
cp -R visualizers/. "$DEST/visualizers/"
cp -R skins/. "$DEST/skins/"
echo "Installed $(ls widgets | wc -l | tr -d ' ') widgets, $(ls visualizers | wc -l | tr -d ' ') visualizers and $(ls skins | wc -l | tr -d ' ') skins into $DEST."
echo "Restart MOLTamp: widgets are in Settings > Tabs, visualizers in the Visualizer gear menu, skins in Skins."

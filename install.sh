#!/bin/sh
# Copies the widgets and visualizers into the MOLTamp folder; restart MOLTamp afterwards.
set -e
cd "$(dirname "$0")"
DEST="${MOLTAMP_HOME:-$HOME/Moltamp}"
if [ ! -d "$DEST" ]; then
  echo "MOLTamp folder not found: $DEST (launch MOLTamp once, or set MOLTAMP_HOME)" >&2
  exit 1
fi
mkdir -p "$DEST/widgets" "$DEST/visualizers"
cp -R widgets/. "$DEST/widgets/"
cp -R visualizers/. "$DEST/visualizers/"
echo "Installed $(ls widgets | wc -l | tr -d ' ') widgets and $(ls visualizers | wc -l | tr -d ' ') visualizers into $DEST."
echo "Restart MOLTamp: widgets are in Settings > Tabs (category Shaders), visualizers in the Visualizer gear menu."

#!/usr/bin/env bash
# Copies the static site into this module's static/site/ directory.
# The site in ../../website is the single source of truth; run this before
# packaging or deploying the module.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/../../website"
DEST="$HERE/static/site"

[ -d "$SRC" ] || { echo "Source site not found at $SRC" >&2; exit 1; }
rm -rf "$DEST"
mkdir -p "$DEST"
cp "$SRC"/*.html "$SRC"/robots.txt "$SRC"/sitemap.xml "$DEST"/ 2>/dev/null || cp "$SRC"/*.html "$DEST"/
cp -r "$SRC/assets" "$DEST/assets"
echo "Synced $(find "$DEST" -type f | wc -l) files into $DEST"

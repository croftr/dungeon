#!/usr/bin/env bash
# optimize-icons.sh
# Converts all PNGs in public/icons/ to WebP (128x128 max, quality 90).
# Then updates all .png references in src/data/**/*.json to .webp.
# Run from the dungeon-crawler project root.

set -euo pipefail

ICONS_DIR="public/icons"
DATA_DIR="src/data"

echo "=== Icon Optimization ==="
echo ""

# ── 1. Convert PNGs to WebP ──────────────────────────────────────────────────

total=0
converted=0
failed=0

while IFS= read -r -d '' png; do
  total=$((total + 1))
  webp="${png%.png}.webp"

  if ffmpeg -y -i "$png" \
      -vf "scale='min(128,iw)':'min(128,ih)':force_original_aspect_ratio=decrease" \
      -quality 90 \
      "$webp" \
      -loglevel error 2>/dev/null; then
    rm "$png"
    converted=$((converted + 1))
    echo "  ✓ $(basename "$png") → $(basename "$webp")"
  else
    echo "  ✗ FAILED: $png" >&2
    failed=$((failed + 1))
  fi
done < <(find "$ICONS_DIR" -name "*.png" -print0)

echo ""
echo "Images: $converted converted, $failed failed (of $total total)"
echo ""

# ── 2. Update JSON icon path references ──────────────────────────────────────

json_count=0
while IFS= read -r -d '' json; do
  if grep -q '\.png"' "$json" 2>/dev/null; then
    sed -i 's/\.png"/\.webp"/g' "$json"
    json_count=$((json_count + 1))
    echo "  Updated: $json"
  fi
done < <(find "$DATA_DIR" -name "*.json" -print0)

echo ""
echo "JSON files updated: $json_count"
echo ""
echo "Done."

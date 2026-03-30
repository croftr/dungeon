#!/usr/bin/env bash
# optimize-skills.sh
# Converts all PNGs in public/skills/ (including subdirectories) to WebP (128x128 max, quality 90).
# Then updates any remaining .png references in src/data/**/*.json and src/*.js to .webp.
# Run from the dungeon-crawler project root.

set -euo pipefail

SKILLS_DIR="public/skills"
DATA_DIR="src/data"

echo "=== Skill Image Optimization ==="
echo ""

# ── 1. Convert PNGs to WebP ──────────────────────────────────────────────────

total=0
converted=0
failed=0
saved_kb=0

while IFS= read -r -d '' png; do
  total=$((total + 1))
  dir=$(dirname "$png")
  base=$(basename "$png" .png)
  webp="$dir/$base.webp"
  old_size=$(stat -c%s "$png" 2>/dev/null || stat -f%z "$png" 2>/dev/null)

  if npx sharp-cli -i "$png" -o "$dir/" -f webp -q 90 -- resize 128 128 --fit inside --withoutEnlargement 2>/dev/null; then
    new_size=$(stat -c%s "$webp" 2>/dev/null || stat -f%z "$webp" 2>/dev/null)
    saved=$(( (old_size - new_size) / 1024 ))
    saved_kb=$((saved_kb + saved))
    rm "$png"
    converted=$((converted + 1))
    echo "  ✓ $(basename "$png") → $(basename "$webp")  (${saved}KB saved)"
  else
    echo "  ✗ FAILED: $png" >&2
    failed=$((failed + 1))
  fi
done < <(find "$SKILLS_DIR" -name "*.png" -print0)

echo ""
echo "Images: $converted converted, $failed failed (of $total total)"
echo "Total saved: ~${saved_kb}KB"
echo ""

# ── 2. Update JSON skill icon path references ────────────────────────────────

json_count=0
while IFS= read -r -d '' json; do
  if grep -q '/skills/.*\.png"' "$json" 2>/dev/null; then
    sed -i 's|/skills/\([^"]*\)\.png"|/skills/\1.webp"|g' "$json"
    json_count=$((json_count + 1))
    echo "  Updated: $json"
  fi
done < <(find "$DATA_DIR" -name "*.json" -print0)

# Also check src/*.js files for hardcoded .png skill paths
js_count=0
while IFS= read -r -d '' js; do
  if grep -q '/skills/.*\.png' "$js" 2>/dev/null; then
    sed -i "s|/skills/\([^'\"]*\)\.png|/skills/\1.webp|g" "$js"
    js_count=$((js_count + 1))
    echo "  Updated: $js"
  fi
done < <(find "src" -name "*.js" -print0)

echo ""
echo "JSON files updated: $json_count"
echo "JS files updated: $js_count"
echo ""
echo "Done."

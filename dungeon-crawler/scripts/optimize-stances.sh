#!/usr/bin/env bash
# Re-encodes stance videos: strips audio, CRF 26, faststart for CloudFront streaming.
# Overwrites originals in place (you have backups).

STANCE_DIR="$(dirname "$0")/../public/videos/stances"
CRF=26

echo "Optimizing stance videos in $STANCE_DIR"
echo ""

total_before=0
total_after=0

for src in "$STANCE_DIR"/*.mp4; do
  name=$(basename "$src")
  tmp="${src%.mp4}_opt.mp4"

  before=$(stat -c%s "$src" 2>/dev/null || stat -f%z "$src")

  ffmpeg -y -i "$src" \
    -an \
    -c:v libx264 \
    -crf $CRF \
    -preset slow \
    -pix_fmt yuv420p \
    -movflags +faststart \
    "$tmp" 2>/dev/null

  after=$(stat -c%s "$tmp" 2>/dev/null || stat -f%z "$tmp")
  saving=$(awk "BEGIN { printf \"%.0f\", (1 - $after / $before) * 100 }")

  mv "$tmp" "$src"

  before_kb=$((before / 1024))
  after_kb=$((after / 1024))
  echo "  $name: ${before_kb}KB -> ${after_kb}KB  (${saving}% smaller)"

  total_before=$((total_before + before))
  total_after=$((total_after + after))
done

total_before_mb=$(awk "BEGIN { printf \"%.1f\", $total_before / 1048576 }")
total_after_mb=$(awk "BEGIN { printf \"%.1f\", $total_after / 1048576 }")
total_saving=$(awk "BEGIN { printf \"%.0f\", (1 - $total_after / $total_before) * 100 }")

echo ""
echo "=================================================="
echo "Total: ${total_before_mb}MB -> ${total_after_mb}MB  (${total_saving}% smaller)"
echo "Done."

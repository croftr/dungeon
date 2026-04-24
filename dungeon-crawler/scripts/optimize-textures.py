#!/usr/bin/env python3
"""
Optimizes dungeon textures for WebGL + CloudFront delivery.

Changes made:
  - Backs up originals to public/textures/originals/
  - Resizes NPOT 2816x1536 textures → 2048x1024
  - Resizes arena-floor 4096x4096 → 2048x2048
  - Strips unused alpha channels (saves ~20% in WebP)
  - Converts everything to WebP at quality 85
"""

import os
import shutil
from pathlib import Path
from PIL import Image

TEXTURE_DIR = Path(__file__).parent.parent / "public" / "textures"
BACKUP_DIR = TEXTURE_DIR / "originals"
WEBP_QUALITY = 85

# Target sizes: (original_size) → (target_size)
RESIZE_MAP = {
    (2816, 1536): (2048, 1024),  # NPOT ceiling/wall textures
    (4096, 4096): (2048, 2048),  # arena-floor oversized
}

def has_real_alpha(img: Image.Image) -> bool:
    """Returns True if the alpha channel has any non-255 pixels."""
    if img.mode != "RGBA":
        return False
    r, g, b, a = img.split()
    return a.getextrema()[0] < 255

def process_texture(src: Path) -> tuple[int, int]:
    """Process one texture. Returns (original_bytes, new_bytes)."""
    original_bytes = src.stat().st_size

    img = Image.open(src)
    w, h = img.size

    # Resize if needed
    target = RESIZE_MAP.get((w, h))
    if target:
        print(f"  Resizing {w}x{h} -> {target[0]}x{target[1]}")
        img = img.resize(target, Image.LANCZOS)

    # Drop alpha if unused
    if img.mode == "RGBA" and not has_real_alpha(img):
        img = img.convert("RGB")
        print(f"  Dropped unused alpha channel")

    dest = TEXTURE_DIR / (src.stem + ".webp")
    img.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
    new_bytes = dest.stat().st_size
    return original_bytes, new_bytes

def main():
    BACKUP_DIR.mkdir(exist_ok=True)

    extensions = {".png", ".jpg", ".jpeg"}
    textures = [
        f for f in TEXTURE_DIR.iterdir()
        if f.suffix.lower() in extensions and f.is_file()
    ]

    if not textures:
        print("No textures found.")
        return

    total_before = 0
    total_after = 0

    print(f"Processing {len(textures)} textures...\n")

    for src in sorted(textures):
        print(f"{src.name}")

        # Back up original
        backup = BACKUP_DIR / src.name
        if not backup.exists():
            shutil.copy2(src, backup)

        before, after = process_texture(src)
        saving = (1 - after / before) * 100
        print(f"  {before/1024:.0f} KB -> {after/1024:.0f} KB  ({saving:.0f}% smaller)\n")

        total_before += before
        total_after += after

    total_saving = (1 - total_after / total_before) * 100
    print("=" * 50)
    print(f"Total: {total_before/1024/1024:.1f} MB -> {total_after/1024/1024:.1f} MB  ({total_saving:.0f}% smaller)")
    print(f"Originals backed up to: {BACKUP_DIR}")
    print("\nDone. Old .png/.jpg files still exist alongside the new .webp files.")
    print("Once you've verified the .webp files look correct in-game, delete the originals.")

if __name__ == "__main__":
    main()

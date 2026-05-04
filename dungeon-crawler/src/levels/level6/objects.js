import { CELL } from '../../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 6 – "The Whispering Forest" Outdoor Area
//  No monsters for now — just a return portal back to level 0.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel6Objects(ctx) {
    const { group, loader, addPortal } = ctx;

    // Return portal — open from the start, sends player back to level 0 (starter room).
    // Placed at col 3, row 7 (inside Room B, west side).
    // targetRow=13, targetCol=10 — lands the player near the Level 6 portal in level 0.
    addPortal(group, loader, 3, 7, 0, 0, 0, 0.85, 13, 10, 1);
}

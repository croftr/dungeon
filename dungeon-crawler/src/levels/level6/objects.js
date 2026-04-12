import { CELL } from '../../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 6 – "The Goblin Gate" Practice Level
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel6Objects(ctx) {
    const { group, loader, addPortcullis } = ctx;

    // West-side portcullis gate — already open, acts as the threshold into Level 1
    addPortcullis(group, loader, 2, 7, 0, true);
}

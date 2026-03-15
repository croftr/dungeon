// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 4 – The Forgotten Vault
//  Object/container/portal placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel4Objects(ctx) {
    const { group, loader, addPortal } = ctx;

    // ── Return portal ─────────────────────────────────────────────────────────
    // Placed just behind the player's entry point — leads back to Level 3.
    addPortal(group, loader, 5, 9, 3, Math.PI, 0, 0.85);
}

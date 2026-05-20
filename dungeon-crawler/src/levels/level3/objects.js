// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 3 – The Abyssal Crypts
//  Object/container/portal/gate placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel3Objects(ctx) {
    const {
        group, loader,
        addChest, addWeaponRack, addSpellCabinet, addPortalActivatorStatue,
        addPortal, addTrap1,
    } = ctx;

    // ── Portals ───────────────────────────────────────────────────────────────
    // Return portal to Level 0 — lands next to the Level 3 portal in the starter room, facing north
    addPortal(group, loader, 11, 21, 0, Math.PI, 0, 0.85, 13, 12, 0);

    // Exit portal (game end) at the far end of the exit corridor
    addPortal(group, loader, 20, 21, -1, Math.PI, 0, 0.85);

    // ── Weapon Rack ───────────────────────────────────────────────────────────
    // South-West room (row 19, col 1 against west wall)
    addWeaponRack(group, loader, 1, 19, -Math.PI / 2, -0.75, 0, [
        "Vampiric Dagger", "Silver Mace", "Warden's Shield"
    ]);

    // ── Spell Cabinet ─────────────────────────────────────────────────────────
    // North-East room (row 3, col 19)
    addSpellCabinet(group, loader, 19, 2, 0, 0.45, -1.0, [
        "Scroll of Sleep", "Trapper's Manual"
    ]);

    // ── Chests ────────────────────────────────────────────────────────────────
    // North-West room (row 2, col 3)
    addChest(group, loader, 3, 2, 0, -0.8, [
        "Rune Pendant",
        "Silver Bolts",
        'Poison Arrows',
        "Tracker's Medallion"
    ]);

    // South-East room (row 18, col 19)
    addChest(group, loader, 19, 18, 0, -0.8, [
        "Sun Pendant",
        "Greatsword",
        'Balance Pendant',
        "Crescent Moon Charm"
    ]);

    // Secret Room (row 6, col 15)
    addChest(group, loader, 15, 6, -Math.PI / 2, 0.7, [
        "Flame Axe",
        "Flame Dagger",
        "Flame Arrows"
    ]);

    // Against the east wall of start chamber (row 21, col 12)
    addChest(group, loader, 12, 21, -Math.PI / 2, 0.3, [
        "Schematic Key", "Trapper's Manual"
    ], undefined, true, 0.5);

    // ── Portal Activator Eggs ───────────────────────────────────────────────────────────
    // Minotaur room centre — contains Blue Crystal
    addPortalActivatorStatue(group, loader, 9, 11, 0, 0.45, ['Blue Crystal']);

    // End of elemental corridor (col 18, row 10) — contains Red Crystal
    addPortalActivatorStatue(group, loader, 18, 10, 0, 0.45, ['Red Crystal']);

    // ── Trap ──────────────────────────────────────────────────────────────────
    // Guards the entry corridor to the central minotaur room
    addTrap1(group, loader, 16, 10);
}

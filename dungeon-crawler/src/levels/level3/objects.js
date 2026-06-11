// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 3 – The Abyssal Crypts
//  Object/container/portal/gate placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

import { asset } from '../../assets.js';

export function spawnLevel3Objects(ctx) {
    const {
        group, loader,
        addChest, addTreasurePile, addWeaponRack, addSpellCabinet, addPortalActivatorStatue,
        addPortal, addTrap1, addDroppedTorch, addInteractiveCauldron,
    } = ctx;

    // ── Portals ───────────────────────────────────────────────────────────────
    // Return portal to Level 0 — lands next to the Level 3 portal in the starter room, facing north
    addPortal(group, loader, 11, 27, 0, Math.PI, 0, 0.85, 13, 12, 0);

    // Exit portal (game end) at the far end of the exit corridor
    addPortal(group, loader, 20, 27, -1, Math.PI, 0, 0.85);

    // ── Weapon Rack ───────────────────────────────────────────────────────────
    // South-West room (row 25, col 1 against west wall)
    addWeaponRack(group, loader, 1, 25, -Math.PI / 2, -0.75, 0, [
        "Vampiric Dagger", "Silver Mace", "Warden's Shield"
    ]);

    // ── Spell Cabinet ─────────────────────────────────────────────────────────
    // North-East room (row 8, col 19)
    addSpellCabinet(group, loader, 19, 8, 0, 0.45, -1.0, [
        "Scroll of Sleep", "Trapper's Manual", "Ancient Bog Core"
    ]);

    // ── Chests ────────────────────────────────────────────────────────────────
    // The 4 Ancient Bog Core needed to feed the swamp-room cauldron are scattered
    // across the level (spell cabinet + the 3 chests below, one each), mirroring how
    // Level 2 distributes its Ancient Tree Sap. Collect all 4 to open the cauldron's
    // hidden treasure room. (None are placed inside that room — it can't be opened
    // without the cores, so a core locked inside would be a dead end.)

    // South-East room (row 24, col 19)
    addChest(group, loader, 19, 24, 0, -0.8, [
        "Sun Pendant",
        "Greatsword",
        "Crescent Moon Charm",
        "Chain Cloak",
        "Ancient Bog Core"
    ]);

    // Secret Room (row 12, col 15)
    addChest(group, loader, 15, 12, -Math.PI / 2, 0.7, [
        "Flame Axe",
        "Flame Dagger",
        "Flame Arrows",
        "Flame Staff",
        "Flame Bolts",
        "Flame Greataxe",
        "Ancient Bog Core"
    ]);

    // Against the east wall of start chamber (row 27, col 12)
    addChest(group, loader, 12, 27, -Math.PI / 2, 0.3, [
        "Ancient Bog Core"
    ], undefined, true, 0.5);

    // ── Portal Activator Eggs ───────────────────────────────────────────────────────────
    // Minotaur room centre — contains Blue Crystal
    addPortalActivatorStatue(group, loader, 9, 17, 0, 0.45, ['Blue Crystal']);

    // End of elemental corridor (col 18, row 16) — contains Red Crystal
    addPortalActivatorStatue(group, loader, 18, 16, 0, 0.45, ['Red Crystal']);

    // ── Swamp-room cauldron (far NE corner) ───────────────────────────────────
    // Mirrors the Level 2 west-annex cauldron. An alcove is recessed into the east
    // wall of the swamp room (col 19, rows 2-4). Two torches flank an interactive
    // cauldron at the alcove's centre (interaction cell (3,19)). Feeding it 4
    // Ancient Bog Core opens the rear-wall grid at (3,20), revealing the east
    // passage (row 3, cols 21-22) into the treasure room (rows 2-4, cols 23-25).
    // See the isCauldron handler in objects.js (cauldronLevel = 3).
    addDroppedTorch(group, loader, 19, 2, -Math.PI / 2, 0.6, 0);
    addDroppedTorch(group, loader, 19, 4, -Math.PI / 2, 0.6, 0);
    addInteractiveCauldron(group, loader, 19, 3, Math.PI, 0.5, -0.1, 0, 0, 3, 19, 3);

    // Treasure room revealed behind the cauldron passage (rows 2-4, cols 23-25).
    // Chest + treasure pile sit against the north wall (row 1), nudged apart. This
    // is the chest relocated out of the swamp room — it now rewards solving the
    // cauldron puzzle rather than sitting in plain sight.
    addChest(group, loader, 24, 2, 0, -0.6, [
        "Silver Bolts",
        'Poison Arrows',
        "Plate Cloak",
        "Schematic Key"
    ], asset('/items/containers/dark-red-chest.glb'), true, -0.45);
    addTreasurePile(group, loader, 24, 2, 0, -0.6, [
        "Balance Pendant",
        "Rune Pendant",
        "Tracker's Medallion",
        { name: 'Gold Coins', quantity: 200 }
    ], 0.45);

    // ── Trap ──────────────────────────────────────────────────────────────────
    // Guards the entry corridor to the central minotaur room
    addTrap1(group, loader, 22, 10);
}

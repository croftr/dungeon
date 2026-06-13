import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 4 – The Forgotten Vault
//  Object/container/portal placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel4Objects(ctx) {
    const {
        group, loader,
        addPortal, addTrap1, addChest, addCustomNPC, addSpellCabinet,
        addWeaponRack, addDroppedTorch, addInteractiveCauldron,
    } = ctx;

    // ── Blue Portal ───────────────────────────────────────────────────────────
    // South area of the entry room (col 10, row 15).
    // Transports party to level 0 (col 11, row 13), facing north.
    addPortal(group, loader, 10, 15, 0, 0, 0, 0.4, 13, 11, 0);

    // ── Otter NPC ─────────────────────────────────────────────────────────────
    // Stands next to the blue portal.
    addCustomNPC(group, loader, 9, 15, '/npcs/otter/Meshy_AI_Animation_Idle_withSkin.glb', null, 0.55, -Math.PI / 2, 0, 0, null, 2, '/npcs/otter/post-minotaur.mp3', '/npcs/otter/talking.glb', '/npcs/otter/post-mino-bark.mp3');

    // ── Trap ──────────────────────────────────────────────────────────────────
    // Centre of the narrow passage — guards the route to the vault.
    addTrap1(group, loader, 10, 7);

    // ── Chests ────────────────────────────────────────────────────────────────
    // The 4 Ancient Demon Blood needed to feed the demon-room cauldron are scattered
    // across the level (the chests + spell cabinet below, one each), mirroring how
    // Levels 2/3 distribute their offering item. Collect all 4 to open the cauldron's
    // hidden reward room. (None are placed inside that room — it can't be opened
    // without the bloods, so one locked inside would be a dead end.)

    // North-east corner of the vault room — contains Aether-Glass Silt.
    addChest(group, loader, 13, 3, 0, -0.8, ['Aether-Glass Silt', "Trapper's Manual", "Trapper's Manual", "Ancient Demon Blood"]);

    // West boss room (Lizard Man lair) — against the north wall.
    addChest(group, loader, 5, 17, 0, -0.8, ["Ancient Demon Blood", "Crescent Moon Charm"]);

    // East room — against the north wall.
    addChest(group, loader, 22, 3, 0, -0.8, ["Ancient Demon Blood"]);

    // ── Spell Cabinet ─────────────────────────────────────────────────────────
    // In the Demon Ogre room (vault guardian lair), against the East wall
    addSpellCabinet(group, loader, 32, 5, -Math.PI / 2, 0.7, 0, [
        "Scroll of Holybolt", "Scroll of Darkbolt", "Ancient Demon Blood"
    ]);

    // ── Decorations ───────────────────────────────────────────────────────────
    if (ctx.addDecoration) {
        // Skull column in the demon's alcove.
        ctx.addDecoration(group, loader, 19, 7, 0, '/items/skull-column.glb', 0.65, true, 0.5, 0.5, 0);

        // Torture statue — north-west corner of the vault room.
        ctx.addDecoration(group, loader, 6, 3, Math.PI / 3, '/items/torture-statue.glb', 0.65, true, -0.3, -0.3, 0);
    }

    // ── Demon-room cauldron (alcove off the Demon Ogre room's south wall) ──────
    // Mirrors the Level 2/3 cauldrons. An alcove is recessed into the south wall
    // (row 10, cols 29-31). Two torches flank an interactive cauldron at its centre
    // (interaction cell (10,30)). Feeding it 4 Ancient Demon Blood opens the
    // rear-wall grid at (11,30), revealing a south passage (col 30, rows 12-13)
    // into the reward room (rows 14-16, cols 29-31). See the isCauldron handler in
    // objects.js (cauldronLevel = 4).
    addDroppedTorch(group, loader, 29, 10, 0, 0, 0.6);
    addDroppedTorch(group, loader, 31, 10, 0, 0, 0.6);
    addInteractiveCauldron(group, loader, 30, 10, 0, 0.5, 0, -0.1, 0, 10, 30, 4);

    // Reward room weapon rack against the east wall (col 32), revealed behind the
    // cauldron passage.
    addWeaponRack(group, loader, 31, 15, Math.PI / 2, 0.75, 0, [
        "Holy Dagger", "Holy Arrows", "Holy Bolts",
        "Dark Dagger", "Dark Arrows", "Dark Bolts"
    ]);
}

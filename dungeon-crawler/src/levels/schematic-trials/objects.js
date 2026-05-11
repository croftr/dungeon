// ─────────────────────────────────────────────────────────────────────────────
//  SCHEMATIC TRIALS  — side zone reached via portal in Level 2 giant room.
//
//  Layout: central hub (row 6, col 7) with four alcoves N/S/W/E. Each alcove
//  holds the reward chest for one of the four merchant schematic quests.
//  Chest contents persist via the normal _containerContentsPersistence
//  mechanism, so once a schematic is claimed it stays claimed — the player
//  cannot farm the same trial twice.
//
//  Everything in this zone is spawned fresh on entry and torn down on exit by
//  the standard clearObjects() pass, so it adds zero load to Level 2.
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEMATIC_TRIALS_RETURN = { row: 18, col: 4, facing: 1 }; // east-facing, one cell west of the entry portal in the treeman room

export function spawnSchematicTrialsObjects(ctx) {
    const { group, loader, addChest, addPortal, addPortcullis, addKeyhole } = ctx;

    // ── Four locked gates, one outside each alcove ────────────────────────────
    // Each portcullis consumes one Schematic Key. The party starts with four
    // keys, so they can open every gate — but each gate is one-shot, so they
    // must choose the order. Keyholes share the portcullis cell; the hub-side
    // offset just places the lock model on the side facing the player.

    // North alcove gate (Savage) — corridor col 7, row 4
    addPortcullis(group, loader, 7, 4, 0);
    addKeyhole(group, loader, 7, 4, 0, 0.7, 0.7, null, null, 'Schematic Key');

    // South alcove gate (Steel) — corridor col 7, row 9
    addPortcullis(group, loader, 7, 9, 0);
    addKeyhole(group, loader, 7, 9, Math.PI, -0.7, -0.7, null, null, 'Schematic Key');

    // West alcove gate (Savage Tracker) — corridor col 4, row 6
    addPortcullis(group, loader, 4, 6, Math.PI / 2);
    addKeyhole(group, loader, 4, 6, -Math.PI / 2, 0.7, 0.7, null, null, 'Schematic Key');

    // East alcove gate (Wizard) — corridor col 10, row 6
    addPortcullis(group, loader, 10, 6, Math.PI / 2);
    addKeyhole(group, loader, 10, 6, Math.PI / 2, -0.7, -0.7, null, null, 'Schematic Key');

    // ── Return portal at the centre of the hub ────────────────────────────────
    // Sends the party back to Level 2, placing them just west of the entry
    // portal in the giant room (col 17, row 18, facing east).
    addPortal(
        group, loader,
        7, 6, 2,                                 // col, row, targetLevel
        0, 0, 0,                                 // rotY, offsetX, offsetZ
        SCHEMATIC_TRIALS_RETURN.row,
        SCHEMATIC_TRIALS_RETURN.col,
        SCHEMATIC_TRIALS_RETURN.facing
    );

    // ── Four reward chests, one per alcove ────────────────────────────────────
    // North alcove — Savage Fury (orc tribal armour)
    addChest(group, loader, 7, 1, Math.PI, 0.7, [
        "Savage Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);

    // South alcove — Steel Vanguard (heavy plate)
    addChest(group, loader, 7, 12, 0, -0.7, [
        "Steel Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);

    // West alcove — Tracker's Guise (ranger leather)
    addChest(group, loader, 1, 6, Math.PI / 2, -0.7, [
        "Trackers Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);

    // East alcove — Wizard's Regalia (mage robes)
    addChest(group, loader, 13, 6, -Math.PI / 2, 0.7, [
        "Wizard Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);
}

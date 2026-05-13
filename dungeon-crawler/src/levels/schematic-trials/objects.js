import { addSwirlPortal } from '../swirl-portal.js';

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEMATIC TRIALS  — side zone reached via swirl portal in Level 1 SW corner.
//
//  Layout: central hub (row 6, col 7) with four alcoves N/S/W/E. Each alcove
//  holds the reward chest for one of the four merchant schematic quests.
//  Chest contents persist via the normal _containerContentsPersistence
//  mechanism, so once a schematic is claimed it stays claimed — the player
//  cannot farm the same trial twice.
//
//  Everything in this zone is spawned fresh on entry and torn down on exit by
//  the standard clearObjects() pass, so it adds zero load to Level 1.
// ─────────────────────────────────────────────────────────────────────────────

// Where the party lands when they leave the trials — the cell just north of
// the Level 1 entry swirl, facing south so the portal is visible.
export const SCHEMATIC_TRIALS_RETURN = { level: 1, row: 21, col: 1, facing: 2 };

export function spawnSchematicTrialsObjects(ctx) {
    const { group, loader, addChest, addPortcullis, addKeyhole, interactables, openedTrialGates } = ctx;

    // ── Four locked gates, one outside each alcove ────────────────────────────
    // Each portcullis consumes one Schematic Key. The party starts with four
    // keys, so they can open every gate — but each gate is one-shot, so they
    // must choose the order. Keyholes sit on a side wall of the approach
    // corridor, mounted flush against the wall and facing the player.
    // Gates that were opened in a previous visit (or in a previous session
    // that has since been saved + reloaded) spawn already-open.
    const wasOpened = (col, row) => openedTrialGates?.has(`${col},${row}`);

    // North alcove gate (Savage) — portcullis at (col 7, row 4).
    // Keyhole on west wall of corridor cell (col 7, row 5), facing east.
    addPortcullis(group, loader, 7, 4, 0, wasOpened(7, 4));
    addKeyhole(group, loader, 7, 5, Math.PI / 2, -0.85, 0, 4, 7, 'Schematic Key');

    // South alcove gate (Steel) — portcullis at (col 7, row 9).
    // Keyhole on west wall of corridor cell (col 7, row 8), facing east.
    addPortcullis(group, loader, 7, 9, 0, wasOpened(7, 9));
    addKeyhole(group, loader, 7, 8, Math.PI / 2, -0.85, 0, 9, 7, 'Schematic Key');

    // West alcove gate (Trackers) — portcullis at (col 4, row 6).
    // Keyhole on north wall of corridor cell (col 5, row 6), facing south.
    addPortcullis(group, loader, 4, 6, Math.PI / 2, wasOpened(4, 6));
    addKeyhole(group, loader, 5, 6, 0, 0, -0.85, 6, 4, 'Schematic Key');

    // East alcove gate (Wizard) — portcullis at (col 10, row 6).
    // Keyhole on north wall of corridor cell (col 9, row 6), facing south.
    addPortcullis(group, loader, 10, 6, Math.PI / 2, wasOpened(10, 6));
    addKeyhole(group, loader, 9, 6, 0, 0, -0.85, 6, 10, 'Schematic Key');

    // ── Return swirl at the centre of the hub ─────────────────────────────────
    // Sends the party back to the Level 1 entry swirl in the SW corner.
    addSwirlPortal(group, interactables, 7, 6,
        SCHEMATIC_TRIALS_RETURN.level,
        SCHEMATIC_TRIALS_RETURN.row,
        SCHEMATIC_TRIALS_RETURN.col,
        SCHEMATIC_TRIALS_RETURN.facing);

    // ── Four reward chests, one per alcove ────────────────────────────────────
    // North alcove — Savage Fury (orc tribal armour)
    addChest(group, loader, 7, 1, 0, -0.7, [
        "Savage Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);

    // South alcove — Steel Vanguard (heavy plate)
    addChest(group, loader, 7, 12, Math.PI, 0.7, [
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

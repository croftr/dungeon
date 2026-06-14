// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 3 – The Abyssal Crypts
//  Object/container/portal/gate placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

import { asset } from '../../assets.js';
import { CELL, FLAME_ZONE_LEVEL, ICE_ZONE_LEVEL } from '../../map.js';
import { addSwirlPortal } from '../swirl-portal.js';
import { FLAME_ZONE_ARRIVAL } from '../flame-zone/map.js';
import { ICE_ZONE_ARRIVAL } from '../ice-zone/map.js';

export function spawnLevel3Objects(ctx) {
    const {
        group, loader,
        addChest, addTreasurePile, addWeaponRack, addSpellCabinet, addPortalActivatorStatue,
        addPortal, addTrap1, addDroppedTorch, addInteractiveCauldron,
        createWallButton, level3FlameAlcoveOpened, level3IceAlcoveOpened, interactables,
    } = ctx;

    // ── Portals ───────────────────────────────────────────────────────────────
    // Return portal to Level 0 — lands next to the Level 3 portal in the starter room, facing north
    addPortal(group, loader, 11, 27, 0, Math.PI, 0, 0.85, 13, 12, 0);

    // Exit portal (game end) at the far end of the exit corridor
    addPortal(group, loader, 20, 27, -1, Math.PI, 0, 0.85);

    // ── Weapon Rack ───────────────────────────────────────────────────────────
    // South-West room (row 25, col 1 against west wall)
    addWeaponRack(group, loader, 1, 25, -Math.PI / 2, -0.75, 0, [
        "Vampiric Dagger", "Silver Mace"
    ]);

    // ── Spell Cabinet ─────────────────────────────────────────────────────────
    // North-East room (row 8, col 19)
    addSpellCabinet(group, loader, 19, 8, 0, 0.45, -1.0, [
        "Scroll of Sleep", "Trapper's Manual"
    ]);

    // ── Chests ────────────────────────────────────────────────────────────────
    // The 4 Ancient Bog Core needed to feed the swamp-room cauldron are scattered
    // across the level (spell cabinet + the 3 chests below, one each), mirroring how
    // Level 2 distributes its Ancient Tree Sap. Collect all 4 to open the cauldron's
    // hidden treasure room. (None are placed inside that room — it can't be opened
    // without the cores, so a core locked inside would be a dead end.)

    // South-East room (row 24, col 19)
    addChest(group, loader, 19, 24, 0, -0.8, [
        "Greatsword",
        "Chain Cloak",
    ]);

    // Water Room with crocodles (row 12, col 15)
    addChest(group, loader, 15, 12, -Math.PI / 2, 0.7, [
        "Water Dagger",
        "Scroll of Waterbolt",
    ]);

    // ── Portal Activator Eggs ───────────────────────────────────────────────────────────
    // Inside the hidden NE cauldron passage treasure room — contains Blue Crystal
    addPortalActivatorStatue(group, loader, 24, 4, 0, 0.45, ['Blue Crystal']);

    // Across the east crystal bridge, centre of the far room (col 24, row 16) —
    // contains Red Crystal. Reached by crossing the bridge from the shrine's end.
    addPortalActivatorStatue(group, loader, 24, 16, 0, 0.45, ['Red Crystal']);

    // Weapon rack next to the egg, against the east wall (col 25, row 16), facing
    // west into the room — holds a Warden's Shield.
    addWeaponRack(group, loader, 25, 16, Math.PI / 2, 0.75, 0, [
        "Warden's Shield"
    ]);

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

    // ── Hidden flame alcove (bottom corridor) ──────────────────────────────────
    // The east tip of the bottom corridor at (25,20) is sealed as a normal-looking
    // wall (level3Map). A button on its west face lets the player at (25,19) facing
    // east sink the wall (same animation + sound as the cauldron demon-walls),
    // revealing a 1-cell alcove with flame-wall faces. Skip the button once opened
    // so it doesn't respawn floating in the open passage after a save/reload.
    if (!level3FlameAlcoveOpened) {
        const { group: flameAlcoveBtn, btn: flameAlcoveHit } = createWallButton(-1, { target: 'flame_alcove' });
        flameAlcoveBtn.position.set(20 * CELL - 1.0, 1.25, 25 * CELL);
        flameAlcoveHit.userData.buttonGroup = flameAlcoveBtn;
        group.add(flameAlcoveBtn);
    } else {
        // Alcove already opened in a prior visit / save — the wall is gone, so
        // spawn the blue swirl portal that warps the party to the Flame Zone.
        // (When it's opened live by the button press, objects.js spawns this.)
        addSwirlPortal(group, interactables, 20, 25, FLAME_ZONE_LEVEL,
            FLAME_ZONE_ARRIVAL.row, FLAME_ZONE_ARRIVAL.col, FLAME_ZONE_ARRIVAL.facing, { variant: 'red' });
    }

    // ── Hidden ice alcove (east corridor) ──────────────────────────────────────
    // (19,19) is sealed (already a wall in level3Map). A button on its west face
    // lets the player at (19,18) facing east sink the wall, revealing a 1-cell
    // alcove with ice-wall faces + a white swirl portal to the Ice Zone. Quite
    // close to the flame alcove. Skip the button once opened.
    if (!level3IceAlcoveOpened) {
        const { group: iceAlcoveBtn, btn: iceAlcoveHit } = createWallButton(-1, { target: 'ice_alcove' });
        iceAlcoveBtn.position.set(19 * CELL - 1.0, 1.25, 19 * CELL);
        iceAlcoveHit.userData.buttonGroup = iceAlcoveBtn;
        group.add(iceAlcoveBtn);
    } else {
        // Alcove already opened — spawn the white swirl portal to the Ice Zone.
        addSwirlPortal(group, interactables, 19, 19, ICE_ZONE_LEVEL,
            ICE_ZONE_ARRIVAL.row, ICE_ZONE_ARRIVAL.col, ICE_ZONE_ARRIVAL.facing, { variant: 'ice' });
    }
}

import { CELL, CROW_REALM_LEVEL } from '../../map.js';
import { asset } from '../../assets.js';
import { addMistPortal } from '../mist-portal.js';
import { CROW_ENTRY } from '../crow-realm/map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 2 – The Deep Passage
//  Object/container/portal/gate placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel2Objects(ctx) {
    const {
        group, loader,
        addChest, addStairs, addTrap1,
        addPortal, addPortcullis, addKeyhole,
        addSpellCabinet, addWeaponRack, addPortalActivatorStatue,
        createWallButton, addCustomNPC,
        addDroppedTorch, addDecoration, addInteractiveCauldron,
        level2PortcullisOpened,
        level2GiantPortcullisOpened,
        level2WardenGateOpened,
        stanceNpcDeparted,
        setStanceNpcDeparted,
        interactables,
    } = ctx;


    // ── Portal back to Level 0 ────────────────────────────────────────────────
    // Shifted from col 2 to col 12
    addPortal(group, loader, 12, 1, 0, Math.PI / 2, -0.85, 0, 13, 13, 0);

    // ── New passage: Portcullis & Wall Button ─────────────────────────────────
    // Closed portcullis at col 6, row 4 in the divided room (cols 3-5 and 7-9 separated by col 6)
    addPortcullis(group, loader, 6, 4, Math.PI / 2, level2WardenGateOpened);

    // Bear trap in the chest room — springs when the wardens come alive
    if (!level2WardenGateOpened) addTrap1(group, loader, 4, 5);

    // Button to open the gate, placed on the south face of the north wall of the anteroom at col 8, row 2
    const { group: gateBtn } = createWallButton(+1, {
        portcullisRow: 4,
        portcullisCol: 6,
        wallRow: 2,
        wallCol: 8,
        animAxis: 'z',
        animDir: +1
    }, 'z');
    gateBtn.position.set(8 * CELL, 1.25, 2 * CELL + 1.0);
    group.add(gateBtn);

    // ── Spell Cabinets ────────────────────────────────────────────────────────
    // Shifted from col 5, row 3 to col 15, row 3
    addSpellCabinet(group, loader, 15, 3, 0, 0, -0.7, ["Scroll of Resist Ice", "Scroll of Resist Fire", "Trapper's Manual"]);
    // Shifted from col 2, row 8 to col 12, row 8
    addSpellCabinet(group, loader, 12, 8, Math.PI / 2, -0.7, 0, ['Scroll of Lightningbolt', 'Scroll of Fireball']);

    // ── Chests ────────────────────────────────────────────────────────────────
    // Chest behind the Warden gate (col 3, row 4)
    addChest(group, loader, 3, 4, Math.PI / 2, 0.7, [
        "Schematic Key",
        "Ice Axe",
        "Ice Dagger",
        "Ice Greataxe",
        "Ice Arrows",
        "Ice Staff",
        "Trapper's Manual"
    ]);

    // Shifted from col 9, row 13 to col 19, row 13
    addChest(group, loader, 19, 13, Math.PI, 0.7, [
        'Poison Dagger', 'Life Orb',
        "Three Eyed Familiar",
        { name: 'Gold Coins', quantity: 30 }
    ]);

    // Ice gauntlet reward chest (shifted from col 3, row 14 to col 13, row 14)
    addChest(group, loader, 13, 14, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 150 },
        "Hoarfrost Mantle",
        "Padded Vest",
        "Testament of Faith",
        "Schematic Key"
    ]);

    // ── Portcullises & Keys ───────────────────────────────────────────────────
    // Locked portcullis at the passage entrance (shifted from col 7, row 23 to col 17, row 23)
    addPortcullis(group, loader, 17, 23, 0, level2PortcullisOpened);

    // Keyhole next to the main-entrance portcullis (shifted from col 7, row 23 to col 17, row 23)
    addKeyhole(group, loader, 17, 23, Math.PI / 2, -0.85, -2.0);

    // Portcullis on the WEST wall of the demon room (shifted from col 2, row 32 to col 12, row 32)
    addPortcullis(group, loader, 12, 32, Math.PI / 2);

    // Button on the EAST face of col-12 wall, one row south of the portcullis
    const { group: demonBtn } = createWallButton(+1, { target: 'demon_room' });
    demonBtn.position.set(12 * CELL + 1.0, 1.25, 33 * CELL);
    group.add(demonBtn);

    // ── Giant Room ────────────────────────────────────────────────────────────
    // Bone-key portcullis (shifted from col 9, row 30 to col 19, row 30)
    addPortcullis(group, loader, 19, 30, Math.PI / 2, level2GiantPortcullisOpened);

    // Keyhole on the west face of the portcullis (shifted col 9 -> 19, targetCol 9 -> 19)
    addKeyhole(group, loader, 19, 30, -Math.PI / 2, -1.1, -1.3, 30, 19, 'Bone Key');

    // ── Chests ────────────────────────────────────────────────────────────────
    // Two chests in the chest vault (shifted col 0.7 / 1.3 -> 10.7 / 11.3)
    addChest(group, loader, 10.7, 34, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 20 },
        "Trapper's Manual", 'Scroll of Incinerate',
        "Talisman of the Wind"
    ]);
    addChest(group, loader, 11.3, 34, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 10 },
        'Ring of Strength', 'Ring of Balance',
        "Bulwark of the Ancestors"
    ]);

    // Ethereal Egg in the centre of the demon room (shifted col 5 -> 15)
    addPortalActivatorStatue(group, loader, 15, 31, 0, 0.45, ['Red Crystal']);

    // Chest at col 38 north side (shifted from col 28 -> 38)
    addChest(group, loader, 38, 32, -Math.PI / 2, -0.5, [
        { name: 'Gold Coins', quantity: 50 },
        'Mana Potion',
        "Bloodstone Amulet", "Schematic Key"
    ], asset('/items/chest1.glb'), true, 0.5);

    // Ethereal Egg at col 38 south side (shifted from col 28 -> 38)
    addPortalActivatorStatue(group, loader, 38, 32, Math.PI / 2, 0.45, ['Blue Crystal'], 0, 0.5);

    // Chest in the NE corner of the giant room (shifted from col 24 -> 34)
    addChest(group, loader, 34, 17, -Math.PI / 2, 0.7, [
        { name: 'Gold Coins', quantity: 50 },
        'Starlight Nectar'
    ], asset('/items/chest1.glb'), true, -0.5);

    // ── Pit back-passage chest rooms ──────────────────────────────────────────
    // Behind the pit landing (party lands at row 37, col 13 facing south), the back
    // wall now opens into a long corridor (row 36, cols 13-32). Two stubs branch
    // south into small chest rooms. Both chests are EMPTY for now — TODO: add loot.
    // Room A — rows 38-40, cols 22-24 (branch off the corridor at col 23)
    addChest(group, loader, 23, 40, Math.PI, 0.7, [
        "Ancient Tree Sap", "Ice Bolts"
    ], asset('/items/green-chest.glb'));
    // Room B — rows 38-40, cols 29-31 (branch off the corridor at col 30)
    addChest(group, loader, 30, 40, Math.PI, 0.7, [
        "Ancient Tree Sap", " Water Bolts"
    ], asset('/items/green-chest.glb'));

    // ── Stairs ────────────────────────────────────────────────────────────────
    // Shifted from col 3, row 41 to col 13, row 41
    addStairs(group, loader, 13, 41, Math.PI, { x: 1.25, y: 0.7, z: 0.7 }, 0, 0.25);

    // ── Buttons ───────────────────────────────────────────────────────────────
    // Button to close the hole (shifted from col 25 -> 35, gridCol 28 -> 38)
    const { group: closeHoleBtn } = createWallButton(+1, { target: 'close_hole', gridRow: 31, gridCol: 38 });
    closeHoleBtn.position.set(35 * CELL, 1.25, 31 * CELL + 1.0);
    closeHoleBtn.rotation.y = -Math.PI / 2;
    group.add(closeHoleBtn);

    // ── Traps ─────────────────────────────────────────────────────────────────
    // Shifted from col 10 -> 20, col 17 -> 27
    addTrap1(group, loader, 32, 20);
    addTrap1(group, loader, 32, 27);

    // ── West annex demon alcove ───────────────────────────────────────────────
    // Off the west wall of the treeman main room (passage at row 18, cols 10-12)
    // sits a small room (rows 17-19, cols 6-9) ending in a 2x2 demon-wall alcove
    // (rows 17-19, cols 4-5). Two torches stand against the alcove's back (west)
    // wall flanking an interactive cauldron in front of the central grid. Feeding
    // the cauldron 3 Ancient Tree Sap opens the centre rear-wall grid at (18,3) —
    // see the isCauldron handler in objects.js. The cauldron's interaction cell
    // is (18,4).
    addDroppedTorch(group, loader, 4, 17, Math.PI / 2, -0.6, 0);
    addDroppedTorch(group, loader, 4, 19, Math.PI / 2, -0.6, 0);
    addInteractiveCauldron(group, loader, 4, 18, 0, 0.5, 0.1, 0, 0, 18, 4);

    // Empty chest in the hidden chest room (rows 8-10, cols 2-4) revealed behind
    // the cauldron passage — TODO: add loot. offsetZ -0.5 sits it against the north
    // back wall while staying in front of it (the wall face is at -1.0); rotY 0
    // faces it into the room.
    addChest(group, loader, 3, 8, 0, -0.5, [
        "Schematic Key", "Ring of Resilience", "Plate Cuirass", { name: 'Gold Coins', quantity: 100 },
    ], asset('/items/magic-chest.glb'), true, 0, 'Chest', 0.44);
    // Spell cabinet against the west wall (col 1) and weapon rack against the east
    // wall (col 5) of the same room — both empty for now.
    addSpellCabinet(group, loader, 2, 9, Math.PI / 2, -0.7, 0, [
        "Trapper's Manual", "Shell", "Resist Water", "Resist Lightning"
    ]);

    addWeaponRack(group, loader, 4, 9, -Math.PI / 2, 0.7, 0, [
        "Life Staff", "Lightning Dagger", "Lightning Arrows", "Lightning Bolts"
    ]);

    // ── Mist portal into the Crow Realm ───────────────────────────────────────
    // The mist sits in a one-cell alcove at the east end of Room B (row 8,
    // col 25); everything beyond it is walled off on the Level 2 map. Walking
    // into it (or clicking it) prompts "proceed into the mist?" and, on confirm,
    // loads the on-demand Crow Realm (level 60) and warps the party in. The
    // realm — its monsters, objects and textures — isn't loaded until that warp,
    // and is torn down again when the party returns.
    addMistPortal(group, interactables, 25, 8, {
        axis: 'ew',
        enterDir: +1,
        targetLevel: CROW_REALM_LEVEL,
        enterRow: CROW_ENTRY.row,
        enterCol: CROW_ENTRY.col,
        enterFacing: CROW_ENTRY.facing,
        // Pull the curtain west to sit flush in the alcove doorway.
        offsetX: -CELL / 2,
    });
}

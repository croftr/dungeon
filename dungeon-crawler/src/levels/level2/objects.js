import { CELL } from '../../map.js';
import { asset } from '../../assets.js';

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
        createWallButton,
        level2PortcullisOpened,
        level2GiantPortcullisOpened,
    } = ctx;

    // ── Portal back to Level 0 ────────────────────────────────────────────────
    addPortal(group, loader, 7, 1, 0, 0, 0, -0.85);

    // ── Portcullises & Keys ───────────────────────────────────────────────────
    // Locked portcullis at the passage entrance (col 7, row 8) — requires Bronze Key
    addPortcullis(group, loader, 7, 8, 0, level2PortcullisOpened);

    // Keyhole next to the main-entrance portcullis (north wall, west side)
    addKeyhole(group, loader, 7, 8, Math.PI / 2, -0.85, -2.0);

    // Portcullis on the WEST wall of the demon room (col 2, row 17)
    addPortcullis(group, loader, 2, 17, Math.PI / 2);

    // Button on the EAST face of col-2 wall, one row south of the portcullis
    const { group: demonBtn } = createWallButton(+1, { target: 'demon_room' });
    demonBtn.position.set(2 * CELL + 1.0, 1.25, 18 * CELL);
    group.add(demonBtn);

    // ── Giant Room ────────────────────────────────────────────────────────────
    // Bone-key portcullis on the east wall of the main room (col 9, row 15).
    // The passage beyond goes east to col 22, turns north to row 4, then opens
    // into the large giant room (rows 1–3, cols 14–27).
    addPortcullis(group, loader, 9, 15, Math.PI / 2, level2GiantPortcullisOpened);

    // Keyhole on the west face of the portcullis — visible from the main room.
    // targetRow/targetCol tell it to open the portcullis at (row 15, col 9).
    addKeyhole(group, loader, 9, 15, -Math.PI / 2, -1.1, -1.3, 15, 9, 'Bone Key');

    // ── Chests ────────────────────────────────────────────────────────────────
    // Two chests in the chest vault (col 1, rows 18–19)
    addChest(group, loader, 0.7, 19, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 10 },
        'Life Essence', 'Mana Berry', 'Scroll of Fireball'
    ]);
    addChest(group, loader, 1.3, 19, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 10 },
        'Ring of Strength', 'Ring of Wisdom', 'Ring of Dexterity'
    ]);

    // Chest at the end of the long passage
    addChest(group, loader, 28, 17, -Math.PI / 2, 0.0, [
        { name: 'Gold Coins', quantity: 10 },
        'Ruby Ring', 'Mana Potion', 'Life Essence',
        'Chain Shirt', 'Plate Cuirass'
    ], asset('/items/chest1.glb'), true, 0.5);

    // Chest in the NE corner of the giant room
    addChest(group, loader, 24, 2, -Math.PI / 2, 0.7, [
        { name: 'Gold Coins', quantity: 20 },
        'Starlight Nectar'
    ], asset('/items/chest1.glb'), true, -0.5);

    // ── Stairs ────────────────────────────────────────────────────────────────
    addStairs(group, loader, 3, 26, Math.PI, { x: 1.25, y: 0.7, z: 0.7 }, 0, 0.25);

    // ── Buttons ───────────────────────────────────────────────────────────────
    // Button to close the hole, on the North wall of cell (17, 28) facing South
    const { group: closeHoleBtn } = createWallButton(+1, { target: 'close_hole', gridRow: 16, gridCol: 28 });
    closeHoleBtn.position.set(28 * CELL, 1.25, 16 * CELL + 1.0);
    closeHoleBtn.rotation.y = -Math.PI / 2;
    group.add(closeHoleBtn);

    // ── Traps ─────────────────────────────────────────────────────────────────
    addTrap1(group, loader, 10, 17);  // long east passage
    addTrap1(group, loader, 17, 10);  // corridor leaving the demon room
}

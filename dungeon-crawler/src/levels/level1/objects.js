import { CELL } from '../../map.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 1 – The Western Dungeon
//  The starter room and east merchant room have moved to Level 0.
//  This file covers the north passage, NW room, mummy area, and south section.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel1Objects(ctx) {
    const {
        group, loader,
        addChest, addWeaponRack, addSpellCabinet,
        addBonePile, addDecoration,
        addPortal, addPortcullis,
        addStatue, addPortalActivatorStatue,
        addTrap1,
        createWallButton,
        mummyGateOpened,
        interactables,
    } = ctx;

    // ── Chests ───────────────────────────────────────────────────────────────
    // Chest at the end of the long north passage
    addChest(group, loader, 7, 1, 0, -0.7, [
        { name: 'Gold Coins', quantity: 50 },
        'Leather Gloves', 'Cloth Trousers', 'Worn Boots', 'Ring of Wisdom', 'Worn Boots', "Scroll of Cure Poison"
    ]);

    // Chest in the Northwest room — far northeast corner
    addChest(group, loader, 5, 1, 0, -0.65, [
        "Ring of Dexterity", "Steel Arrows", "Poison Dagger", "Leather Belt", "Adventurer's Belt",
        "Dwarf Crossbow"
    ], undefined, true, -0.35);

    // 2nd Chest in the Northwest room
    addChest(group, loader, 5, 1, 0, -0.65, [
        { name: 'Gold Coins', quantity: 100 },
        "Ring of Vigour", "Travelling Cloak", "Iron Helm"
    ], undefined, true, 0.35);

    // Chest in the mummy room (secret east chamber)
    addChest(group, loader, 19, 1, 0, -0.7, [
        'Chain Shirt', 'Iron Gauntlets', 'Chainmail Leggings', 'Iron-Shod Boots', 'Healers Vest'
    ]);

    // Chest at the end of the new passage in the southwest
    addChest(group, loader, 2, 17, 0, -0.7, [
        "Shawl", "Leather Cap", "Iron Helm"
    ]);

    // Chest in the alcove east of (row 15, col 13)
    addChest(group, loader, 14, 15, -Math.PI / 2, 0, [
        "Travelling Cloak", "Travelling Cloak"
    ], undefined, true, 0.7);

    // ── Bone pile ────────────────────────────────────────────────────────────
    addBonePile(group, loader, 1, 27);

    // ── Weapon Racks ─────────────────────────────────────────────────────────
    // Mummy room dead-end passage
    addWeaponRack(group, loader, 22, 4, Math.PI / 2, 0.65, 0, [
        'Elven Dagger', 'Mace', 'Dagger', 'Dwarven Axe', 'Spiked Shield'
    ]);

    // South corridor
    addWeaponRack(group, loader, 21, 21, Math.PI / 2, 0.65, 0, [
        'War Hammer', 'Longbow', 'Steel Bolts'
    ]);

    // ── Spell Cabinet ────────────────────────────────────────────────────────
    // Secret room north of the zombie room — moved here from Level 0
    addSpellCabinet(group, loader, 17, 11, 0, 0, -0.7, [
        'Minor Potions Parchment',
    ]);

    // Dead-end passage near the zombie room
    addSpellCabinet(group, loader, 21, 16, -Math.PI / 2, 0.7, 0, [
        'Scroll of Regeneration',
        'Scroll of Rejuvenate'
    ]);

    // ── Portal to Level 3 (The Abyssal Crypts) ───────────────────────────────
    addPortal(group, loader, 1, 22, 3, 0, 0, 0);

    // ── Traps ─────────────────────────────────────────────────────────────────
    addTrap1(group, loader, 21, 10);  // long south corridor

    // ── Portcullises & Gates ──────────────────────────────────────────────────
    // Portcullis at col 7, row 7 (opened by wall button)
    addPortcullis(group, loader, 7, 7);

    // Button for that portcullis
    const { group: portcullisBtn } = createWallButton(+1, { target: 'portcullis' });
    portcullisBtn.position.set(8 * CELL - 1.0, 1.25, 8 * CELL);
    group.add(portcullisBtn);

    // Mummy area entrance portcullis (starts open; closes on ambush)
    addPortcullis(group, loader, 10, 1, Math.PI / 2, !mummyGateOpened);

    // Three-wide portcullis on far side of the 5x5 room — stays open once triggered
    addPortcullis(group, loader, 16, 2, Math.PI / 2, mummyGateOpened);
    addPortcullis(group, loader, 16, 3, Math.PI / 2, mummyGateOpened);
    addPortcullis(group, loader, 16, 4, Math.PI / 2, mummyGateOpened);

    // Button to escape mummy room
    const { group: mummyBtn } = createWallButton(-1, { target: 'escape_mummy_room', targetRow: 3, targetCol: 21 });
    mummyBtn.position.set(21 * CELL - 1.0, 1.25, 3 * CELL);
    group.add(mummyBtn);

    // ── Statues ───────────────────────────────────────────────────────────────
    // Statue in the center of the 5x5 room
    addStatue(group, loader, 13, 3);

    // Portal Activator Statue in the mummy room — unlocks the level-2 portal in Level 0
    addPortalActivatorStatue(group, loader, 19, 2, 0);

}

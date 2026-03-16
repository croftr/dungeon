import * as THREE from 'three';
import { CELL } from '../../map.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 1 – The Western Dungeon
//  Object/container/portal/gate placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel1Objects(ctx) {
    const {
        group, loader,
        addChest, addWeaponRack, addSpellCabinet, addShop,
        addCrystals, addBonePile,
        addPortal, addDisabledPortal, addPortcullis,
        addStatue, addPortalActivatorStatue, addPartyConfirmNPC,
        addAnvil, addAlchemyWorkshop, addDroppedTorch, addTrap1,
        createWallButton, addArmourStand,
        starterPortalEnabled, starterGateOpened, mummyGateOpened,
        setStarterGate,
        interactables,
    } = ctx;

    // ── Chests ───────────────────────────────────────────────────────────────
    // Stash in the starter room
    addChest(group, loader, 11, 13, 0, 0.7, [
        { name: 'Gold Coins', quantity: 100 },
        'Torch', 'Potion of Invincibility', 'Potion of Unseen', "Life Essence", "Iron Ore",
    ], asset('/items/stash.glb'), true, 0, 'Stash');

    // Chest at the end of the long passage
    addChest(group, loader, 7, 1, 0, -0.7, [
        { name: 'Gold Coins', quantity: 50 },
        'Leather Gloves', 'Cloth Trousers', 'Worn Boots', 'Ring of Wisdom', 'Worn Boots', "Scroll of Cure Poison"
    ]);

    // Chest in the Northwest room — far northeast corner
    addChest(group, loader, 5, 1, Math.PI, -0.65, [
        "Ring of Dexterity", "Steel Arrows", "Poison Dagger", "Leather Belt", "Adventurer's Belt",
        "Dwarf Crossbow"
    ], undefined, true, -0.35);

    // 2nd Chest in the Northwest room
    addChest(group, loader, 5, 1, Math.PI, -0.65, [
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
    addChest(group, loader, 14, 15, Math.PI / 2, 0, [
        "Travelling Cloak", "Travelling Cloak"
    ], undefined, true, 0.7);

    // ── Crystals & Bone ──────────────────────────────────────────────────────
    addCrystals(group, loader, 9, 11, 0, -0.7);
    addBonePile(group, loader, 1, 27);

    // ── Weapon Racks ─────────────────────────────────────────────────────────
    // East room — facing West, pushed against East wall
    addWeaponRack(group, loader, 21, 21, Math.PI / 2, 0.65, 0, [
        'War Hammer', 'Longbow', 'Steel Bolts'
    ]);

    // Mummy room dead-end passage
    addWeaponRack(group, loader, 22, 4, Math.PI / 2, 0.65, 0, [
        'Elven Dagger', 'Mace', 'Dagger', 'Dwarven Axe', 'Spiked Shield'
    ]);

    // ── Spell Cabinets ───────────────────────────────────────────────────────
    // Starter room
    addSpellCabinet(group, loader, 12, 13, Math.PI, 0, 0.6, [
        'Scroll of Fireball',
        'Scroll of Heal',
        'Scroll of Regeneration',
        'Scroll of Cure Poison',
        'Scroll of Resist Poison',
        'Scroll of Sleep',
    ]);

    // Dead-end passage near the zombie room
    addSpellCabinet(group, loader, 21, 16, -Math.PI / 2, 0.7, 0, [
        'Scroll of Regeneration',
        'Scroll of Rejuvenate'
    ]);

    // ── Shop ─────────────────────────────────────────────────────────────────
    // Against the east wall of the 8×8 room, centre row
    addShop(group, loader, 23, 11, -Math.PI / 2, -0.2, 0);

    // Decorative armour stands in the east room
    addArmourStand(group, loader, 23, 10, -Math.PI / 2, asset('/items/armour-stand1.glb'), 0.7, 1, 0, {
        head: 'Celestial Vindicator Helm',
        chest: 'Celestial Vindicator Cuirass',
        hands: 'Celestial Vindicator Gauntlets',
        legs: 'Celestial Vindicator Leggings',
        feet: 'Celestial Vindicator Sabatons',
        leftHand: 'Celestial Vindicator Greatmace',
        cloak: 'Celestial Vindicator Cloak',
    }, 'Paladin Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 12, -Math.PI / 2, asset('/items/armour-stand2.glb'), 0.7, 1, 0, {}, 'Warrior Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 13, -Math.PI / 2, asset('/items/wardancer-armor-stand.glb'), 0.7, 1, 0, {
        head: 'Amethyst Wardancer Helm',
        chest: 'Amethyst Wardancer Cuirass',
        hands: 'Amethyst Wardancer Bracers',
        legs: 'Amethyst Wardancer Leggings',
        feet: 'Amethyst Wardancer Sabatons',
        leftHand: 'Amethyst Wardancer Dagger',
        cloak: 'Amethyst Wardancer Cloak',
    }, 'Wardancer Armor Stand', 0.35);

    // Decorative chest beside the merchant (non-interactive)
    addChest(group, loader, 23, 11, -Math.PI / 2, 0.7, [], asset('/items/chest1.glb'), false);

    // ── Torch (dropped item) ─────────────────────────────────────────────────
    // Beside the merchant, nudged north
    addDroppedTorch(group, loader, 23, 11, -Math.PI / 2, 0.8, -0.7);

    // ── Portals ──────────────────────────────────────────────────────────────
    // Portal to Level 2 — only appears after Statue Portal Activator is used
    if (starterPortalEnabled) {
        addPortal(group, loader, 13, 13, 2, Math.PI / 2, 0.85, 0);
    } else {
        addDisabledPortal(group, loader, 13, 13, Math.PI / 2, 0.85, 0);
    }

    // Portal to Level 3 (The Abyssal Crypts) at the end of the dungeon
    addPortal(group, loader, 1, 22, 3, 0, 0, 0);

    // ── Workshop & Anvil ─────────────────────────────────────────────────────
    addAlchemyWorkshop(group, loader, 19, 14, 0, 0, 0.85);
    addAnvil(group, loader, 19, 7, 0, 0, -0.85, ['Life Essence', 'Life Essence']);

    // ── Traps ─────────────────────────────────────────────────────────────────
    addTrap1(group, loader, 9, 18);   // east room near start
    addTrap1(group, loader, 21, 10);  // long south corridor

    // ── Teleport Torch ───────────────────────────────────────────────────────
    addDroppedTorch(group, loader, 12, 11, Math.PI / 2);

    // ── Portcullises & Gates ──────────────────────────────────────────────────
    // Portcullis at col 7, row 7 (opened by wall button)
    addPortcullis(group, loader, 7, 7);

    // Button for that portcullis
    const { group: portcullisBtn } = createWallButton(+1, { target: 'portcullis' });
    portcullisBtn.position.set(8 * CELL - 1.0, 1.25, 8 * CELL);
    group.add(portcullisBtn);

    // Starter gate — already open if the player confirmed their party before
    const starterGate = addPortcullis(group, loader, 8, 13, Math.PI / 2, starterGateOpened);
    setStarterGate(starterGate);

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

    // ── Statues & NPCs ────────────────────────────────────────────────────────
    // Statue in the center of the new 5x5 room
    addStatue(group, loader, 13, 3);

    // Portal Activator Statue in the corner of the mummy room
    addPortalActivatorStatue(group, loader, 19, 2, 0);

    // Party Confirm NPC — skip if the gate was already opened in a previous visit
    if (!starterGateOpened) {
        addPartyConfirmNPC(group, loader, 9, 13, Math.PI, -1, 0);
    }
}

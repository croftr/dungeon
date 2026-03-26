import { asset } from '../../assets.js';
import { CELL } from '../../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 0 – The Starter Room
//  Contains the starter room and the large east merchant room.
//  Called by spawnObjectsForLevel() in objects.js.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel0Objects(ctx) {
    const {
        group, loader,
        addChest, addWeaponRack, addSpellCabinet, addShop,
        addCrystals,
        addPortal, addDisabledPortal, addPortcullis,
        addPartyConfirmNPC,
        addAnvil, addAlchemyWorkshop, addDroppedTorch, addTrap1,
        addDecoration, addCrystalShrine, addHeroDoor,
        createWallButton,
        starterPortalEnabled, starterGateOpened,
        setStarterGate,
        interactables,
    } = ctx;

    // ── Crystal Temple decoration against south wall, next to the stash ─────
    addCrystalShrine(group, loader, 13, 12, -Math.PI / 2, 0.5, 0.9, 0, 0);

    // ── Stash in the starter room ─────────────────────────────────────────────
    addChest(group, loader, 13.4, 10, Math.PI / 2, -0.1, [
        { name: 'Gold Coins', quantity: 100 },
        'Torch', 'Potion of Invincibility', 'Potion of Unseen', "Life Essence", "Iron Ore", "Life Essence", "Minor Potions Parchment",
        "Lizard Scale", "Crocodile Hide", "Iron Ore", "Aqua Man Flipper", "Demon's Eyes", "Iron Ore", "Mace", "Cloth Trousers", "Starlight Nectar",
        "Blue Crystal", "Red Crystal"
    ], asset('/items/stash.glb'), true, 0, 'Stash');

    // ── Crystals in the east room (center) ────────────────────────────────────
    addCrystals(group, loader, 19, 11, 0);

    // ── Teleport Torch in starter room ────────────────────────────────────────
    addDroppedTorch(group, loader, 12, 11, Math.PI / 2);

    // ── Portal to Level 2 — only after Portal Activator Statue is used ────────
    if (starterPortalEnabled) {
        addPortal(group, loader, 13, 13, 2, Math.PI / 2, 0.85, 0);
    } else {
        addDisabledPortal(group, loader, 13, 13, Math.PI / 2, 0.85, 0);
    }

    // ── Starter gate (portcullis) — closed until party is confirmed ───────────
    const starterGate = addPortcullis(group, loader, 8, 13, Math.PI / 2, starterGateOpened);
    setStarterGate(starterGate);

    // ── Party Confirm NPC — skip if gate was already opened ───────────────────
    if (!starterGateOpened) {
        addPartyConfirmNPC(group, loader, 9, 13, Math.PI, -1, 0);
    }

    // ── Weapons & Armour merchant (east wall, centre) ─────────────────────────
    addShop(group, loader, 23, 11, -Math.PI / 2, -0.2, 0, 'weapons');

    // ── Decorative chest beside the weapons merchant ───────────────────────────
    addChest(group, loader, 23, 11, -Math.PI / 2, 0.7, [], asset('/items/chest1.glb'), false);

    // ── Dropped torch beside the weapons merchant ──────────────────────────────
    addDroppedTorch(group, loader, 23, 11, -Math.PI / 2, 0.8, -0.7);

    // ── Magic chest beside the apothecary ─────────────────────────────────────
    addChest(group, loader, 16, 14, Math.PI, -0.1, [], asset('/items/magic-chest.glb'), true, 1.5, 'Chest', 0.22);

    // ── Apothecary (SW corner of east room) — potions, scrolls & ingredients ──
    addShop(group, loader, 17, 14, Math.PI, 0, 0, 'potions',
        asset('/npcs/potion-merchant/Meshy_AI_Verdant_Veil_Enchantr_biped_Animation_Idle_9_withSkin.glb'),
        {
            greetingAudio: [
                asset('/npcs/potion-merchant/greting1.mp3'),
                asset('/npcs/potion-merchant/greeting2.mp3'),
            ],
            questNpcId: 'potion-merchant',
        });

    // ── Alchemy workshop and anvil (east room) ────────────────────────────────
    addAlchemyWorkshop(group, loader, 19, 14, 0, 0, 0.85);

    // ── Hero door — south wall of east room, leads to Hall of Heroes (level 5) ─
    addHeroDoor(group, loader, 21, 14);
    addDroppedTorch(group, loader, 22, 14, Math.PI, 0, 0.8);
    addAnvil(group, loader, 19, 7, 0, 0, -0.85, ['Life Essence', 'Life Essence']);

    // ── Practice trap — NW corner of east room ────────────────────────────────
    addTrap1(group, loader, 7, 17);

    // ── Teleport to Giant Room Button ─────────────────────────────────────────
    const { group: giantBtn } = createWallButton(-1, { target: 'teleport_giant' });
    giantBtn.position.set(11 * CELL - 1.0, 1.25, 11 * CELL); // West face of col 11, row 11
    group.add(giantBtn);
}

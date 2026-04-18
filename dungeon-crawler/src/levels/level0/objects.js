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
        addAnvil, addAlchemyWorkshop, addDroppedTorch, addTrap1, addCustomNPC, addDialogueNPC,
        addDecoration, addCrystalShrine, addHeroDoor, addTrainingConsole,
        createWallButton,
        starterPortalEnabled, starterGateOpened,
        level3PortalEnabled, level4PortalEnabled,
        setStarterGate,
        monsterNpcSaved,
        interactables,
    } = ctx;

    // ── Crystal Temple decoration against south wall, next to the stash ─────
    addCrystalShrine(group, loader, 13, 12, -Math.PI / 2, 0.5, 0.9, 0, 0);

    // ── Starter Stash in the starter room ─────────────────────────────────────────────
    addChest(group, loader, 13.4, 10, Math.PI / 2, -0.1, [
        { name: 'Gold Coins', quantity: 10000 },
        'Potion of Invincibility', 'Potion of Unseen', "Rage Cap", "Elixir of Rage",
        "Red Crystal", "Blue Crystal", "Red Crystal", "Blue Crystal", "Ice Cap",
        // Essences (2 of each)
        "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence",
        "Crocodile Warrior Essence", "Crocodile Warrior Essence",
        "Tree Man Essence", "Tree Man Essence",
        "Ogre Essence", "Ogre Essence",
        "Minotaur Essence", "Minotaur Essence",
        "Aqua Man Essence", "Aqua Man Essence",
        "Lizard Man Essence", "Lizard Man Essence",
        "Giant Essence", "Giant Essence",
        "Demon Essence", "Demon Essence",
        "Demon Ogre Essence", "Demon Ogre Essence",
        // Unique Arena Items (2 of each)
        "Crocodile Hide", "Crocodile Hide",
        "Ogre's Head", "Ogre's Head",
        "Iron Ore", "Iron Ore", "Ogre Helm Parchment", "Crocodilian Boots Parchment", "Leather Boots", "Iron Helm"
    ], asset('/items/stash.glb'), true, 0, 'Stash');

    // ── Crystals in the east room (center) ────────────────────────────────────
    addCrystals(group, loader, 19, 11, 0);

    // ── Teleport Torch in starter room ────────────────────────────────────────
    addDroppedTorch(group, loader, 12, 11, Math.PI / 2);

    // ── Portal to Level 2 — only after Portal Activator Statue is used ────────
    if (starterPortalEnabled) {
        addPortal(group, loader, 13, 13, 2, 0, 0, 0.85); // Left
    } else {
        addDisabledPortal(group, loader, 13, 13, 0, 0, 0.85);
    }

    // ── Portal to Level 3 (The Abyssal Crypts) — south wall, beside Level 2 portal ──
    if (level3PortalEnabled) {
        addPortal(group, loader, 12, 13, 3, 0, 0, 0.85, 21, 11, 0); // Middle
    } else {
        addDisabledPortal(group, loader, 12, 13, 0, 0, 0.85, 'level3');
    }

    // ── Portal to Level 4 (The Egg Chamber) — south wall, beside Level 3 portal ──
    if (level4PortalEnabled) {
        addPortal(group, loader, 11, 13, 4, 0, 0, 0.85, 14, 10, 2); // Right
    } else {
        addDisabledPortal(group, loader, 11, 13, 0, 0, 0.85, 'level4');
    }

    // ── Starter gate (portcullis) — closed until party is confirmed ───────────
    const starterGate = addPortcullis(group, loader, 8, 13, Math.PI / 2, starterGateOpened);
    setStarterGate(starterGate);

    // ── Party Confirm NPC — skip if gate was already opened ───────────────────
    if (!starterGateOpened) {
        addPartyConfirmNPC(group, loader, 9, 13, Math.PI, -1, 0);
    }

    // ── Weapons & Armour merchant (east wall, centre) ─────────────────────────
    addShop(group, loader, 23, 11, -Math.PI / 2, -0.2, 0, 'weapons', null, {
        greetingAudio: [
            asset('/npcs/merchant1/quality-steel.mp3'),
            asset('/npcs/merchant1/shield-dents.mp3'),
            asset('/npcs/merchant1/what-can-i-do-for-you.mp3'),
        ],
        questNpcId: 'weapons-merchant',
    });

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

    // ── Training Console — next to the training dummy at (7, 23) ────────────
    addTrainingConsole(group, loader, 22, 7, Math.PI);

    // ── Relocated Monster — NW corner of east room ────────────────────────────────
    if (monsterNpcSaved) {
        // Monster relocated here - col 17, row 7, face North (0)
        // Now using addShop with idle base and agree-gesture greeting
        addShop(group, loader, 17, 7, 0, 0, 0, 'barnaby', asset('/npcs/monster-npc/idle.glb'), {
            questNpcId: 'monster-npc',
            scale: 0.6,
            greetingModel: asset('/npcs/monster-npc/agree-gesture.glb'),
            greetingAudio: [
                asset('/npcs/monster-npc/greeting1.mp3'),
                asset('/npcs/monster-npc/greeting2.mp3')
            ]
        });
    }

    // ── Button on the west wall of the starter room ──────────────────────────
    // Press while facing west (toward col 8) to teleport to level 4 (egg room).
    const { group: btn4 } = createWallButton(+1, { target: 'teleport_level4' }, 'x');
    btn4.position.set(8 * CELL + 1.0, 1.25, 11 * CELL);
    group.add(btn4);

    // ── Essentiary button (all monsters unlocked) ───────────────────────────
    // Adjacent button — opens Essentiary with every monster available.
    const { group: btnEss } = createWallButton(+1, { target: 'essentiary_unlock_all' }, 'x');
    btnEss.position.set(8 * CELL + 1.0, 1.25, 12 * CELL);
    group.add(btnEss);

}

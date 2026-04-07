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
        level3PortalEnabled,
        setStarterGate,
        monsterNpcSaved,
        interactables,
    } = ctx;

    // ── Crystal Temple decoration against south wall, next to the stash ─────
    addCrystalShrine(group, loader, 13, 12, -Math.PI / 2, 0.5, 0.9, 0, 0);

    // ── Starter Stash in the starter room ─────────────────────────────────────────────
    addChest(group, loader, 13.4, 10, Math.PI / 2, -0.1, [
        { name: 'Gold Coins', quantity: 10000 },
        'Potion of Invincibility', 'Potion of Unseen', "Red Crystal", "Blue Crystal", "Demon Blade", "Goblin Shiv", "Goblin Shiv", "Silver Mace", "Warden's Shield", "Trickster's Hood",
        "Leather Gloves", "Aqua Man Essence", "Crocodile Warrior Essence", "Demon Ogre Essence", "Demon Essence", "Giant Essence", "Lizard Man Essence", "Minotaur Essence", "Ogre Essence", "Tree Man Essence"
    ], asset('/items/stash.glb'), true, 0, 'Stash');

    // ── Crystals in the east room (center) ────────────────────────────────────
    addCrystals(group, loader, 19, 11, 0);

    // ── Teleport Torch in starter room ────────────────────────────────────────
    addDroppedTorch(group, loader, 12, 11, Math.PI / 2);

    // ── Portal to Level 2 — only after Portal Activator Statue is used ────────
    if (starterPortalEnabled) {
        addPortal(group, loader, 13, 13, 2, 0, 0, 0.85);
    } else {
        addDisabledPortal(group, loader, 13, 13, 0, 0, 0.85);
    }

    // ── Portal to Level 3 (The Abyssal Crypts) — south wall, beside Level 2 portal ──
    // Activated by filling the crystal shrine a second time with crystals from Level 2
    if (level3PortalEnabled) {
        addPortal(group, loader, 12, 13, 3, 0, 0, 0.85, 21, 11, 0);
    } else {
        addDisabledPortal(group, loader, 12, 13, 0, 0, 0.85, 'level3');
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

    // ── Practice trap — NW corner of east room ────────────────────────────────
    if (!monsterNpcSaved) {
        addTrap1(group, loader, 7, 17);
    } else {
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

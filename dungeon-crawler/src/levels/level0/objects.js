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
        stanceNpcDeparted,
        interactables,
    } = ctx;

    // ── Crystal Temple decoration against south wall, next to the stash ─────
    addCrystalShrine(group, loader, 13, 12, -Math.PI / 2, 0.5, 0.9, 0, 0);

    // ── Starter Stash in the starter room ─────────────────────────────────────────────
    addChest(group, loader, 13.4, 10, Math.PI / 2, -0.1, [
        { name: 'Gold Coins', quantity: 10000 },
        'Potion of Invincibility', 'Potion of Unseen', "Elixir of Rage", "Elixir of Rage",
        "Red Crystal", "Blue Crystal", "Red Crystal", "Blue Crystal", "Elixir of Enlightenment",
        "Scroll of Waterbolt",
        // Essences (2 of each)
        "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence", "Life Essence",
        "Tome of the Viperseeker",
        "Flame Axe", "Flame Dagger", "Flame Arrows",
        "Ice Axe", "Ice Dagger", "Ice Arrows",
        "Flame Greataxe", "Ice Greataxe",
        // Unique Arena Items (2 of each)
        "Crocodile Hide", "Crocodile Hide",
        "Ogre's Head", "Ogre's Head",
        "Iron Ore", "Iron Ore", "Ogre Helm Parchment", "Crocodilian Boots Parchment", 
        "Savage Schematics", "Trackers Schematics", "Steel Schematics", "Wizard Schematics",
        "Leather Boots", "Iron Helm",
        "Heavy Ogre Drape", "Ashen Shroud",
        "Wizard's Hat", "Wizard's Robe", "Wizard's Gloves", "Wizard's Leggings", "Wizard's Boots",
        "Steel Vanguard Helm", "Steel Vanguard Chestplate", "Steel Vanguard Gauntlets", "Steel Vanguard Legplates", "Steel Vanguard Sabatons",
        "Tracker's Guise Cowl", "Tracker's Guise Tunic", "Tracker's Guise Gloves", "Tracker's Guise Breeches", "Tracker's Guise Boots",
        "Savage Fury Headdress", "Savage Fury Harness", "Savage Fury Bracers", "Savage Fury Leg Wraps", "Savage Fury Footwraps",
        "Three Eyed Familiar", "Testament of Faith", "Talisman of the Wind", "Bulwark of the Ancestors", "Bloodstone Amulet", "Tracker's Medallion", "Crescent Moon Charm"
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
    addShop(group, loader, 23, 9, -Math.PI / 2, -0.2, 0, 'weapons', null, {
        greetingAudio: [
            asset('/npcs/merchant1/quality-steel.mp3'),
            asset('/npcs/merchant1/shield-dents.mp3'),
            asset('/npcs/merchant1/what-can-i-do-for-you.mp3'),
        ],
        questNpcId: 'weapons-merchant',
    });

    // ── Decorative chest beside the weapons merchant ───────────────────────────
    addChest(group, loader, 23, 10, -Math.PI / 2, -1.0, [], asset('/items/chest1.glb'), false);

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

    // ── Stance NPC + shelf — only appear after completing the level 2 dialogue
    if (stanceNpcDeparted) {
        addShop(group, loader, 23, 13, -Math.PI / 2 + 0.45, 0, 0, 'stances',
            asset('/npcs/stance-npc/Meshy_AI_Dragonborn_Magier_mit_biped_Animation_Stand_and_Chat_withSkin.glb'),
            {
                scale: 0.55,
                greetingAudio: [
                    asset('/npcs/stance-npc/bark1.mp3'),
                    asset('/npcs/stance-npc/bark2.mp3'),
                    asset('/npcs/stance-npc/bark3.mp3'),
                ],
            }
        );
        addDecoration(group, loader, 23, 12, -Math.PI / 2, asset('/items/stance-shelf.glb'), 1.0, true, 0.8, 0.5, 0);
    }

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


    // ── Essentiary Unlock All Button (West wall of starter room) ──────────────
    // Positioned at row 12, col 8. The face points East (+X) into the room at col 9.
    const { group: essBtn } = createWallButton(+1, { target: 'essentiary_unlock_all' });
    essBtn.position.set(9 * CELL - 1.0, 1.25, 12 * CELL);
    group.add(essBtn);

    // ── Test Teleport to Level 4 (next to essentiary button) ─────────────────
    const { group: lvl4Btn } = createWallButton(+1, { target: 'teleport_level4' });
    lvl4Btn.position.set(9 * CELL - 1.0, 1.25, 11 * CELL);
    group.add(lvl4Btn);

}

import { asset } from '../../assets.js';

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
        createWallButton, addArmourStand,
        starterPortalEnabled, starterGateOpened,
        setStarterGate,
        interactables,
    } = ctx;

    // ── Stash in the starter room ─────────────────────────────────────────────
    addChest(group, loader, 11, 13, 0, 0.7, [
        { name: 'Gold Coins', quantity: 100 },
        'Torch', 'Potion of Invincibility', 'Potion of Unseen', "Life Essence", "Iron Ore", "Life Essence", "Minor Potions Parchment",
        "Ironpeak Dwarf Helm", "Ironpeak Dwarf Cuirass", "Ironpeak Dwarf Gauntlets", "Ironpeak Dwarf Greaves",
        "Ironpeak Dwarf Sabatons", "Ironpeak Battleaxe", "Ironpeak Round Shield", "Ironpeak Bear Cloak"
    ], asset('/items/stash.glb'), true, 0, 'Stash');

    // ── Crystals in starter room ──────────────────────────────────────────────
    addCrystals(group, loader, 9, 11, 0, -0.7);

    // ── Spell Cabinet in starter room ─────────────────────────────────────────
    addSpellCabinet(group, loader, 12, 13, Math.PI, 0, 0.6, [
        'Scroll of Fireball',
        'Scroll of Heal',
        'Scroll of Regeneration',
        'Scroll of Cure Poison',
        'Scroll of Resist Poison',
        'Scroll of Sleep',
    ]);

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

    // ── Shop (east room) ──────────────────────────────────────────────────────
    addShop(group, loader, 23, 11, -Math.PI / 2, -0.2, 0);

    // ── Decorative armour stands (east room) ─────────────────────────────────
    addArmourStand(group, loader, 23, 8, -Math.PI / 2, asset('/items/dwarf-ranger-statue.glb'), 0.7, 1, 0, {
        head: 'Mountain Stalker Hood',
        chest: 'Mountain Stalker Trenchcoat',
        hands: 'Mountain Stalker Gloves',
        legs: 'Mountain Stalker Trousers',
        feet: 'Mountain Stalker Boots',
        leftHand: 'Mountain Stalker Crossbow',
        cloak: 'Mountain Stalker Heavy Cloak'
    }, 'Dwarf Ranger Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 9, -Math.PI / 2, asset('/items/woodelf-statue.glb'), 0.7, 1, 0, {
        head: 'Sylvan Elderwood Hood',
        chest: 'Sylvan Elderwood Tunic',
        hands: 'Sylvan Elderwood Bracers',
        legs: 'Sylvan Elderwood Leggings',
        feet: 'Sylvan Elderwood Boots',
        leftHand: 'Sylvan Elderwood Bow',
        cloak: 'Sylvan Elderwood Cloak'
    }, 'Woodelf Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 10, -Math.PI / 2, asset('/items/paladin-statue.glb'), 0.7, 1, 0, {
        head: 'Celestial Vindicator Helm',
        chest: 'Celestial Vindicator Cuirass',
        hands: 'Celestial Vindicator Gauntlets',
        legs: 'Celestial Vindicator Leggings',
        feet: 'Celestial Vindicator Sabatons',
        leftHand: 'Celestial Vindicator Greatmace',
        cloak: 'Celestial Vindicator Cloak',
    }, 'Paladin Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 12, -Math.PI / 2, asset('/items/dwarf-warrior-statue.glb'), 0.7, 1, 0, {
        head: 'Ironpeak Dwarf Helm',
        chest: 'Ironpeak Dwarf Cuirass',
        hands: 'Ironpeak Dwarf Gauntlets',
        legs: 'Ironpeak Dwarf Greaves',
        feet: 'Ironpeak Dwarf Sabatons',
        leftHand: 'Ironpeak Battleaxe',
        rightHand: 'Ironpeak Round Shield',
        cloak: 'Ironpeak Bear Cloak'
    }, 'Warrior Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 13, -Math.PI / 2, asset('/items/wardancer-statue.glb'), 0.7, 1, 0, {
        head: 'Amethyst Wardancer Helm',
        chest: 'Amethyst Wardancer Cuirass',
        hands: 'Amethyst Wardancer Bracers',
        legs: 'Amethyst Wardancer Leggings',
        feet: 'Amethyst Wardancer Sabatons',
        leftHand: 'Amethyst Wardancer Dagger',
        cloak: 'Amethyst Wardancer Cloak',
    }, 'Wardancer Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 14, -Math.PI / 2, asset('/items/barbarian-statue.glb'), 0.7, 1, 0, {
        head: 'Storm-Reaver Helmet',
        chest: 'Storm-Reaver Harness',
        hands: 'Storm-Reaver Bracers',
        legs: 'Storm-Reaver Greaves',
        feet: 'Storm-Reaver Sabatons',
        leftHand: 'Storm-Reaver Greataxe',
        cloak: 'Storm-Reaver Pelt'
    }, 'Barbarian Armor Stand', 0.35);
    addArmourStand(group, loader, 23, 7, -Math.PI / 2, asset('/items/wizard-statue.glb'), 0.7, 1, 0, {
        head: 'Aethelgard Archmage Hood',
        chest: 'Aethelgard Archmage Robe',
        hands: 'Aethelgard Archmage Cuffs',
        legs: 'Aethelgard Archmage Leggings',
        feet: 'Aethelgard Archmage Slippers',
        leftHand: 'Aethelgard Grand Staff',
        cloak: 'Aethelgard Archmage Mantle'
    }, 'Wizard Armour Stand', 0.35);
    addArmourStand(group, loader, 22, 7, -Math.PI / 2, asset('/items/mage-statue.glb'), 0.7, 1, 0, {
        head: 'Seraphic Grace Cowl',
        chest: 'Seraphic Grace Gown',
        hands: 'Seraphic Grace Mitts',
        legs: 'Seraphic Grace Skirt',
        feet: 'Seraphic Grace Sandals',
        leftHand: 'Seraphic Grace Scepter',
        cloak: 'Seraphic Grace Stole'
    }, 'Mage Armor Stand', 0.35);

    // ── Decorative chest beside the merchant ──────────────────────────────────
    addChest(group, loader, 23, 11, -Math.PI / 2, 0.7, [], asset('/items/chest1.glb'), false);

    // ── Dropped torch beside the merchant ─────────────────────────────────────
    addDroppedTorch(group, loader, 23, 11, -Math.PI / 2, 0.8, -0.7);

    // ── Alchemy workshop and anvil (east room) ────────────────────────────────
    addAlchemyWorkshop(group, loader, 19, 14, 0, 0, 0.85);
    addAnvil(group, loader, 19, 7, 0, 0, -0.85, ['Life Essence', 'Life Essence']);

    // ── Trap in east room ─────────────────────────────────────────────────────
    addTrap1(group, loader, 9, 18);
}

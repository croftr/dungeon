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
        addDecoration, addHeroDoor,
        createWallButton,
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


    // ── Decorative chest beside the merchant ──────────────────────────────────
    addChest(group, loader, 23, 11, -Math.PI / 2, 0.7, [], asset('/items/chest1.glb'), false);

    // ── Dropped torch beside the merchant ─────────────────────────────────────
    addDroppedTorch(group, loader, 23, 11, -Math.PI / 2, 0.8, -0.7);

    // ── Alchemy workshop and anvil (east room) ────────────────────────────────
    addAlchemyWorkshop(group, loader, 19, 14, 0, 0, 0.85);

    // ── Hero door — south wall of east room, leads to Hall of Heroes (level 5) ─
    addHeroDoor(group, loader, 21, 14);
    addAnvil(group, loader, 19, 7, 0, 0, -0.85, ['Life Essence', 'Life Essence']);

    // ── Trap in east room ─────────────────────────────────────────────────────
    addTrap1(group, loader, 9, 18);
}

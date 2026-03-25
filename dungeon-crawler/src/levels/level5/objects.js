import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 5 – Hall of Heroes
//  Large rectangular hall with 8 short passages, each gated by a portcullis.
//  A button next to each portcullis opens it.
//  A return portal in the south of the hall leads back to Level 0.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel5Objects(ctx) {
    const {
        group, loader,
        addPortal,
        addPortcullis,
        createWallButton,
        addArmourStand,
    } = ctx;

    const C = 2; // CELL size in world units

    // ── 8 Portcullis gates ────────────────────────────────────────────────────
    // North passages — bars span east-west (rotY=0), block northward movement
    addPortcullis(group, loader, 10, 7,  0);            // North A: col 10, row 7
    addPortcullis(group, loader, 15, 7,  0);            // North B: col 15, row 7
    // South passages
    addPortcullis(group, loader, 10, 17, 0);            // South A: col 10, row 17
    addPortcullis(group, loader, 15, 17, 0);            // South B: col 15, row 17
    // West passages — bars span north-south (rotY=π/2), block westward movement
    addPortcullis(group, loader, 7, 10,  Math.PI / 2); // West A: col 7, row 10
    addPortcullis(group, loader, 7, 14,  Math.PI / 2); // West B: col 7, row 14
    // East passages
    addPortcullis(group, loader, 18, 10, Math.PI / 2); // East A: col 18, row 10
    addPortcullis(group, loader, 18, 14, Math.PI / 2); // East B: col 18, row 14

    // ── Buttons ───────────────────────────────────────────────────────────────
    // Each button is mounted on the wall cell beside its passage entrance.
    // userData includes portcullisRow/Col (what to open) and wallRow/Col
    // (the cell the player must face, checked by isInFrontOfPlayer).
    // animAxis/animDir drive the press animation in the click handler.

    // North A — wall cell (7,9) south face, player at (8,9) faces north
    const btnNA = createWallButton(+1,
        { portcullisRow: 7, portcullisCol: 10, wallRow: 7, wallCol: 9, animAxis: 'z', animDir: 1 },
        'z');
    btnNA.group.position.set(9 * C, 1.25, 7 * C + 0.95);
    group.add(btnNA.group);

    // North B — wall cell (7,14) south face, player at (8,14) faces north
    const btnNB = createWallButton(+1,
        { portcullisRow: 7, portcullisCol: 15, wallRow: 7, wallCol: 14, animAxis: 'z', animDir: 1 },
        'z');
    btnNB.group.position.set(14 * C, 1.25, 7 * C + 0.95);
    group.add(btnNB.group);

    // South A — wall cell (17,9) north face, player at (16,9) faces south
    const btnSA = createWallButton(-1,
        { portcullisRow: 17, portcullisCol: 10, wallRow: 17, wallCol: 9, animAxis: 'z', animDir: -1 },
        'z');
    btnSA.group.position.set(9 * C, 1.25, 17 * C - 0.95);
    group.add(btnSA.group);

    // South B — wall cell (17,14) north face, player at (16,14) faces south
    const btnSB = createWallButton(-1,
        { portcullisRow: 17, portcullisCol: 15, wallRow: 17, wallCol: 14, animAxis: 'z', animDir: -1 },
        'z');
    btnSB.group.position.set(14 * C, 1.25, 17 * C - 0.95);
    group.add(btnSB.group);

    // West A — wall cell (9,7) east face, player at (9,8) faces west
    const btnWA = createWallButton(+1,
        { portcullisRow: 10, portcullisCol: 7, wallRow: 9, wallCol: 7, animAxis: 'x', animDir: 1 },
        'x');
    btnWA.group.position.set(7 * C + 0.95, 1.25, 9 * C);
    group.add(btnWA.group);

    // West B — wall cell (13,7) east face, player at (13,8) faces west
    const btnWB = createWallButton(+1,
        { portcullisRow: 14, portcullisCol: 7, wallRow: 13, wallCol: 7, animAxis: 'x', animDir: 1 },
        'x');
    btnWB.group.position.set(7 * C + 0.95, 1.25, 13 * C);
    group.add(btnWB.group);

    // East A — wall cell (9,18) west face, player at (9,17) faces east
    const btnEA = createWallButton(-1,
        { portcullisRow: 10, portcullisCol: 18, wallRow: 9, wallCol: 18, animAxis: 'x', animDir: -1 },
        'x');
    btnEA.group.position.set(18 * C - 0.95, 1.25, 9 * C);
    group.add(btnEA.group);

    // East B — wall cell (13,18) west face, player at (13,17) faces east
    const btnEB = createWallButton(-1,
        { portcullisRow: 14, portcullisCol: 18, wallRow: 13, wallCol: 18, animAxis: 'x', animDir: -1 },
        'x');
    btnEB.group.position.set(18 * C - 0.95, 1.25, 13 * C);
    group.add(btnEB.group);

    // ── Return portal ─────────────────────────────────────────────────────────
    // (col 12, row 16) — south end of the hall. Returns the party to Level 0.
    addPortal(group, loader, 12, 16, 0, 0, 0, 0);

    // ── Armour stands — one behind each portcullis ────────────────────────────
    // Statues face inward (toward the portcullis / player).
    // offsetX / offsetZ push them against the passage end wall.
    //
    // North passages: row 5, facing south (rotY = 0), pushed against north wall
    addArmourStand(group, loader, 10, 5, 0,
        asset('/items/wizard-statue.glb'), 0.7, 0, -0.7, {
            head: 'Aethelgard Archmage Hood',
            chest: 'Aethelgard Archmage Robe',
            hands: 'Aethelgard Archmage Cuffs',
            legs: 'Aethelgard Archmage Leggings',
            feet: 'Aethelgard Archmage Slippers',
            leftHand: 'Aethelgard Grand Staff',
            cloak: 'Aethelgard Archmage Mantle',
        }, 'Wizard Armour Stand', -0.3);

    addArmourStand(group, loader, 15, 5, 0,
        asset('/items/mage-statue.glb'), 0.7, 0, -0.7, {
            head: 'Seraphic Grace Cowl',
            chest: 'Seraphic Grace Gown',
            hands: 'Seraphic Grace Mitts',
            legs: 'Seraphic Grace Skirt',
            feet: 'Seraphic Grace Sandals',
            leftHand: 'Seraphic Grace Scepter',
            cloak: 'Seraphic Grace Stole',
            ammo: 'Seraphic Spellbook',
        }, 'Mage Armor Stand', -0.3);

    // South passages: row 19, facing north (rotY = π), pushed against south wall
    addArmourStand(group, loader, 10, 19, Math.PI,
        asset('/items/dwarf-ranger-statue.glb'), 0.7, 0, 0.7, {
            head: 'Mountain Stalker Hood',
            chest: 'Mountain Stalker Trenchcoat',
            hands: 'Mountain Stalker Gloves',
            legs: 'Mountain Stalker Trousers',
            feet: 'Mountain Stalker Boots',
            leftHand: 'Mountain Stalker Crossbow',
            cloak: 'Mountain Stalker Heavy Cloak',
        }, 'Dwarf Ranger Armor Stand', -0.4);

    addArmourStand(group, loader, 15, 19, Math.PI,
        asset('/items/woodelf-statue.glb'), 0.7, 0, 0.7, {
            head: 'Sylvan Elderwood Hood',
            chest: 'Sylvan Elderwood Tunic',
            hands: 'Sylvan Elderwood Bracers',
            legs: 'Sylvan Elderwood Leggings',
            feet: 'Sylvan Elderwood Boots',
            leftHand: 'Sylvan Elderwood Bow',
            cloak: 'Sylvan Elderwood Cloak',
        }, 'Woodelf Armor Stand', -0.3);

    // West passages: col 5, facing east (rotY = π/2), pushed against west wall
    addArmourStand(group, loader, 5, 10, Math.PI / 2,
        asset('/items/paladin-statue.glb'), 0.7, -0.7, 0, {
            head: 'Celestial Vindicator Helm',
            chest: 'Celestial Vindicator Cuirass',
            hands: 'Celestial Vindicator Gauntlets',
            legs: 'Celestial Vindicator Leggings',
            feet: 'Celestial Vindicator Sabatons',
            leftHand: 'Celestial Vindicator Greatmace',
            cloak: 'Celestial Vindicator Cloak',
        }, 'Paladin Armor Stand', -0.3);

    addArmourStand(group, loader, 5, 14, Math.PI / 2,
        asset('/items/dwarf-warrior-statue.glb'), 0.7, -0.7, 0, {
            head: 'Ironpeak Dwarf Helm',
            chest: 'Ironpeak Dwarf Cuirass',
            hands: 'Ironpeak Dwarf Gauntlets',
            legs: 'Ironpeak Dwarf Greaves',
            feet: 'Ironpeak Dwarf Sabatons',
            leftHand: 'Ironpeak Battleaxe',
            rightHand: 'Ironpeak Round Shield',
            cloak: 'Ironpeak Bear Cloak',
        }, 'Warrior Armor Stand', -0.3);

    // East passages: col 20, facing west (rotY = -π/2), pushed against east wall
    addArmourStand(group, loader, 20, 10, -Math.PI / 2,
        asset('/items/wardancer-statue.glb'), 0.7, 0.7, 0, {
            head: 'Amethyst Wardancer Helm',
            chest: 'Amethyst Wardancer Cuirass',
            hands: 'Amethyst Wardancer Bracers',
            legs: 'Amethyst Wardancer Leggings',
            feet: 'Amethyst Wardancer Sabatons',
            leftHand: 'Amethyst Wardancer Dagger',
            cloak: 'Amethyst Wardancer Cloak',
        }, 'Wardancer Armor Stand', -0.3);

    addArmourStand(group, loader, 20, 14, -Math.PI / 2,
        asset('/items/barbarian-statue.glb'), 0.7, 0.7, 0, {
            head: 'Storm-Reaver Helmet',
            chest: 'Storm-Reaver Harness',
            hands: 'Storm-Reaver Bracers',
            legs: 'Storm-Reaver Greaves',
            feet: 'Storm-Reaver Sabatons',
            leftHand: 'Storm-Reaver Greataxe',
            cloak: 'Storm-Reaver Pelt',
        }, 'Barbarian Armor Stand', -0.3);
}

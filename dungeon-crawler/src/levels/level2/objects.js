import * as THREE from 'three';
import { CELL } from '../../map.js';
import { asset } from '../../assets.js';
import { playNpcDialogue } from '../../audio.js';
import { showDramaticUnlock } from '../../dramatic-banner.js';

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
        addSpellCabinet, addPortalActivatorStatue,
        createWallButton, addCustomNPC,
        level2PortcullisOpened,
        level2GiantPortcullisOpened,
        level2WardenGateOpened,
        stanceNpcDeparted,
        setStanceNpcDeparted,
    } = ctx;


    // ── Portal back to Level 0 ────────────────────────────────────────────────
    // Shifted from col 2 to col 12
    addPortal(group, loader, 12, 1, 0, Math.PI / 2, -0.85, 0, 13, 13, 0);

    // ── New passage: Portcullis & Wall Button ─────────────────────────────────
    // Closed portcullis at col 6, row 4 in the divided room (cols 3-5 and 7-9 separated by col 6)
    addPortcullis(group, loader, 6, 4, Math.PI / 2, level2WardenGateOpened);

    // Bear trap in the chest room — springs when the wardens come alive
    if (!level2WardenGateOpened) addTrap1(group, loader, 4, 5);

    // Button to open the gate, placed on the south face of the north wall of the anteroom at col 8, row 2
    const { group: gateBtn } = createWallButton(+1, {
        portcullisRow: 4,
        portcullisCol: 6,
        wallRow: 2,
        wallCol: 8,
        animAxis: 'z',
        animDir: +1
    }, 'z');
    gateBtn.position.set(8 * CELL, 1.25, 2 * CELL + 1.0);
    group.add(gateBtn);

    // ── Spell Cabinets ────────────────────────────────────────────────────────
    // Shifted from col 5, row 3 to col 15, row 3
    addSpellCabinet(group, loader, 15, 3, 0, 0, -0.7, ["Scroll of Resist Ice", "Scroll of Resist Fire", "Trapper's Manual"]);
    // Shifted from col 2, row 8 to col 12, row 8
    addSpellCabinet(group, loader, 12, 8, Math.PI / 2, -0.7, 0, ['Scroll of Lightningbolt', 'Scroll of Fireball']);

    // ── Chests ────────────────────────────────────────────────────────────────
    // Chest behind the Warden gate (col 3, row 4)
    addChest(group, loader, 3, 4, Math.PI / 2, 0.7, [
        "Schematic Key",
        "Ice Axe",
        "Ice Dagger",
        "Ice Greataxe",
        "Ice Arrows",
        "Trapper's Manual"
    ]);

    // Shifted from col 9, row 13 to col 19, row 13
    addChest(group, loader, 19, 13, Math.PI, 0.7, [
        'Poison Dagger', 'Life Orb',
        "Three Eyed Familiar",
        { name: 'Gold Coins', quantity: 30 }
    ]);

    // Ice gauntlet reward chest (shifted from col 3, row 14 to col 13, row 14)
    addChest(group, loader, 13, 14, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 150 },
        "Hoarfrost Mantle",
        "Padded Vest",
        "Testament of Faith",
        "Schematic Key"
    ]);

    // ── Portcullises & Keys ───────────────────────────────────────────────────
    // Locked portcullis at the passage entrance (shifted from col 7, row 23 to col 17, row 23)
    addPortcullis(group, loader, 17, 23, 0, level2PortcullisOpened);

    // Keyhole next to the main-entrance portcullis (shifted from col 7, row 23 to col 17, row 23)
    addKeyhole(group, loader, 17, 23, Math.PI / 2, -0.85, -2.0);

    // Portcullis on the WEST wall of the demon room (shifted from col 2, row 32 to col 12, row 32)
    addPortcullis(group, loader, 12, 32, Math.PI / 2);

    // Button on the EAST face of col-12 wall, one row south of the portcullis
    const { group: demonBtn } = createWallButton(+1, { target: 'demon_room' });
    demonBtn.position.set(12 * CELL + 1.0, 1.25, 33 * CELL);
    group.add(demonBtn);

    // ── Giant Room ────────────────────────────────────────────────────────────
    // Bone-key portcullis (shifted from col 9, row 30 to col 19, row 30)
    addPortcullis(group, loader, 19, 30, Math.PI / 2, level2GiantPortcullisOpened);

    // Keyhole on the west face of the portcullis (shifted col 9 -> 19, targetCol 9 -> 19)
    addKeyhole(group, loader, 19, 30, -Math.PI / 2, -1.1, -1.3, 30, 19, 'Bone Key');

    // ── Chests ────────────────────────────────────────────────────────────────
    // Two chests in the chest vault (shifted col 0.7 / 1.3 -> 10.7 / 11.3)
    addChest(group, loader, 10.7, 34, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 20 },
        "Trapper's Manual", 'Scroll of Incinerate',
        "Talisman of the Wind"
    ]);
    addChest(group, loader, 11.3, 34, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 10 },
        'Ring of Strength', 'Ring of Wisdom', 'Ring of Balance',
        "Bulwark of the Ancestors"
    ]);

    // Ethereal Egg in the centre of the demon room (shifted col 5 -> 15)
    addPortalActivatorStatue(group, loader, 15, 31, 0, 0.45, ['Red Crystal']);

    // Chest at col 38 north side (shifted from col 28 -> 38)
    addChest(group, loader, 38, 32, -Math.PI / 2, -0.5, [
        { name: 'Gold Coins', quantity: 50 },
        'Mana Potion',
        "Bloodstone Amulet", "Schematic Key"
    ], asset('/items/chest1.glb'), true, 0.5);

    // Ethereal Egg at col 38 south side (shifted from col 28 -> 38)
    addPortalActivatorStatue(group, loader, 38, 32, Math.PI / 2, 0.45, ['Blue Crystal'], 0, 0.5);

    // Chest in the NE corner of the giant room (shifted from col 24 -> 34)
    addChest(group, loader, 34, 17, -Math.PI / 2, 0.7, [
        { name: 'Gold Coins', quantity: 50 },
        'Starlight Nectar'
    ], asset('/items/chest1.glb'), true, -0.5);

    // ── Stairs ────────────────────────────────────────────────────────────────
    // Shifted from col 3, row 41 to col 13, row 41
    addStairs(group, loader, 13, 41, Math.PI, { x: 1.25, y: 0.7, z: 0.7 }, 0, 0.25);

    // ── Buttons ───────────────────────────────────────────────────────────────
    // Button to close the hole (shifted from col 25 -> 35, gridCol 28 -> 38)
    const { group: closeHoleBtn } = createWallButton(+1, { target: 'close_hole', gridRow: 31, gridCol: 38 });
    closeHoleBtn.position.set(35 * CELL, 1.25, 31 * CELL + 1.0);
    closeHoleBtn.rotation.y = -Math.PI / 2;
    group.add(closeHoleBtn);

    // ── Traps ─────────────────────────────────────────────────────────────────
    // Shifted from col 10 -> 20, col 17 -> 27
    addTrap1(group, loader, 32, 20);
    addTrap1(group, loader, 32, 27);

    // ── Crow-annex corridor portcullis & button ───────────────────────────────
    // Shifted from col 24 -> 34
    addPortcullis(group, loader, 34, 4, 0);

    // Shifted portcullisCol 24 -> 34, wallCol 25 -> 35, stanceCorridorBtn col 25 -> 35
    const { group: stanceCorridorBtn } = createWallButton(-1,
        { portcullisRow: 4, portcullisCol: 34, wallRow: 6, wallCol: 35, animAxis: 'x', animDir: -1 },
        'x');
    stanceCorridorBtn.position.set(35 * CELL - 1.0, 1.25, 6 * CELL);
    group.add(stanceCorridorBtn);

    // ── Stance NPC ────────────────────────────────────────────────────────────
    if (!stanceNpcDeparted) {
        // Shifted from col 24 -> 34
        addCustomNPC(
            group,
            loader,
            34,          // col
            1,           // row
            '/npcs/stance-npc/Meshy_AI_Dragonborn_Magier_mit_biped_Animation_Stand_and_Chat_withSkin.glb',
            null,
            0.55,
            0.4,
            0,
            0,
            null,
            2,
            '/npcs/stance-npc/intro.mp3',
            '/npcs/stance-npc/Meshy_AI_Dragonborn_Magier_mit_biped_Animation_Talk_with_Left_Hand_on_Hip_withSkin.glb',
            null,
            null,
            (model) => {
                model.traverse(child => {
                    if (!child.userData?.isDialogueNPC) return;
                    child.userData.onAudioEnd = () => {
                        if (model.userData.talkAction && model.userData.idleAction) {
                            model.userData.idleAction.fadeOut(0.2);
                            model.userData.talkAction.reset().fadeIn(0.2).play();
                        }
                        // Shifted NpcDialogue from col 24 -> 34
                        setTimeout(() => {
                            playNpcDialogue(1, 34, '/npcs/stance-npc/outro.mp3', 0.8, () => {
                                _despawnWithFlash(model, group, () => {
                                    setStanceNpcDeparted(true);
                                    showDramaticUnlock(
                                        'Stances Unlocked',
                                        'A new tutor has set up shop in town — visit him to learn combat stances'
                                    );
                                });
                            });
                        }, 2000);
                    };
                });
            }
        );
    }
}

function _despawnWithFlash(model, scene, onComplete) {
    const light = new THREE.PointLight(0xffffff, 14, 7);
    light.position.copy(model.position);
    light.position.y += 1.2;
    scene.add(light);

    const startScale = model.scale.x;
    const start = performance.now();
    const duration = 600;

    function tick() {
        if (!model.parent) return;
        const t = Math.min((performance.now() - start) / duration, 1);
        model.scale.setScalar(startScale * (1 - t));
        light.intensity = 14 * (1 - t);
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            model.visible = false;
            if (light.parent) scene.remove(light);
            if (onComplete) onComplete();
        }
    }
    requestAnimationFrame(tick);
}

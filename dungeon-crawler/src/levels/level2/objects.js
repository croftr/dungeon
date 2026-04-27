import * as THREE from 'three';
import { CELL } from '../../map.js';
import { asset } from '../../assets.js';
import { playNpcDialogue } from '../../audio.js';

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
        stanceNpcDeparted,
        setStanceNpcDeparted,
    } = ctx;


    // ── Portal back to Level 0 ────────────────────────────────────────────────
    addPortal(group, loader, 7, 1, 0, 0, 0, -0.85, 13, 13, 0);

    // ── New area: Spell Cabinet (Room A, north wall, row 3 col 5) ─────────────
    addSpellCabinet(group, loader, 5, 3, 0, 0, -0.7, ["Scroll of Holybolt", "Scroll of Darkbolt"]);
    addSpellCabinet(group, loader, 2, 8, Math.PI / 2, -0.3, -0.7, ['Scroll of Lightningbolt', 'Scroll of Incinerate']);

    // ── New area: Chest (Room C, south wall, row 13 col 9) ───────────────────
    addChest(group, loader, 9, 13, Math.PI, 0.7, [
        'Poison Arrows', 'Poison Dagger', 'Life Orb',
        { name: 'Gold Coins', quantity: 10 }
    ]);

    // ── Portcullises & Keys ───────────────────────────────────────────────────
    // Locked portcullis at the passage entrance (col 7, row 23) — requires Bronze Key
    addPortcullis(group, loader, 7, 23, 0, level2PortcullisOpened);

    // Keyhole next to the main-entrance portcullis (north wall, west side)
    addKeyhole(group, loader, 7, 23, Math.PI / 2, -0.85, -2.0);

    // Portcullis on the WEST wall of the demon room (col 2, row 32)
    addPortcullis(group, loader, 2, 32, Math.PI / 2);

    // Button on the EAST face of col-2 wall, one row south of the portcullis
    const { group: demonBtn } = createWallButton(+1, { target: 'demon_room' });
    demonBtn.position.set(2 * CELL + 1.0, 1.25, 33 * CELL);
    group.add(demonBtn);

    // ── Giant Room ────────────────────────────────────────────────────────────
    // Bone-key portcullis on the east wall of the main room (col 9, row 30).
    addPortcullis(group, loader, 9, 30, Math.PI / 2, level2GiantPortcullisOpened);

    // Keyhole on the west face of the portcullis — visible from the main room.
    addKeyhole(group, loader, 9, 30, -Math.PI / 2, -1.1, -1.3, 30, 9, 'Bone Key');

    // ── Chests ────────────────────────────────────────────────────────────────
    // Two chests in the chest vault (col 1, rows 33–34)
    addChest(group, loader, 0.7, 34, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 10 },
        'Life Essence', 'Mana Berry', 'Scroll of Fireball'
    ]);
    addChest(group, loader, 1.3, 34, Math.PI, 0.7, [
        { name: 'Gold Coins', quantity: 10 },
        'Ring of Strength', 'Ring of Wisdom', 'Ring of Dexterity'
    ]);

    // Ethereal Egg in the centre of the demon room — contains Red Crystal
    addPortalActivatorStatue(group, loader, 5, 31, 0, 0.45, ['Red Crystal']);

    // Chest at col 28 north side — side by side with the egg against the east wall
    addChest(group, loader, 28, 32, -Math.PI / 2, -0.5, [
        { name: 'Gold Coins', quantity: 10 },
        'Ruby Ring', 'Mana Potion', 'Life Essence',
        'Chain Shirt', 'Plate Cuirass'
    ], asset('/items/chest1.glb'), true, 0.5);

    // Ethereal Egg at col 28 south side — side by side with the chest
    addPortalActivatorStatue(group, loader, 28, 32, Math.PI / 2, 0.45, ['Blue Crystal'], 0, 0.5);

    // Chest in the NE corner of the giant room
    addChest(group, loader, 24, 17, -Math.PI / 2, 0.7, [
        { name: 'Gold Coins', quantity: 20 },
        'Starlight Nectar'
    ], asset('/items/chest1.glb'), true, -0.5);

    // ── Stairs ────────────────────────────────────────────────────────────────
    addStairs(group, loader, 3, 41, Math.PI, { x: 1.25, y: 0.7, z: 0.7 }, 0, 0.25);

    // ── Buttons ───────────────────────────────────────────────────────────────
    // Button to close the hole — moved forward (west) to col 25 so player can reach it past the chest and egg
    const { group: closeHoleBtn } = createWallButton(+1, { target: 'close_hole', gridRow: 31, gridCol: 28 });
    closeHoleBtn.position.set(25 * CELL, 1.25, 31 * CELL + 1.0);
    closeHoleBtn.rotation.y = -Math.PI / 2;
    group.add(closeHoleBtn);

    // ── Traps ─────────────────────────────────────────────────────────────────
    addTrap1(group, loader, 32, 10);  // long east passage (row 32, col 10)
    addTrap1(group, loader, 32, 17);  // corridor further along east passage (row 32, col 17)

    // ── Stance NPC (crow annex room, back wall) ───────────────────────────────
    // Only spawn on level 2 if he hasn't departed yet
    if (!stanceNpcDeparted) {
        addCustomNPC(
            group,
            loader,
            24,          // col — centre of annex room
            1,           // row — back (north) wall
            '/npcs/stance-npc/Meshy_AI_Dragonborn_Magier_mit_biped_Animation_Stand_and_Chat_withSkin.glb',
            null,        // no text dialogue
            0.55,        // scale
            0.4,         // rotY — face south, angled slightly left (toward east)
            0,           // offsetX
            0,           // offsetZ
            null,        // no proximity audio
            2,           // proximityRange
            '/npcs/stance-npc/intro.mp3',   // arg[12]: click audio (intro)
            '/npcs/stance-npc/Meshy_AI_Dragonborn_Magier_mit_biped_Animation_Talk_with_Left_Hand_on_Hip_withSkin.glb', // arg[13]: talk anim
            null,        // arg[14]: no fallback audio
            null,        // arg[15]: onAudioEnd — set via onModelLoaded below
            (model) => { // arg[16]: onModelLoaded
                model.traverse(child => {
                    if (!child.userData?.isDialogueNPC) return;
                    child.userData.onAudioEnd = () => {
                        // Re-enter talking animation for the outro
                        if (model.userData.talkAction && model.userData.idleAction) {
                            model.userData.idleAction.fadeOut(0.2);
                            model.userData.talkAction.reset().fadeIn(0.2).play();
                        }
                        // Play outro, then flash-despawn
                        playNpcDialogue(1, 24, '/npcs/stance-npc/outro.mp3', 0.8, () => {
                            _despawnWithFlash(model, group, () => {
                                setStanceNpcDeparted(true);
                            });
                        });
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
        if (!model.parent) return; // guard: level changed mid-animation
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

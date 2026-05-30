import * as THREE from 'three';
import { CELL } from '../../map.js';
import { playNpcDialogue } from '../../audio.js';
import { showDramaticUnlock } from '../../dramatic-banner.js';
import { addMistPortal } from '../mist-portal.js';

// ─────────────────────────────────────────────────────────────────────────────
//  CROW REALM (level 60) — objects.
//  Spawned only while the party is inside the realm (see spawnObjectsForLevel).
// ─────────────────────────────────────────────────────────────────────────────

export function spawnCrowRealmObjects(ctx) {
    const {
        group, loader,
        addPortcullis, addKeyhole, addCustomNPC,
        stanceNpcDeparted,
        setStanceNpcDeparted,
        crowRealmPortcullisOpened,
        interactables,
    } = ctx;

    // ── Return mist ───────────────────────────────────────────────────────────
    // West dead-end of the entry corridor (row 8, col 25). Walking into it (or
    // clicking it) prompts the party and warps them back out to Level 2.
    addMistPortal(group, interactables, 25, 8, {
        axis: 'ew',
        enterDir: -1,          // moving west (toward the dead-end) is "entering"
        targetLevel: 2,        // cross-level warp back to the main dungeon
        enterRow: 8,
        enterCol: 24,          // Room B side, just outside the Level 2 entry mist
        enterFacing: 3,        // West
        offsetX: -CELL / 2,    // flush against the west wall
    });

    // ── Crow-annex corridor portcullis & keyhole ──────────────────────────────
    addPortcullis(group, loader, 34, 4, 0, crowRealmPortcullisOpened);

    // Keyhole next to the annex-corridor portcullis, placed on the west face of the east wall at col 35, row 6 (cell 34, 6)
    addKeyhole(group, loader, 34, 6, -Math.PI / 2, 0.85, 0, 4, 34, 'Crow Key');

    // ── Stance NPC ─────────────────────────────────────────────────────────────
    if (!stanceNpcDeparted) {
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

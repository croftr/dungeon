import * as THREE from 'three';
import { party } from './party.js';
import { extendPartyData } from './equipment.js';
import { showInlineHelp } from './help.js';
import { CELL, WALL_H, findCell } from './map.js';
import { isInFrontOfPlayer } from './player.js';
import { interactables } from './objects.js';
import RECRUITS_DATA from './data/recruits.json';
import { checkLevelUp } from './leveling.js';
import { asset } from './assets.js';

const _recruitRaycaster = new THREE.Raycaster();
const _recruitMouse = new THREE.Vector2();

function getJobIcon(job) {
    const jobKey = job.toLowerCase().replace(' ', '-');
    return `/skills/jobs/${jobKey}.webp`;
}

function getRaceIcon(race) {
    // Map both Wood Elf and High Elf to the generic elf icon
    const raceKey = race.toLowerCase().includes('elf') ? 'elf' : race.toLowerCase();
    return `/skills/race/${raceKey}.webp`;
}
import SKILLS_DATA from './data/skills.json';

// Hydrate skill progression strings into full skill objects using skills.json definitions
function hydrateSkillName(skillName) {
    const def = SKILLS_DATA[skillName];
    if (!def) {
        console.warn(`Skill "${skillName}" not found in skills.json`);
        return { name: skillName };
    }
    return {
        name: skillName,
        type: def.type,
        delay: (def.cooldownMs || 0) / 1000,
        description: def.description,
        icon: def.icon,
        ...(def.attackType ? { attackType: def.attackType } : {}),
    };
}

export const RECRUITS = RECRUITS_DATA.map(r => ({
    ...r,
    startingSkills: (r.startingSkills || []).map(hydrateSkillName),
    startingSpells: r.startingSpells || [],
}));

let uiContainer = null;

export function initRecruits(scene, camera) {
    const loader = new THREE.TextureLoader();

    // Create soft blending alpha map to blend the portraits into the stone walls seamlessly
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 128;
    alphaCanvas.height = 128;
    const ax = alphaCanvas.getContext('2d');

    // Fill background black (fully transparent)
    ax.fillStyle = 'black';
    ax.fillRect(0, 0, 128, 128);

    // Draw white gradient in center (fully opaque fading to transparent)
    const grad = ax.createRadialGradient(64, 64, 35, 64, 64, 60);
    grad.addColorStop(0, 'white');
    grad.addColorStop(1, 'black');
    ax.fillStyle = grad;
    ax.fillRect(0, 0, 128, 128);

    const alphaTex = new THREE.CanvasTexture(alphaCanvas);

    // PlaneGeometry for wall frescoes
    const frameGeo = new THREE.PlaneGeometry(0.8, 0.8);

    // Draw them as embedded wall frescoes
    RECRUITS.forEach(r => {
        // We use transparent: true and our alphaMap so edges fade into the procedural wall.
        // Stone tint (0xa09080) multiplied over a greyscale image gives a carved-stone look.
        const picMat = new THREE.MeshLambertMaterial({
            alphaMap: alphaTex,
            transparent: true,
            color: 0xa09080,
            depthWrite: false // prevents z-sorting transparency artifacts
        });

        // Load image, desaturate via canvas filter, then apply as texture
        const img = new Image();
        img.onload = () => {
            const grayCanvas = document.createElement('canvas');
            grayCanvas.width = img.naturalWidth || 256;
            grayCanvas.height = img.naturalHeight || 256;
            const gctx = grayCanvas.getContext('2d');
            gctx.filter = 'grayscale(1)';
            gctx.drawImage(img, 0, 0);
            const map = new THREE.CanvasTexture(grayCanvas);
            map.magFilter = THREE.LinearFilter;
            map.minFilter = THREE.LinearMipmapLinearFilter;
            map.anisotropy = 16;
            picMat.map = map;
            picMat.needsUpdate = true;
        };
        img.src = asset(r.image);

        const mesh = new THREE.Mesh(frameGeo, picMat);

        // Position them just slightly proud of the walls!
        let wx = r.gridCol * CELL;
        let wz = r.gridRow * CELL;

        if (r.facing === 'front') {   // Look South (+Z)
            wz += 1.01;
            mesh.rotation.y = 0;
        } else if (r.facing === 'back') { // Look North (-Z)
            wz -= 1.01;
            mesh.rotation.y = Math.PI;
        } else if (r.facing === 'left') { // Look West (-X)
            wx -= 1.01;
            mesh.rotation.y = -Math.PI / 2;
        } else if (r.facing === 'right') { // Look East (+X)
            wx += 1.01;
            mesh.rotation.y = Math.PI / 2;
        }

        mesh.position.set(wx, WALL_H * 0.5, wz);
        mesh.userData = { isRecruit: true, recruitId: r.id };
        interactables.push(mesh);

        scene.add(mesh);
        r.mesh = mesh;
        r.box = mesh; // solid mesh can be used for raycaster directly
    });

    // Setup UI container
    uiContainer = document.createElement('div');
    uiContainer.id = 'recruit-modal';
    uiContainer.style.display = 'none';
    // inline styles for now
    uiContainer.style.position = 'fixed';
    uiContainer.style.top = '50%';
    uiContainer.style.left = '50%';
    uiContainer.style.transform = 'translate(-50%, -50%)';
    uiContainer.style.background = 'radial-gradient(circle at center, rgba(30, 20, 15, 0.95), rgba(10, 7, 4, 0.98))';
    uiContainer.style.border = '2px solid rgba(200, 168, 74, 0.4)';
    uiContainer.style.boxShadow = '0 0 40px rgba(0,0,0,0.8), inset 0 0 20px rgba(200, 168, 74, 0.1)';
    uiContainer.style.padding = '30px';
    uiContainer.style.borderRadius = '8px';
    uiContainer.style.color = '#e8c87a';
    uiContainer.style.zIndex = '2000';
    uiContainer.style.fontFamily = 'Georgia, serif';
    uiContainer.style.width = '600px';
    uiContainer.style.boxSizing = 'border-box';
    document.body.appendChild(uiContainer);

    window.addEventListener('click', (e) => {
        // If the click was inside the recruitment modal, ignore it here
        if (uiContainer.contains(e.target)) return;

        if (uiContainer.style.display === 'block') {
            return;
        }

        // Raycast to find clicks on recruits
        _recruitMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        _recruitMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        _recruitRaycaster.setFromCamera(_recruitMouse, camera);
        const intersects = _recruitRaycaster.intersectObjects(interactables, false);

        for (let hit of intersects) {
            if (hit.object.userData.isRecruit && hit.object.visible) {
                const recruitId = hit.object.userData.recruitId;
                const r = RECRUITS.find(x => x.id === recruitId);
                // Only allow interaction if the player is directly facing the recruit
                if (r && isInFrontOfPlayer(r.gridRow, r.gridCol, 1)) {
                    openRecruitModal(recruitId);
                }
                break;
            }
        }
    });
}

export function updateRecruitsMeshState() {
    const currentLevel = window.currentLevel ?? 0;
    RECRUITS.forEach(r => {
        if (r.isRecruited || currentLevel !== 0) {
            r.mesh.visible = false;
        } else {
            r.mesh.visible = true;
        }
    });
}

function openRecruitModal(recruitId) {
    const r = RECRUITS.find(x => x.id === recruitId);
    if (!r || r.isRecruited) return;

    const freeSlot = party.find(m => m.isEmpty);
    const canRecruit = !!freeSlot;

    const mediaHtml = r.recruitVideo
        ? `<video src="${asset(r.recruitVideo)}" autoplay loop muted playsinline style="width: 250px; height: 350px; object-fit: cover; border-radius: 4px; border: 1px solid #c8a84a; box-shadow: 0 0 15px rgba(200, 168, 74, 0.3); background: #000;"></video>`
        : `<img src="${asset(r.image)}" style="width: 250px; height: 350px; object-fit: cover; border-radius: 4px; border: 1px solid #c8a84a; box-shadow: 0 0 15px rgba(200, 168, 74, 0.3); image-rendering: pixelated; background: #000;">`;

    uiContainer.innerHTML = `
    <div style="display: flex; gap: 30px;">
        <div style="flex-shrink: 0;">
            ${mediaHtml}
        </div>
        <div style="display: flex; flex-direction: column; justify-content: center; flex: 1;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px;">
                <h2 style="margin: 0; color: #fff; font-size: 32px; font-weight: normal; letter-spacing: 1px; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${r.name}</h2>
                <img src="${asset(getJobIcon(r.job))}" style="width: 48px; height: 48px; border: 1px solid rgba(200, 168, 74, 0.4); border-radius: 4px; box-shadow: 0 0 15px rgba(200, 168, 74, 0.2); background: rgba(0,0,0,0.3); padding: 2px;">
            </div>
            <div style="margin: 0 0 20px 0; font-size: 16px; color: #c8a84a; text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 8px;">
                <img src="${asset(getRaceIcon(r.race))}" style="width: 24px; height: 24px; opacity: 0.8; filter: drop-shadow(0 0 5px rgba(200,168,74,0.3));">
                <span style="opacity: 0.8;">${r.race}</span>
                <span style="color: #6a5030;">•</span>
                <span style="font-weight: bold;">${r.job}</span>
            </div>
            
            <div style="margin: 0 0 30px 0; font-size: 16px; color: #d0c0a0; line-height: 1.6; font-style: italic; border-left: 3px solid #c8a84a; padding-left: 15px;">
                "${r.bio || 'A mysterious adventurer looking for glory.'}"
            </div>

            <div style="margin-top: auto; display: flex; justify-content: flex-end; gap: 15px;">
              <button id="btn-recruit-close" style="padding: 10px 20px; cursor: pointer; background: rgba(0,0,0,0.5); border: 1px solid #6a5030; color: #a09070; font-family: inherit; font-size: 14px; border-radius: 4px; transition: all 0.2s;">Close</button>
            </div>
        </div>
    </div>
  `;

    uiContainer.style.display = 'block';

    document.getElementById('btn-recruit-close').addEventListener('click', (e) => {
        e.stopPropagation();
        uiContainer.style.display = 'none';
    });

    // Hide buttons if recruited
}


export function recruitCharacter(r) {
    const freeIndex = party.findIndex(m => m.isEmpty);
    if (freeIndex === -1) return;

    r.isRecruited = true;

    // Clone data into the party slot.
    // hp/mp/sp and their maxes are derived from stats by extendPartyData → updateEffectiveStats below.
    party[freeIndex] = {
        id: freeIndex,
        isEmpty: false,
        name: r.name,
        stats: { ...r.stats },
        // Leveling: characters start at level 0 with no skills
        // startXp in recruits.json can be set to a non-zero value for testing
        level: 0,
        xp: r.startXp ?? 0,
        statBonuses: { strength: 0, dexterity: 0, vitality: 0, intelligence: 0, resilience: 0 },
        skillTreeId: r.skillTree ?? null,
        acquiredNodes: ['start'],
        pendingNodePicks: 0,
        pendingNodeChoice: null,
        skills: r.startingSkills ? JSON.parse(JSON.stringify(r.startingSkills)) : [],
        spells: r.startingSpells ? r.startingSpells.map(name => ({name})) : [],
        leftHand: r.leftHand,
        rightHand: r.rightHand,
        ammo: r.ammo,
        image: r.image,
        skinLight: '#e8c8a0', skinDark: '#b08050',
        hairColor: '#8a1a1a',
        irisColor: '#2a6a3a',
        inventory: null,
        startingInventory: r.startingInventory ? [...r.startingInventory] : null,
        equipment: null
    };

    extendPartyData();

    // Apply startXp level-ups so pending node picks are awarded immediately
    if (r.startXp) checkLevelUp(party[freeIndex]);

    if (window.onPartyChanged) window.onPartyChanged();

    showInlineHelp('first-recruit', {
      text: 'Press <strong>I</strong> or click a character\'s portrait to open their inventory and manage equipment.'
    });

    if (party.every(m => !m.isEmpty)) {
      showInlineHelp('party-full', {
        text: 'Your party is complete! Press <strong>P</strong> to open the Party Tactics screen and manage your team.'
      });
    }
}

// ─────────────────────────────────────────────
//  SAVE / RESTORE
// ─────────────────────────────────────────────
export function captureRecruits() {
  return Object.fromEntries(RECRUITS.map(r => [r.id, !!r.isRecruited]));
}

export function restoreRecruits(data) {
  if (!data) return;
  for (const r of RECRUITS) {
    if (r.id in data) r.isRecruited = data[r.id];
  }
}

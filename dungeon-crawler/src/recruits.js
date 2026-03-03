import * as THREE from 'three';
import { party } from './party.js';
import { extendPartyData } from './equipment.js';
import { CELL, WALL_H, findCell } from './map.js';
import { isInFrontOfPlayer } from './player.js';
import RECRUITS_DATA from './data/recruits.json';
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
    skillProgression: (r.skillProgression || []).map(hydrateSkillName),
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
        const map = loader.load(r.image);
        map.magFilter = THREE.LinearFilter;
        map.minFilter = THREE.LinearMipmapLinearFilter;
        map.anisotropy = 16;
        // We use transparent: true and our alphaMap so edges fade into the procedural wall
        const picMat = new THREE.MeshLambertMaterial({
            map,
            alphaMap: alphaTex,
            transparent: true,
            color: 0xffffff,
            depthWrite: false // prevents z-sorting transparency artifacts
        });

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
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, false);

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
    const currentLevel = window.currentLevel || 1;
    RECRUITS.forEach(r => {
        if (r.isRecruited || currentLevel !== 1) {
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
        ? `<video src="${r.recruitVideo}" autoplay loop muted playsinline style="width: 250px; height: 350px; object-fit: cover; border-radius: 4px; border: 1px solid #c8a84a; box-shadow: 0 0 15px rgba(200, 168, 74, 0.3); background: #000;"></video>`
        : `<img src="${r.image}" style="width: 250px; height: 350px; object-fit: cover; border-radius: 4px; border: 1px solid #c8a84a; box-shadow: 0 0 15px rgba(200, 168, 74, 0.3); image-rendering: pixelated; background: #000;">`;

    uiContainer.innerHTML = `
    <div style="display: flex; gap: 30px;">
        <div style="flex-shrink: 0;">
            ${mediaHtml}
        </div>
        <div style="display: flex; flex-direction: column; justify-content: center; flex: 1;">
            <h2 style="margin: 0 0 10px 0; color: #fff; font-size: 32px; font-weight: normal; letter-spacing: 1px; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${r.name}</h2>
            <div style="margin: 0 0 20px 0; font-size: 16px; color: #c8a84a; text-transform: uppercase; letter-spacing: 2px;">
                ${r.race} ${r.job}
            </div>
            
            <div style="margin: 0 0 30px 0; font-size: 16px; color: #d0c0a0; line-height: 1.6; font-style: italic; border-left: 3px solid #c8a84a; padding-left: 15px;">
                "${r.bio || 'A mysterious adventurer looking for glory.'}"
            </div>

            <div style="margin-top: auto; display: flex; justify-content: flex-end; gap: 15px;">
              <button id="btn-recruit-close" style="padding: 10px 20px; cursor: pointer; background: rgba(0,0,0,0.5); border: 1px solid #6a5030; color: #a09070; font-family: inherit; font-size: 14px; border-radius: 4px; transition: all 0.2s;">Decline</button>
              ${canRecruit
            ? `<button id="btn-recruit-add" style="padding: 10px 20px; cursor: pointer; background: linear-gradient(to bottom, #c8a84a, #8a6a20); color: #fff; border: 1px solid #e8c87a; font-family: inherit; font-size: 14px; font-weight: bold; border-radius: 4px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); box-shadow: 0 0 10px rgba(200, 168, 74, 0.4);">Recruit to Party</button>`
            : `<span style="color: #cc4444; font-size: 14px; display: flex; align-items: center; border: 1px solid #cc4444; padding: 10px 20px; border-radius: 4px; background: rgba(204, 68, 68, 0.1);">Party Full!</span>`
        }
            </div>
        </div>
    </div>
  `;

    uiContainer.style.display = 'block';

    document.getElementById('btn-recruit-close').addEventListener('click', (e) => {
        e.stopPropagation();
        uiContainer.style.display = 'none';
    });

    const addBtn = document.getElementById('btn-recruit-add');
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            recruitCharacter(r);
            uiContainer.style.display = 'none';
            updateRecruitsMeshState();
        });
    }
}

// Drops a member from the party by their slot index
export function dropMember(index) {
    const m = party[index];
    if (!m || m.isEmpty) return;

    // Find them in RECRUITS
    const r = RECRUITS.find(x => x.name === m.name);
    if (r) r.isRecruited = false;

    party[index] = { id: index, isEmpty: true };

    // Clean up any references or trigger global refresh
    updateRecruitsMeshState();
    if (window.onPartyChanged) window.onPartyChanged();
}

function recruitCharacter(r) {
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
        level: 0,
        xp: 0,
        unspentStatPoints: 0,
        statBonuses: { strength: 0, dexterity: 0, vitality: 0, intelligence: 0, resilience: 0 },
        skillProgression: JSON.parse(JSON.stringify(r.skillProgression)),
        skills: [],  // empty — skills are learned by leveling up
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

    if (window.onPartyChanged) window.onPartyChanged();
}

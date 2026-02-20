import * as THREE from 'three';
import { party } from './party.js';
import { extendPartyData } from './equipment.js';
import { CELL, WALL_H, findCell } from './map.js';

// The 4 D&D characters
export const RECRUITS = [
    {
        id: 'recruit_1',
        name: 'Elrond',
        job: 'Ranger',
        race: 'Elf',
        hp: 85, hpMax: 85, mp: 40, mpMax: 40,
        stats: { strength: 12, dexterity: 18, vitality: 11, intelligence: 14, resilience: 10 },
        skills: [
            { name: 'Point-Blank Shot', description: 'No accuracy penalty when firing a Bow or Crossbow at an enemy in the adjacent tile.' },
            { name: 'Botanist', description: '50% chance to find two Herbs instead of one when clicking a Herb on the ground.' }
        ],
        image: '/elf_ranger_head.png',
        leftHand: 'Bow', rightHand: 'Bow',
        gridCol: 9, gridRow: 0, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_2',
        name: 'Gareth',
        job: 'Paladin',
        race: 'Human',
        hp: 120, hpMax: 120, mp: 60, mpMax: 60,
        stats: { strength: 18, dexterity: 10, vitality: 16, intelligence: 12, resilience: 18 },
        skills: [
            { name: 'Field Medic', description: 'Use Bandages or Heal actions during combat, not just while resting.' },
            { name: 'Whirlwind', description: 'With a two-handed weapon, strikes the enemy ahead and the two diagonal enemies simultaneously.' }
        ],
        image: '/human_paladin_head.png',
        leftHand: 'Sword', rightHand: 'Shield',
        gridCol: 10, gridRow: 0, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_3',
        name: 'Thorek',
        job: 'Barbarian',
        race: 'Dwarf',
        hp: 140, hpMax: 140, mp: 20, mpMax: 20,
        stats: { strength: 20, dexterity: 12, vitality: 18, intelligence: 8, resilience: 15 },
        skills: [
            { name: 'Dual-Wielding', description: 'Equip a weapon in the off-hand slot. Attacking triggers two cooldowns — one per weapon.' },
            { name: 'Shadow-Step', description: '25% chance to not trigger enemy aggression when moving backward or sideways.' }
        ],
        image: '/dwarf_barbarian_head.png',
        leftHand: 'Axe', rightHand: '—',
        gridCol: 12, gridRow: 0, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_4',
        name: 'Merlin',
        job: 'Wizard',
        race: 'Human',
        hp: 60, hpMax: 60, mp: 150, mpMax: 150,
        stats: { strength: 6, dexterity: 10, vitality: 8, intelligence: 20, resilience: 10 },
        skills: [
            { name: 'Runic Scholar', description: 'Read ancient wall inscriptions to uncover puzzle hints or gain permanent stat buffs.' },
            { name: 'Lockpicking', description: 'Open iron doors or chests without a key, or by consuming a Lockpick item.' }
        ],
        image: '/human_wizard_head.png',
        leftHand: 'Staff', rightHand: '—',
        gridCol: 13, gridRow: 0, facing: 'front', // North wall
        isRecruited: false
    }
];

let uiContainer = null;

export function initRecruits(scene, camera) {
    const loader = new THREE.TextureLoader();

    // BoxGeometry for a picture frame (width: 1.4, height: 1.4, depth: 0.1)
    const frameGeo = new THREE.BoxGeometry(1.4, 1.4, 0.1);

    // Draw them as embedded picture frames on the walls
    RECRUITS.forEach(r => {
        const map = loader.load(r.image);
        // materials: [right, left, top, bottom, front, back]
        // Three.js BoxGeometry front face is index 4.
        const picMat = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
        const frameMat = new THREE.MeshLambertMaterial({ color: 0x1f1008 });

        const materials = [
            frameMat, // right
            frameMat, // left
            frameMat, // top
            frameMat, // bottom
            picMat,   // front
            frameMat  // back
        ];

        const mesh = new THREE.Mesh(frameGeo, materials);

        // Position them flush against the walls of the new room!
        let wx = r.gridCol * CELL;
        let wz = r.gridRow * CELL;

        if (r.facing === 'front') {   // Look South (+Z)
            wz += 1.05;
            mesh.rotation.y = 0;
        } else if (r.facing === 'back') { // Look North (-Z)
            wz -= 1.05;
            mesh.rotation.y = Math.PI;
        } else if (r.facing === 'left') { // Look West (-X)
            wx -= 1.05;
            mesh.rotation.y = -Math.PI / 2;
        } else if (r.facing === 'right') { // Look East (+X)
            wx += 1.05;
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
    uiContainer.style.background = 'rgba(10, 7, 4, 0.95)';
    uiContainer.style.border = '1px solid #c8a84a';
    uiContainer.style.padding = '20px';
    uiContainer.style.color = '#e8c87a';
    uiContainer.style.zIndex = '2000';
    uiContainer.style.fontFamily = 'monospace';
    uiContainer.style.minWidth = '300px';
    document.body.appendChild(uiContainer);

    window.addEventListener('click', (e) => {
        if (uiContainer.style.display === 'block') {
            // close on background click could be handled, but let's just add a close button
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
                openRecruitModal(hit.object.userData.recruitId);
                break;
            }
        }
    });
}

export function updateRecruitsMeshState() {
    RECRUITS.forEach(r => {
        if (r.isRecruited) {
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

    uiContainer.innerHTML = `
    <h2 style="margin-top:0; color:#fff">${r.name}</h2>
    <p><strong>Race:</strong> ${r.race} &nbsp;&nbsp; <strong>Job:</strong> ${r.job}</p>
    <p><strong>HP:</strong> ${r.hp}/${r.hpMax} &nbsp;&nbsp; <strong>MP:</strong> ${r.mp}/${r.mpMax}</p>
    <div style="border-top:1px solid #4a3a20; padding-top:10px; margin-top:10px;">
      <p style="margin:2px 0;">STR: ${r.stats.strength} | DEX: ${r.stats.dexterity} | VIT: ${r.stats.vitality}</p>
      <p style="margin:2px 0;">INT: ${r.stats.intelligence} | RES: ${r.stats.resilience}</p>
    </div>
    <div style="border-top:1px solid #4a3a20; padding-top:10px; margin-top:10px; font-size:12px;">
      <h3 style="margin:0 0 5px; color:#c8a84a">Skills</h3>
      ${r.skills.map(s => `<p style="margin:2px 0;"><b>${s.name}</b>: ${s.description}</p>`).join('')}
    </div>
    <div style="margin-top:20px; text-align:right;">
      <button id="btn-recruit-close" style="padding:5px 10px; cursor:pointer;" aria-label="Close">Close</button>
      ${canRecruit ? `<button id="btn-recruit-add" style="padding:5px 10px; cursor:pointer; background:#2a1e10; color:#e8c87a; border:1px solid #c8a84a; margin-left:10px;">Recruit</button>` : '<span style="color:red; margin-left:10px;">Party Full! Drop a member first.</span>'}
    </div>
  `;

    uiContainer.style.display = 'block';

    document.getElementById('btn-recruit-close').onclick = () => { uiContainer.style.display = 'none'; };

    const addBtn = document.getElementById('btn-recruit-add');
    if (addBtn) {
        addBtn.onclick = () => {
            recruitCharacter(r);
            uiContainer.style.display = 'none';
            updateRecruitsMeshState();
            // Need a way to re-render the HUD or reload party data. We will update the global party refresh.
        };
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

    // Clone data into the party slot
    // Give them a generated portrait or just fallback
    party[freeIndex] = {
        id: freeIndex,
        isEmpty: false,
        name: r.name,
        hp: r.hp, hpMax: r.hpMax,
        mp: r.mp, mpMax: r.mpMax,
        stats: { ...r.stats },
        skills: JSON.parse(JSON.stringify(r.skills)),
        leftHand: r.leftHand,
        rightHand: r.rightHand,
        image: r.image, // Include image in party slot
        // Add fake portrait palette so it does not crash drawPortrait
        skinLight: '#e8c8a0', skinDark: '#b08050',
        hairColor: '#8a1a1a',
        irisColor: '#2a6a3a',
        // also need these for logic
        inventory: null,
        equipment: null
    };

    extendPartyData();

    if (window.onPartyChanged) window.onPartyChanged();
}

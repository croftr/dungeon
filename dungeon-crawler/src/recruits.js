import * as THREE from 'three';
import { party } from './party.js';
import { extendPartyData } from './equipment.js';
import { CELL, WALL_H, findCell } from './map.js';
import { isInFrontOfPlayer } from './player.js';

// The 5 D&D characters
export const RECRUITS = [
    {
        id: 'recruit_1',
        name: 'Elrond',
        job: 'Ranger',
        race: 'Elf',
        hp: 42, hpMax: 42, mp: 40, mpMax: 40, sp: 100, spMax: 100,
        stats: { strength: 6, dexterity: 9, vitality: 5, intelligence: 7, resilience: 5 },
        skills: [
            { name: 'Entangle', description: 'Halves the attack speed of the monster currently being fought for 30s. Only usable in combat. Cooldown: 60s.', icon: '/skills/entangle.png' },
            { name: "Hunter's Eye", description: "Reveal full stats of the engaged monster — HP, STR, DEX, VIT, INT, RES and Defence. Only usable in combat.", icon: '/skills/hunters-eye.png' },
        ],
        image: '/elf_ranger_head.png',
        leftHand: 'Bow', rightHand: 'Bow', ammo: 'Wooden Arrows', startingSkill: "Hunter's Eye",
        gridCol: 9, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_2',
        name: 'Alaric',
        job: 'Paladin',
        race: 'Human',
        hp: 60, hpMax: 60, mp: 60, mpMax: 60, sp: 100, spMax: 100,
        stats: { strength: 9, dexterity: 5, vitality: 8, intelligence: 6, resilience: 9 },
        skills: [
            { name: 'Sanctuary', description: 'Surrounds the party in divine light, reducing all damage received by 10% for 60 seconds. Cooldown: 120s.', icon: '/skills/sancturary.png' },
            { name: 'Holy Radiance', description: 'Calls down a pulse of holy energy, restoring 10 HP to every living party member. Cooldown: 120s.', icon: '/skills/holy-radiance.png' },
        ],
        image: '/human_paladin_head.png',
        leftHand: 'Sword', rightHand: 'Shield', startingSkill: 'Sanctuary',
        gridCol: 10, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_3',
        name: 'Thorek',
        job: 'Barbarian',
        race: 'Dwarf',
        hp: 70, hpMax: 70, mp: 20, mpMax: 20, sp: 100, spMax: 100,
        stats: { strength: 10, dexterity: 6, vitality: 9, intelligence: 4, resilience: 7 },
        skills: [
            { name: 'Sunder Armor', description: 'Crushes the targeted monster, halving its defence stats for 30s. Only usable in combat. Cooldown: 60s.', icon: '/skills/sunder-armor.png' },
        ],
        image: '/dwarf_barbarian_head.png',
        leftHand: 'Axe', rightHand: 'Torch', startingSkill: 'Sunder Armor',
        gridCol: 12, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_4',
        name: 'Merlin',
        job: 'Wizard',
        race: 'Human',
        hp: 30, hpMax: 30, mp: 50, mpMax: 50, sp: 100, spMax: 100,
        stats: { strength: 3, dexterity: 5, vitality: 4, intelligence: 10, resilience: 5 },
        skills: [
            { name: 'Arcane Lantern', description: 'Conjures a sphere of magical light that illuminates the dungeon as brightly as a torch for 60 seconds. Cooldown: 60s.', icon: '/skills/arcane-lantern.png' },
            { name: 'Runic Scholar', description: 'Channels arcane power into the next spell cast, doubling its damage after all other modifiers are applied.', icon: '/skills/runic-scholar.png' },
        ],
        image: '/human_wizard_head.png',
        leftHand: 'Staff', rightHand: '—', startingSkill: 'Runic Scholar',
        gridCol: 13, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_5',
        name: 'Korg',
        job: 'Barbarian',
        race: 'Human',
        hp: 67, hpMax: 67, mp: 25, mpMax: 25, sp: 100, spMax: 100,
        stats: { strength: 9, dexterity: 7, vitality: 8, intelligence: 4, resilience: 7 },
        skills: [
            { name: 'Whirlwind', description: 'With a two-handed weapon, strikes the enemy ahead and the two diagonal enemies simultaneously.' },
            { name: 'Trap Disarming', description: 'Automatically highlights floor pressure plates within a 2-tile radius and allows the player to right-click to disable them before triggering.' }
        ],
        image: '/human_barbarian_head.png',
        leftHand: 'Axe', rightHand: '—', startingSkill: 'Battle Cry',
        gridCol: 11, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    }
];

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

    // PlaneGeometry for wall frescoes (width: 1.5, height: 1.5)
    const frameGeo = new THREE.PlaneGeometry(1.5, 1.5);

    // Draw them as embedded wall frescoes
    RECRUITS.forEach(r => {
        const map = loader.load(r.image);
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
    uiContainer.style.background = 'rgba(10, 7, 4, 0.95)';
    uiContainer.style.border = '1px solid #c8a84a';
    uiContainer.style.padding = '20px';
    uiContainer.style.color = '#e8c87a';
    uiContainer.style.zIndex = '2000';
    uiContainer.style.fontFamily = 'monospace';
    uiContainer.style.minWidth = '300px';
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

    // Clone data into the party slot
    // Give them a generated portrait or just fallback
    party[freeIndex] = {
        id: freeIndex,
        isEmpty: false,
        name: r.name,
        hp: r.hp, hpMax: r.hpMax,
        mp: r.mp, mpMax: r.mpMax,
        sp: r.sp, spMax: r.spMax,
        stats: { ...r.stats },
        skills: JSON.parse(JSON.stringify(r.skills)),
        leftHand: r.leftHand,
        rightHand: r.rightHand,
        startingSkill: r.startingSkill,
        ammo: r.ammo,
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

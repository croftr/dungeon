import * as THREE from 'three';
import { party } from './party.js';
import { extendPartyData } from './equipment.js';
import { CELL, WALL_H, findCell } from './map.js';
import { isInFrontOfPlayer } from './player.js';
import { getItemDef } from './items.js';

// The 5 D&D characters
export const RECRUITS = [
    {
        id: 'recruit_1',
        name: 'Elrond',
        job: 'Ranger',
        race: 'Elf',
        hp: 42, hpMax: 42, mp: 10, mpMax: 10, sp: 100, spMax: 100,
        stats: { strength: 5, dexterity: 10, vitality: 5, intelligence: 7, resilience: 5 },
        skills: [
            { name: 'Entangle', type: 'debuff', description: 'Halves the attack speed of the monster currently being fought for 30s. Only usable in combat. Cooldown: 60s.', icon: '/skills/entangle.png' },
            { name: "Hunter's Eye", type: 'debuff', description: "Reveal full stats of the engaged monster — HP, STR, DEX, VIT, INT, RES and Defence. Only usable in combat.", icon: '/skills/hunters-eye.png' },
        ],
        image: '/elf_ranger_head.png',
        leftHand: 'Short Bow', rightHand: 'Short Bow', ammo: 'Wooden Arrows', startingSkill: "Hunter's Eye",
        gridCol: 9, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_2',
        name: 'Alaric',
        job: 'Paladin',
        race: 'Human',
        hp: 70, hpMax: 60, mp: 20, mpMax: 20, sp: 100, spMax: 100,
        stats: { strength: 7, dexterity: 5, vitality: 9, intelligence: 6, resilience: 10 },
        skills: [
            { name: 'Sanctuary', type: 'buff', description: 'Surrounds the party in divine light, reducing all damage received by 10% for 60 seconds. Cooldown: 120s.', icon: '/skills/sancturary.png' },
            { name: 'Holy Radiance', type: 'healing', description: 'Calls down a pulse of holy energy, restoring 10 HP to every living party member. Cooldown: 120s.', icon: '/skills/holy-radiance.png' },
        ],
        image: '/human_paladin_head.png',
        leftHand: 'Sword', rightHand: 'Shield', startingSkill: 'Sanctuary',
        startingInventory: ['Life Berry', 'Poison Vial', 'Life Essence', 'Life Essence'],
        gridCol: 10, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_3',
        name: 'Thorek',
        job: 'Warrior',
        race: 'Dwarf',
        hp: 70, hpMax: 70, mp: 10, mpMax: 10, sp: 100, spMax: 100,
        stats: { strength: 8, dexterity: 6, vitality: 8, intelligence: 4, resilience: 10 },
        skills: [
            { name: 'Sunder Armor', type: 'debuff', description: 'Crushes the targeted monster, halving its defence stats for 30s. Only usable in combat. Cooldown: 60s.', icon: '/skills/sunder-armor.png' },
        ],
        image: '/dwarf_barbarian_head.png',
        leftHand: 'Axe', rightHand: 'Wooden Shield', startingSkill: 'Sunder Armor',
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
            { name: 'Arcane Lantern', type: 'buff', description: 'Conjures a sphere of magical light that illuminates the dungeon as brightly as a torch for 60 seconds. Cooldown: 60s.', icon: '/skills/arcane-lantern.png' },
            { name: 'Runic Scholar', type: 'buff', description: 'Channels arcane power into the next spell cast, doubling its damage after all other modifiers are applied.', icon: '/skills/runic-scholar.png' },
            { name: 'Mana Tap', type: 'healing', description: 'Taps into a hidden vein of arcane energy, instantly replenishing all of Merlin\'s mana points. Cooldown: 120s.', icon: '/skills/mana-tap.png' },
        ],
        image: '/human_wizard_head.png',
        leftHand: 'Spellbook', rightHand: 'Oak Staff', startingSkill: 'Runic Scholar',
        gridCol: 13, gridRow: 8, facing: 'front', // North wall
        isRecruited: false
    },
    {
        id: 'recruit_5',
        name: 'Korg',
        job: 'Barbarian',
        race: 'Human',
        hp: 67, hpMax: 67, mp: 10, mpMax: 10, sp: 100, spMax: 100,
        stats: { strength: 9, dexterity: 7, vitality: 7, intelligence: 4, resilience: 7 },
        skills: [
            { name: 'Berserk', type: 'buff', description: 'Enters a state of roaring fury, boosting all damage dealt by 20% (after other calculations) for 30s. Cooldown: 60s.', icon: '/skills/berserk.png' },
            { name: 'Heal', type: 'healing', attackType: 'heal', description: 'A wave of restorative energy that mends wounds. Restores HP equal to the casters Intelligence to one party member.', icon: '/skills/heal.png' }
        ],
        image: '/human_barbarian_head.png',
        leftHand: 'Greataxe', rightHand: '—', startingSkill: 'Berserk',
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

    const lhDef = r.leftHand && r.leftHand !== '—' ? getItemDef(r.leftHand) : null;
    const rhDef = r.rightHand && r.rightHand !== '—' ? getItemDef(r.rightHand) : null;
    const ammoDef = r.ammo && r.ammo !== '—' ? getItemDef(r.ammo) : null;

    function renderEqSlot(def, fallback) {
        if (!def) {
            return `<div style="width:48px; height:48px; background:rgba(0,0,0,0.5); border:1px solid #3a2a10; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#5a4a2a; font-size:8px; border-radius:3px;">${fallback}</div>`;
        }
        return `<div style="width:48px; height:48px; background:rgba(0,0,0,0.7); border:1px solid #7a5a28; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; border-radius:3px; overflow:hidden;" title="${def.name}">
            <img src="${def.icon}" style="position:absolute; inset:0; width:100%; height:100%; opacity:0.18; pointer-events:none; object-fit:contain; padding:2px;">
            <span style="font-size:8px; color:#c8a84a; z-index:1; padding:2px; text-align:center; word-break:break-word;">${def.name}</span>
        </div>`;
    }

    uiContainer.innerHTML = `
    <div style="display:flex; gap:15px; margin-bottom:10px;">
        <img src="${r.image}" style="width:80px; height:80px; border:1px solid #6a5030; border-radius:4px; image-rendering:pixelated; background:#000;">
        <div>
            <h2 style="margin:0 0 5px 0; color:#fff">${r.name}</h2>
            <p style="margin:0; font-size:12px;"><strong>${r.race} ${r.job}</strong></p>
            <p style="margin:4px 0 0 0; font-size:11px; color:#e8c87a;">HP: ${r.hp}/${r.hpMax} &nbsp;&nbsp; MP: ${r.mp}/${r.mpMax}</p>
        </div>
    </div>
    
    <div style="border-top:1px solid #4a3a20; padding-top:10px; display:flex; justify-content:space-between; font-size:11px;">
      <div>STR: <span style="color:#c8a84a">${r.stats.strength}</span></div>
      <div>DEX: <span style="color:#c8a84a">${r.stats.dexterity}</span></div>
      <div>VIT: <span style="color:#c8a84a">${r.stats.vitality}</span></div>
      <div>INT: <span style="color:#c8a84a">${r.stats.intelligence}</span></div>
      <div>RES: <span style="color:#c8a84a">${r.stats.resilience}</span></div>
    </div>

    <div style="border-top:1px solid #4a3a20; padding-top:10px; margin-top:10px;">
      <h3 style="margin:0 0 8px; color:#c8a84a; font-size:11px; text-transform:uppercase; letter-spacing:1px;">Equipped</h3>
      <div style="display:flex; gap:8px;">
          ${renderEqSlot(lhDef, 'L.Hand')}
          ${renderEqSlot(rhDef, 'R.Hand')}
          ${renderEqSlot(ammoDef, 'Ammo')}
      </div>
    </div>

    <div style="border-top:1px solid #4a3a20; padding-top:10px; margin-top:10px; font-size:11px;">
      <h3 style="margin:0 0 8px; color:#c8a84a; font-size:11px; text-transform:uppercase; letter-spacing:1px;">Known Skills</h3>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${r.skills.map(s => `
            <div style="background:rgba(0,0,0,0.3); border:1px solid #3a2e14; padding:6px 8px; border-radius:3px;">
                <div style="color:#c8a84a; font-weight:bold; margin-bottom:2px;">${s.name}</div>
                <div style="color:#7a6a50; font-size:9px; line-height:1.4;">${s.description}</div>
            </div>
        `).join('')}
      </div>
    </div>

    <div style="margin-top:20px; text-align:right;">
      <button id="btn-recruit-close" style="padding:6px 12px; cursor:pointer; background:transparent; border:1px solid #6a5030; color:#a09070;">Close</button>
      ${canRecruit ? `<button id="btn-recruit-add" style="padding:6px 12px; cursor:pointer; background:rgba(200, 168, 74, 0.15); color:#e8c87a; border:1px solid #c8a84a; margin-left:10px; font-weight:bold;">Recruit to Party</button>` : '<span style="color:#cc4444; margin-left:10px; font-size:11px;">Party Full!</span>'}
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
        startingInventory: r.startingInventory ? [...r.startingInventory] : null,
        equipment: null
    };

    extendPartyData();

    if (window.onPartyChanged) window.onPartyChanged();
}

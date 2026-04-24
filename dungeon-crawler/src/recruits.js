import * as THREE from 'three';
import { party } from './party.js';
import { extendPartyData } from './equipment.js';
import { showInlineHelp } from './help.js';
import { CELL, WALL_H, findCell } from './map.js';
import { isInFrontOfPlayer } from './player.js';
import { interactables } from './objects.js';
import RECRUITS_DATA from './data/recruits.json';
import STANCES from './data/stances.json';
import { checkLevelUp } from './leveling.js';
import { asset } from './assets.js';

// Stance id → video filename (without extension). Some files have historical typos
// ("hearseeker-stance", "slayer-stamce") — preserve them because the assets exist under those names.
const STANCE_VIDEO_FILENAMES = {
  viper: 'viper-stance',
  heartseeker: 'hearseeker-stance',
  vengeance: 'vengeance-stance',
  overclock: 'overclocked-stance',
  curatio: 'curatio-stance',
  talon: 'talon-stance',
  retribution: 'retribution-stance',
  slayer: 'slayer-stamce',
};

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
    unlockedStances: [],
}));

let stanceVideoContainer = null;

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
        img.crossOrigin = 'anonymous';
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

    // Setup video UI container
    stanceVideoContainer = document.createElement('div');
    stanceVideoContainer.id = 'stance-video-modal';
    stanceVideoContainer.style.display = 'none';
    stanceVideoContainer.style.position = 'fixed';
    stanceVideoContainer.style.top = '0';
    stanceVideoContainer.style.left = '0';
    stanceVideoContainer.style.width = '100vw';
    stanceVideoContainer.style.height = '100vh';
    stanceVideoContainer.style.backgroundColor = 'black';
    stanceVideoContainer.style.zIndex = '3000';
    stanceVideoContainer.style.flexDirection = 'column';
    stanceVideoContainer.style.justifyContent = 'center';
    stanceVideoContainer.style.alignItems = 'center';
    document.body.appendChild(stanceVideoContainer);

    window.addEventListener('click', (e) => {
        if (stanceVideoContainer.contains(e.target) || stanceVideoContainer.style.display === 'flex') {
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
                    // Preview: play the first stance this recruit has a video for.
                    const previewStance = (r.stances ?? []).find(id => STANCE_VIDEO_FILENAMES[id]);
                    if (previewStance) playStanceVideo(previewStance);
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

export function playStanceVideo(stanceId) {
    const filename = STANCE_VIDEO_FILENAMES[stanceId];
    if (!filename || !stanceVideoContainer) return false;

    // Play learning sound immediately as the video starts
    new Audio(asset('/sounds/actions/learn-stance.mp3')).play().catch(e => console.warn('Audio play failed:', e));

    const stanceDef = STANCES[stanceId];
    const stanceName = stanceDef?.name?.replace(/\s*Stance\s*$/i, '') ?? stanceId;
    const videoUrl = `/videos/stances/${filename}.mp4`;
    stanceVideoContainer.innerHTML = `
        <video id="stance-video" src="${asset(videoUrl)}" autoplay style="max-width: 100%; max-height: 80%; border-radius: 8px; box-shadow: 0 0 20px rgba(200, 168, 74, 0.5);"></video>
        <div id="stance-text-container" style="text-align: center; margin-top: 30px; opacity: 0; transition: opacity 2s ease-in;">
            <div style="color: #c8a84a; font-size: 32px; font-family: Georgia, serif; letter-spacing: 2px;">Stance unlocked</div>
            <div style="color: white; font-size: 56px; font-family: Georgia, serif; font-weight: bold; letter-spacing: 4px; text-shadow: 0 0 15px #c8a84a; margin-top: 10px;">${stanceName}</div>
        </div>
    `;
    stanceVideoContainer.style.display = 'flex';
    
    const video = document.getElementById('stance-video');
    const textContainer = document.getElementById('stance-text-container');
    
    let textShown = false;

    const showText = () => {
        if (textShown) return;
        textContainer.style.opacity = '1';
        textShown = true;
        new Audio(asset('/sounds/actions/stance-change.mp3')).play().catch(e => console.warn('Audio play failed:', e));
    };

    video.onended = () => {
        showText();
    };
    
    stanceVideoContainer.onclick = () => {
        if (textShown) {
            stanceVideoContainer.style.display = 'none';
            stanceVideoContainer.innerHTML = '';
        } else {
            video.pause();
            showText();
        }
    };
    return true;
}

export function hasStanceVideo(stanceId) {
    return !!STANCE_VIDEO_FILENAMES[stanceId];
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
        job: r.job,
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
        unlockedStances: [...(r.unlockedStances ?? [])],
        stance: null,
        leftHand: r.leftHand,
        rightHand: r.rightHand,
        ammo: r.ammo,
        image: r.image,
        skinLight: '#e8c8a0', skinDark: '#b08050',
        hairColor: '#8a1a1a',
        irisColor: '#2a6a3a',
        inventory: null,
        startingInventory: r.startingInventory ? [...r.startingInventory] : null,
        startingActionSlots: r.startingActionSlots ? [...r.startingActionSlots] : null,
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
  return Object.fromEntries(RECRUITS.map(r => [r.id, {
    isRecruited: !!r.isRecruited,
    unlockedStances: [...(r.unlockedStances ?? [])],
  }]));
}

export function restoreRecruits(data) {
  if (!data) return;
  for (const r of RECRUITS) {
    if (!(r.id in data)) continue;
    const entry = data[r.id];
    if (typeof entry === 'boolean') {
      r.isRecruited = entry;
      r.unlockedStances = [];
    } else if (entry && typeof entry === 'object') {
      r.isRecruited = !!entry.isRecruited;
      r.unlockedStances = Array.isArray(entry.unlockedStances) ? [...entry.unlockedStances] : [];
    }
  }
}

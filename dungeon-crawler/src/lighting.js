import * as THREE from 'three';
import { WALL_H } from './map.js';
import { party } from './party.js';
import { skillsState } from './skills-state.js';

// ─────────────────────────────────────────────
//  LIGHTING SETUP
// ─────────────────────────────────────────────
export function initLighting(scene) {
  // Dim ambient so the torch feels meaningful
  const ambient = new THREE.AmbientLight(0x111122, 0.4);
  scene.add(ambient);

  // Primary torch — follows the camera each frame
  const torch = new THREE.PointLight(0xffcc99, 2.5, 8, 2);
  torch.castShadow = true;
  torch.shadow.mapSize.set(512, 512);
  scene.add(torch);

  // Subtle cool fill to stop pitch-black areas being unreadable
  const fill = new THREE.PointLight(0x334455, 0.6, 6, 2);
  scene.add(fill);

  return { ambient, torch, fill };
}

// Per-level palette. Keep shifts subtle — the torch is the dominant light.
// fog.near/far affect visibility distance; default is 2/12.
const DEFAULT_THEME = {
  ambient: 0x111122, ambientIntensity: 0.4,
  fog: 0x050505, fogNear: 2, fogFar: 12,
  fill: 0x334455,
};
const LEVEL_THEMES = {
  0: { ambient: 0x1a1612, ambientIntensity: 0.45, fog: 0x0a0805, fogNear: 2, fogFar: 13, fill: 0x4a3a2a }, // Starter — warm neutral
  1: DEFAULT_THEME,                                                                                         // Western Dungeon — default
  2: { ambient: 0x0a1428, ambientIntensity: 0.45, fog: 0x040810, fogNear: 2, fogFar: 13, fill: 0x2a4868 }, // Deep Passage / ice — cold blue
  3: { ambient: 0x0a1810, ambientIntensity: 0.4,  fog: 0x040804, fogNear: 2, fogFar: 11, fill: 0x2a4830 }, // Abyssal Crypts — sickly green
  4: { ambient: 0x1c0a08, ambientIntensity: 0.5,  fog: 0x0a0402, fogNear: 2, fogFar: 11, fill: 0x5a2818 }, // Forgotten Vault — warm red-orange
  5: { ambient: 0x1a1408, ambientIntensity: 0.5,  fog: 0x0a0804, fogNear: 2, fogFar: 14, fill: 0x584020 }, // Hall of Heroes — soft gold
  6: DEFAULT_THEME,                                                                                         // Goblin Gate — default
};

export function applyLevelTheme(scene, lights, levelNum) {
  const t = LEVEL_THEMES[levelNum] ?? DEFAULT_THEME;
  if (lights.ambient) {
    lights.ambient.color.setHex(t.ambient);
    lights.ambient.intensity = t.ambientIntensity;
  }
  if (lights.fill) lights.fill.color.setHex(t.fill);
  if (scene.fog) {
    scene.fog.color.setHex(t.fog);
    scene.fog.near = t.fogNear;
    scene.fog.far = t.fogFar;
  }
  if (scene.background && scene.background.isColor) {
    scene.background.setHex(t.fog);
  }
}

// ─────────────────────────────────────────────
//  PER-FRAME UPDATE  (call from render loop)
// ─────────────────────────────────────────────
let flickerTime = 0;
let _lastLightX = NaN, _lastLightZ = NaN;

export function updateLighting({ torch, fill }, camera, dt) {
  flickerTime += dt * 3.5;

  // Physical torch equipped by any party member, OR Arcane Lantern skill active
  let hasTorch = skillsState.arcaneLight.active &&
    performance.now() < skillsState.arcaneLight.expiresAt;

  if (!hasTorch) {
    for (let i = 0; i < party.length; i++) {
      const m = party[i];
      if (!m.isEmpty && m.equipment) {
        if (m.equipment.leftHand?.name === 'Torch' || m.equipment.rightHand?.name === 'Torch'
          || m.equipment.relic?.name === 'Testament of Faith') {
          hasTorch = true;
          break;
        }
      }
    }
  }

  // Default dim light if no torch, bright light if torch is held
  const targetIntensity = hasTorch ? 6.0 : 1.0;
  const targetDistance = hasTorch ? 22 : 5;

  // Sine-wave flicker on the torch intensity
  const flicker = 1 + 0.08 * Math.sin(flickerTime) + 0.04 * Math.sin(flickerTime * 2.3);
  torch.intensity = targetIntensity * flicker;
  torch.distance = targetDistance;

  // Only move lights when camera has moved (avoids shadow map recalculation on static frames)
  const cx = camera.position.x, cz = camera.position.z;
  if (cx !== _lastLightX || cz !== _lastLightZ) {
    torch.position.copy(camera.position);
    fill.position.set(cx, camera.position.y - 0.3, cz);
    _lastLightX = cx;
    _lastLightZ = cz;
  }
}

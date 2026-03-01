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
  torch.shadow.mapSize.set(256, 256);
  scene.add(torch);

  // Subtle cool fill to stop pitch-black areas being unreadable
  const fill = new THREE.PointLight(0x334455, 0.6, 6, 2);
  scene.add(fill);

  return { torch, fill };
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
        if (m.equipment.leftHand?.name === 'Torch' || m.equipment.rightHand?.name === 'Torch') {
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

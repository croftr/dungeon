import * as THREE from 'three';
import { WALL_H } from './map.js';

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

export function updateLighting({ torch, fill }, camera, dt) {
  flickerTime += dt * 3.5;

  // Sine-wave flicker on the torch intensity
  const flicker = 1 + 0.08 * Math.sin(flickerTime) + 0.04 * Math.sin(flickerTime * 2.3);
  torch.intensity = 2.5 * flicker;

  // Both lights track the camera position exactly
  torch.position.copy(camera.position);
  fill.position.set(camera.position.x, camera.position.y - 0.3, camera.position.z);
}

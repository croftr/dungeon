import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildLevel, findCell, CELL_START } from './map.js';
import { initPlayer, initInput, setCallbacks, tweenGroup } from './player.js';
import { initLighting, updateLighting } from './lighting.js';
import { initParticles, updateParticles } from './particles.js';
import { initMinimap, drawMinimap, updateStatus, showMessage } from './minimap.js';
import { initParty } from './party.js';
import { initEquipment } from './equipment.js';
import { initMonsters, updateMonsters, triggerMonsterAttack, monsters, isMonsterAt } from './monster.js';
import { initRecruits } from './recruits.js';
import { initObjects } from './objects.js';
import { startMusic, updateAudio } from './audio.js';
import { initBattleLog } from './battle-log.js';
import { initMainMenu } from './main-menu.js';

import './style.css';

// ─────────────────────────────────────────────
//  RENDERER
// ─────────────────────────────────────────────
const canvas = document.getElementById('renderer-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// CSS2D renderer — renders HTML labels (monster HP bars) anchored in 3D space
const css2dRenderer = new CSS2DRenderer();
css2dRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
document.body.appendChild(css2dRenderer.domElement);

// ─────────────────────────────────────────────
//  SCENE  &  CAMERA
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 2, 12);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  css2dRenderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ─────────────────────────────────────────────
//  BUILD WORLD
// ─────────────────────────────────────────────
buildLevel(scene);

// ─────────────────────────────────────────────
//  LIGHTING
// ─────────────────────────────────────────────
const lights = initLighting(scene);
initParticles(scene, camera);

// ─────────────────────────────────────────────
//  PLAYER
// ─────────────────────────────────────────────
const start = findCell(CELL_START);
initPlayer(start.row, start.col, camera);

setCallbacks({
  moved() {
    drawMinimap();
    updateStatus();
  },
  reached() {
    showMessage('YOU ESCAPED!<br><small style="font-size:14px;color:#aaa">The dungeon is conquered.</small>');
  },
  blocked(r, c) {
    return isMonsterAt(r, c);
  }
});

initInput(camera);

// ─────────────────────────────────────────────
//  MINIMAP, HUD & PARTY  (initial draw)
// ─────────────────────────────────────────────
initMinimap();
drawMinimap();
updateStatus();
initParty();
initEquipment();
initBattleLog();
initMainMenu();
initRecruits(scene, camera);
initObjects(scene, camera);

// ─────────────────────────────────────────────
//  MONSTERS
// ─────────────────────────────────────────────
initMonsters(scene);

// ─────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  tweenGroup.update(now);
  updateLighting(lights, camera, dt);
  updateMonsters(dt, camera, scene);
  updateParticles(dt);
  updateAudio(dt);
  renderer.render(scene, camera);
  css2dRenderer.render(scene, camera);
}

animate(performance.now());

// ─────────────────────────────────────────────
//  DEV INFO
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  MUSIC
// ─────────────────────────────────────────────
function handleFirstInteraction() {
  startMusic();
  window.removeEventListener('click', handleFirstInteraction);
  window.removeEventListener('keydown', handleFirstInteraction);
}
window.addEventListener('click', handleFirstInteraction);
window.addEventListener('keydown', handleFirstInteraction);

console.log('%c Grid Dungeon Crawler ', 'background:#333;color:#e8c87a;font-size:14px;padding:4px 8px;');
console.log('Map: 0=floor 1=wall 2=start 3=exit | Controls: W/S=move  Q/E=turn  A/D=strafe  Arrows=move+turn');

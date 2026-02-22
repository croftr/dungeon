import * as THREE from 'three';

// ─────────────────────────────────────────────
//  MAP DATA  (0=floor, 1=wall, 2=start, 3=exit)
// ─────────────────────────────────────────────
// Cell type constants
export const CELL_FLOOR = 0;
export const CELL_WALL = 1;
export const CELL_START = 2;
export const CELL_EXIT = 3;
export const CELL_PORTCULLIS = 4;

export const level1Map = [
  // cols:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 |15 16-30(room interior) 31
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 1
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 2
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 3 (top wall of test room)
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 4
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 6
  [1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 7 (portcullis)
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 8
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 10
  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 11 ← START; col14+15 open = entrance to test room
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 12
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 13
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 14
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 15
  [1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 16
  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 17
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 18
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 19 (bottom wall of test room)
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 20
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 21
  [1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 22
];

export const level2Map = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 2, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

export let dungeonMap = level1Map;
export let ROWS = dungeonMap.length;
export let COLS = dungeonMap[0].length;

export function changeMapArray(newMapArray) {
  dungeonMap = newMapArray;
  ROWS = dungeonMap.length;
  COLS = dungeonMap[0].length;
}

// World-space constants
export const CELL = 2;    // units per grid cell
export const WALL_H = 2;    // wall height



// ─────────────────────────────────────────────
//  PROCEDURAL TEXTURES
// ─────────────────────────────────────────────

/** Seeded pseudo-random — same seed → same map every time. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeBrickTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const rng = mulberry32(0xdeadbeef);

  // Number of brick rows and columns per tile
  const ROWS_B = 4, COLS_B = 3;
  const brickH = H / ROWS_B;
  const brickW = W / COLS_B;
  const mortarT = 6; // mortar thickness px

  // Base mortar colour - dark grey
  ctx.fillStyle = '#141517';
  ctx.fillRect(0, 0, W, H);

  for (let r = 0; r < ROWS_B; r++) {
    // Offset every other row (running bond)
    const offsetX = (r % 2 === 0) ? 0 : brickW * 0.5;

    for (let c2 = -1; c2 <= COLS_B; c2++) {
      const x = c2 * brickW + offsetX + mortarT / 2;
      const y = r * brickH + mortarT / 2;
      const w = brickW - mortarT;
      const h = brickH - mortarT;

      // Neutral dark grey base
      const v = Math.floor(rng() * 15);
      const grey = 45 + v;

      ctx.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
      ctx.fillRect(x, y, w, h);

      // Noise pass — heavy dark/light pitting only (no moss)
      for (let i = 0; i < 40; i++) {
        const nx = x + rng() * w;
        const ny = y + rng() * h;
        const nr = 2 + rng() * 12;
        const alpha = 0.05 + rng() * 0.15;

        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);

        const noiseType = rng();
        if (noiseType > 0.8) {
          ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.5).toFixed(2)})`; // light highlights
        } else {
          ctx.fillStyle = `rgba(15,15,15,${(alpha * 1.4).toFixed(2)})`; // dark pitting
        }
        ctx.fill();
      }

      // Highlight edge (top-left catch the light)
      ctx.strokeStyle = `rgba(255,255,255,0.04)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1); // 1 tile = 3 cols × 4 rows of bricks per face
  return tex;
}

function makeFloorTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const rng = mulberry32(0xc0ffee);

  // Dark stone base
  ctx.fillStyle = '#1e1a12';
  ctx.fillRect(0, 0, S, S);

  // Flagstone grid: 2×2 tiles per texture
  const tiles = 2;
  const tileS = S / tiles;
  const gap = 4;

  for (let tr = 0; tr < tiles; tr++) {
    for (let tc = 0; tc < tiles; tc++) {
      const x = tc * tileS + gap / 2;
      const y = tr * tileS + gap / 2;
      const w = tileS - gap;
      const h = tileS - gap;

      const v = Math.floor(rng() * 20);
      ctx.fillStyle = `rgb(${42 + v},${34 + v},${22 + v})`;
      ctx.fillRect(x, y, w, h);

      // Scratch / grain lines
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x + rng() * w, y + rng() * h);
        ctx.lineTo(x + rng() * w, y + rng() * h);
        ctx.strokeStyle = `rgba(0,0,0,${(0.1 + rng() * 0.15).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

// Build textures once
const brickTex = makeBrickTexture();
const floorTex = makeFloorTexture();

// ─────────────────────────────────────────────
//  MATERIALS
// ─────────────────────────────────────────────
const wallMat = new THREE.MeshLambertMaterial({ map: brickTex });
const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
const ceilMat = new THREE.MeshLambertMaterial({ color: 0x111008 });
const exitMat = new THREE.MeshLambertMaterial({ color: 0x226622, emissive: 0x113311 });

// Shared geometries
const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
const tileGeo = new THREE.PlaneGeometry(CELL, CELL);

// ─────────────────────────────────────────────
//  LEVEL BUILDER
// ─────────────────────────────────────────────

/** Finds the first cell matching a given type. */
export function findCell(type) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (dungeonMap[row][col] === type) return { row, col };
    }
  }
  return { row: 1, col: 1 };
}

/** Returns true when a grid cell can be walked into. */
export function isPassable(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  const cell = dungeonMap[row][col];
  // Portcullis blocks movement until it's opened.
  return cell === CELL_FLOOR || cell === CELL_START || cell === CELL_EXIT;
}

/** Converts grid coords to world-space position. */
export function cellToWorld(row, col) {
  // Eye height at 40% of wall height (0.8 units) — feels natural, not mid-wall
  return { x: col * CELL, y: WALL_H * 0.4, z: row * CELL };
}

let currentMapMeshes = [];

/**
 * Instantiates all wall/floor/ceiling meshes from dungeonMap.
 * Returns the exit PointLight (so lighting.js can manage it).
 */
export function buildLevel(scene) {
  let exitLight = null;

  // Clear previous level meshes if they exist
  currentMapMeshes.forEach(mesh => scene.remove(mesh));
  currentMapMeshes = [];

  // 1. Count instances needed
  let wallCount = 0;
  let floorCount = 0;
  let ceilCount = 0;
  let exitFloorCount = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = dungeonMap[row][col];
      if (cell === CELL_WALL) {
        wallCount++;
      } else {
        if (cell === CELL_EXIT) exitFloorCount++;
        else floorCount++;
        ceilCount++;
      }
    }
  }

  // 2. Create Instanced Meshes
  const wallIM = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
  wallIM.castShadow = true;
  wallIM.receiveShadow = true;

  const floorIM = new THREE.InstancedMesh(tileGeo, floorMat, floorCount);
  floorIM.receiveShadow = true;

  const ceilIM = new THREE.InstancedMesh(tileGeo, ceilMat, ceilCount);

  let exitFloorIM = null;
  if (exitFloorCount > 0) {
    exitFloorIM = new THREE.InstancedMesh(tileGeo, exitMat, exitFloorCount);
    exitFloorIM.receiveShadow = true;
  }

  // 3. Set matrices
  const dummy = new THREE.Object3D();
  let wId = 0, fId = 0, cId = 0, eId = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = dungeonMap[row][col];
      const wx = col * CELL;
      const wz = row * CELL;

      if (cell === CELL_WALL) {
        dummy.position.set(wx, WALL_H / 2, wz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        wallIM.setMatrixAt(wId++, dummy.matrix);
      } else {
        // Floor
        dummy.position.set(wx, 0, wz);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        if (cell === CELL_EXIT) {
          exitFloorIM.setMatrixAt(eId++, dummy.matrix);
        } else {
          floorIM.setMatrixAt(fId++, dummy.matrix);
        }

        // Ceiling
        dummy.position.set(wx, WALL_H, wz);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        ceilIM.setMatrixAt(cId++, dummy.matrix);

        // Exit glow light
        if (cell === CELL_EXIT) {
          exitLight = new THREE.PointLight(0x44ff44, 1.5, 5, 2);
          exitLight.position.set(wx, 1, wz);
          scene.add(exitLight);
          currentMapMeshes.push(exitLight);
        }
      }
    }
  }

  wallIM.instanceMatrix.needsUpdate = true;
  floorIM.instanceMatrix.needsUpdate = true;
  ceilIM.instanceMatrix.needsUpdate = true;
  if (exitFloorIM) exitFloorIM.instanceMatrix.needsUpdate = true;

  scene.add(wallIM); currentMapMeshes.push(wallIM);
  scene.add(floorIM); currentMapMeshes.push(floorIM);
  scene.add(ceilIM); currentMapMeshes.push(ceilIM);
  if (exitFloorIM) {
    scene.add(exitFloorIM);
    currentMapMeshes.push(exitFloorIM);
  }

  return exitLight;
}

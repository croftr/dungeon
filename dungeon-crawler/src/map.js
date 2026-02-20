import * as THREE from 'three';

// ─────────────────────────────────────────────
//  MAP DATA  (0=floor, 1=wall, 2=start, 3=exit)
// ─────────────────────────────────────────────
export const dungeonMap = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 2, 1, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 3, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export const ROWS = dungeonMap.length;
export const COLS = dungeonMap[0].length;

// World-space constants
export const CELL = 2;    // units per grid cell
export const WALL_H = 2;    // wall height

// Cell type constants
export const CELL_FLOOR = 0;
export const CELL_WALL = 1;
export const CELL_START = 2;
export const CELL_EXIT = 3;

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

  // Base mortar colour
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, W, H);

  for (let r = 0; r < ROWS_B; r++) {
    // Offset every other row (running bond)
    const offsetX = (r % 2 === 0) ? 0 : brickW * 0.5;

    for (let c2 = -1; c2 <= COLS_B; c2++) {
      const x = c2 * brickW + offsetX + mortarT / 2;
      const y = r * brickH + mortarT / 2;
      const w = brickW - mortarT;
      const h = brickH - mortarT;

      // Base brick colour with slight random variation
      const v = Math.floor(rng() * 30);
      const base = `rgb(${100 + v}, ${60 + v}, ${40 + v})`;
      ctx.fillStyle = base;
      ctx.fillRect(x, y, w, h);

      // Noise pass — small darker patches for age/weathering
      for (let i = 0; i < 18; i++) {
        const nx = x + rng() * w;
        const ny = y + rng() * h;
        const nr = 4 + rng() * 14;
        const alpha = 0.08 + rng() * 0.18;
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
        ctx.fill();
      }

      // Highlight edge (top-left catch the light)
      ctx.strokeStyle = `rgba(255,220,160,0.06)`;
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
  return cell === CELL_FLOOR || cell === CELL_START || cell === CELL_EXIT;
}

/** Converts grid coords to world-space position. */
export function cellToWorld(row, col) {
  // Eye height at 40% of wall height (0.8 units) — feels natural, not mid-wall
  return { x: col * CELL, y: WALL_H * 0.4, z: row * CELL };
}

/**
 * Instantiates all wall/floor/ceiling meshes from dungeonMap.
 * Returns the exit PointLight (so lighting.js can manage it).
 */
export function buildLevel(scene) {
  let exitLight = null;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = dungeonMap[row][col];
      const wx = col * CELL;
      const wz = row * CELL;

      if (cell === CELL_WALL) {
        const mesh = new THREE.Mesh(wallGeo, wallMat);
        mesh.position.set(wx, WALL_H / 2, wz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
      } else {
        // Floor
        const floor = new THREE.Mesh(tileGeo, cell === CELL_EXIT ? exitMat : floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(wx, 0, wz);
        floor.receiveShadow = true;
        scene.add(floor);

        // Ceiling
        const ceil = new THREE.Mesh(tileGeo, ceilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(wx, WALL_H, wz);
        scene.add(ceil);

        // Exit glow light
        if (cell === CELL_EXIT) {
          exitLight = new THREE.PointLight(0x44ff44, 1.5, 5, 2);
          exitLight.position.set(wx, 1, wz);
          scene.add(exitLight);
        }
      }
    }
  }

  return exitLight;
}

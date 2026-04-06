import * as THREE from 'three';
import { asset } from './assets.js';

// ─────────────────────────────────────────────
//  MAP DATA  (0=floor, 1=wall, 2=start, 3=exit)
// ─────────────────────────────────────────────
// Cell type constants
export const CELL_FLOOR = 0;
export const CELL_WALL = 1;
export const CELL_START = 2;
export const CELL_EXIT = 3;
export const CELL_PORTCULLIS = 4;
export const CELL_HOLE = 5;
export const CELL_STAIRS_UP = 6;
export const CELL_BLACK_WALL = 7;

import { level0Map } from './levels/level0/map.js';
import { level1Map } from './levels/level1/map.js';
import { level2Map } from './levels/level2/map.js';
import { level3Map } from './levels/level3/map.js';
import { level4Map } from './levels/level4/map.js';
import { level5Map } from './levels/level5/map.js';
export { level0Map, level1Map, level2Map, level3Map, level4Map, level5Map };

export let dungeonMap = level0Map;
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
  tex.anisotropy = 16;
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
  tex.anisotropy = 16;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

// Load external textures
const textureLoader = new THREE.TextureLoader();

const stoneWallTex = textureLoader.load(asset('/textures/wall1.jpg'));

stoneWallTex.wrapS = stoneWallTex.wrapT = THREE.RepeatWrapping;
stoneWallTex.anisotropy = 16;

const floorPatternTex = textureLoader.load(asset('/textures/floor1.jpg'));
floorPatternTex.wrapS = floorPatternTex.wrapT = THREE.RepeatWrapping;
floorPatternTex.anisotropy = 16;

// Detail overlay atlas 1 (moss, blood, cracks, blank — 2x2 grid on transparency)
const detailAtlasTex = textureLoader.load(asset('/textures/detail-atlas.png'));
detailAtlasTex.wrapS = detailAtlasTex.wrapT = THREE.ClampToEdgeWrapping;
detailAtlasTex.anisotropy = 16;

// Detail overlay atlas 2 (2x2 grid on transparency)
const detailAtlas2Tex = textureLoader.load(asset('/textures/detail-atlas2.png'));
detailAtlas2Tex.wrapS = detailAtlas2Tex.wrapT = THREE.ClampToEdgeWrapping;
detailAtlas2Tex.anisotropy = 16;

// Detail overlay atlas 3 (2x2 grid on transparency)
const detailAtlas3Tex = textureLoader.load(asset('/textures/detail-atlas3.png'));
detailAtlas3Tex.wrapS = detailAtlas3Tex.wrapT = THREE.ClampToEdgeWrapping;
detailAtlas3Tex.anisotropy = 16;

/** Call after a WebGL context restore to force texture re-upload on next frame. */
export function invalidateWallTextures() {
  stoneWallTex.needsUpdate = true;
  floorPatternTex.needsUpdate = true;
  detailAtlasTex.needsUpdate = true;
  detailAtlas2Tex.needsUpdate = true;
  detailAtlas3Tex.needsUpdate = true;
}

// ─────────────────────────────────────────────
//  MATERIALS
// ─────────────────────────────────────────────
// Shared shader injection for UV variation + shade + detail atlas overlay
function injectVariationShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailAtlas = { value: detailAtlasTex };
    shader.uniforms.detailAtlas2 = { value: detailAtlas2Tex };
    shader.uniforms.detailAtlas3 = { value: detailAtlas3Tex };

    // Vertex: pass per-instance attributes to fragment
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        [
          'attribute vec3 aUvVariation;',  // offsetU, offsetV, unused
          'attribute float aShade;',        // brightness multiplier 0.85–1.15
          'attribute vec3 aDetail;',        // detailIndex, detailOpacity, unused (atlas 1)
          'attribute vec3 aDetail2;',       // detailIndex, detailOpacity, unused (atlas 2)
          'attribute vec3 aDetail3;',       // detailIndex, detailOpacity, unused (atlas 3)
          'varying vec3 vUvVariation;',
          'varying float vShade;',
          'varying vec3 vDetail;',
          'varying vec3 vDetail2;',
          'varying vec3 vDetail3;',
          'void main() {',
          '  vUvVariation = aUvVariation;',
          '  vShade = aShade;',
          '  vDetail = aDetail;',
          '  vDetail2 = aDetail2;',
          '  vDetail3 = aDetail3;',
        ].join('\n')
      );

    // Fragment: apply UV offset, shade, and both detail overlays
    shader.fragmentShader = [
      'uniform sampler2D detailAtlas;',
      'uniform sampler2D detailAtlas2;',
      'uniform sampler2D detailAtlas3;',
      'varying vec3 vUvVariation;',
      'varying float vShade;',
      'varying vec3 vDetail;',
      'varying vec3 vDetail2;',
      'varying vec3 vDetail3;',
    ].join('\n') + '\n' + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        [
          '#ifdef USE_MAP',
          '  {',
          '    vec2 uv = fract(vMapUv + vUvVariation.xy);',
          '    vec4 sampledDiffuseColor = texture2D(map, uv);',
          '    #ifdef DECODE_VIDEO_TEXTURE',
          '      sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);',
          '    #endif',
          '    diffuseColor *= sampledDiffuseColor;',
          '    diffuseColor.rgb *= vShade;',
          '    // Detail atlas 1 (moss, blood, cracks)',
          '    if (vDetail.y > 0.0) {',
          '      float d1Idx = vDetail.x;',
          '      float d1Opacity = vDetail.y;',
          '      float d1Col = mod(d1Idx, 2.0);',
          '      float d1Row = floor(d1Idx / 2.0);',
          '      float d1Scale = 0.22;',
          '      vec2 d1TileUv = fract(vMapUv);',
          '      vec2 d1Center = vec2(0.3 + vUvVariation.x * 0.4, 0.3 + vUvVariation.y * 0.4);',
          '      vec2 d1Scaled = (d1TileUv - d1Center) / d1Scale + 0.5;',
          '      if (d1Scaled.x >= 0.0 && d1Scaled.x <= 1.0 && d1Scaled.y >= 0.0 && d1Scaled.y <= 1.0) {',
          '        vec2 d1Uv = d1Scaled * 0.5 + vec2(d1Col * 0.5, d1Row * 0.5);',
          '        vec4 d1Color = texture2D(detailAtlas, d1Uv);',
          '        diffuseColor.rgb = mix(diffuseColor.rgb, d1Color.rgb, d1Color.a * d1Opacity);',
          '      }',
          '    }',
          '    // Detail atlas 2 (holes, iron, brick, etc.)',
          '    if (vDetail2.y > 0.0) {',
          '      float d2Idx = vDetail2.x;',
          '      float d2Opacity = vDetail2.y;',
          '      float d2Col = mod(d2Idx, 2.0);',
          '      float d2Row = floor(d2Idx / 2.0);',
          '      float d2Scale = 0.22;',
          '      vec2 d2TileUv = fract(vMapUv);',
          // Use reversed UV variation so atlas 2 detail is placed differently from atlas 1
          '      vec2 d2Center = vec2(0.3 + vUvVariation.y * 0.4, 0.3 + vUvVariation.x * 0.4);',
          '      vec2 d2Scaled = (d2TileUv - d2Center) / d2Scale + 0.5;',
          '      if (d2Scaled.x >= 0.0 && d2Scaled.x <= 1.0 && d2Scaled.y >= 0.0 && d2Scaled.y <= 1.0) {',
          '        vec2 d2Uv = d2Scaled * 0.5 + vec2(d2Col * 0.5, d2Row * 0.5);',
          '        vec4 d2Color = texture2D(detailAtlas2, d2Uv);',
          '        diffuseColor.rgb = mix(diffuseColor.rgb, d2Color.rgb, d2Color.a * d2Opacity);',
          '      }',
          '    }',
          '    // Detail atlas 3',
          '    if (vDetail3.y > 0.0) {',
          '      float d3Idx = vDetail3.x;',
          '      float d3Opacity = vDetail3.y;',
          '      float d3Col = mod(d3Idx, 2.0);',
          '      float d3Row = floor(d3Idx / 2.0);',
          '      float d3Scale = 0.22;',
          '      vec2 d3TileUv = fract(vMapUv);',
          '      vec2 d3Center = vec2(0.3 + fract(vUvVariation.x + 0.5) * 0.4, 0.3 + fract(vUvVariation.y + 0.5) * 0.4);',
          '      vec2 d3Scaled = (d3TileUv - d3Center) / d3Scale + 0.5;',
          '      if (d3Scaled.x >= 0.0 && d3Scaled.x <= 1.0 && d3Scaled.y >= 0.0 && d3Scaled.y <= 1.0) {',
          '        vec2 d3Uv = d3Scaled * 0.5 + vec2(d3Col * 0.5, d3Row * 0.5);',
          '        vec4 d3Color = texture2D(detailAtlas3, d3Uv);',
          '        // Atlas 3 = holes: mostly opaque but let some wall show through',
          '        diffuseColor.rgb = mix(diffuseColor.rgb, d3Color.rgb, d3Color.a * 0.85);',
          '      }',
          '    }',
          '  }',
          '#endif',
        ].join('\n')
      );
  };
}

const wallMat = new THREE.MeshLambertMaterial({ map: stoneWallTex });
injectVariationShader(wallMat);
const floorMat = new THREE.MeshLambertMaterial({ map: floorPatternTex });
injectVariationShader(floorMat);
const ceilMat = new THREE.MeshLambertMaterial({ color: 0x111008 });
const exitMat = new THREE.MeshLambertMaterial({ color: 0x226622, emissive: 0x113311 });
const blackWallMat = new THREE.MeshLambertMaterial({ color: 0x000000 });

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
  return cell === CELL_FLOOR || cell === CELL_START || cell === CELL_EXIT || cell === CELL_HOLE || cell === CELL_STAIRS_UP;
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
  let blackWallCount = 0;
  let floorCount = 0;
  let ceilCount = 0;
  let exitFloorCount = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = dungeonMap[row][col];
      if (cell === CELL_WALL) {
        wallCount++;
      } else if (cell === CELL_BLACK_WALL) {
        blackWallCount++;
      } else if (cell !== CELL_HOLE) {
        floorCount++;
        ceilCount++;
      } else {
        // Holes have a ceiling but no floor
        ceilCount++;
      }
    }
  }

  // 2. Create Instanced Meshes
  const rng = mulberry32(0xa117e45);

  // --- Walls ---
  const wallIMGeo = wallGeo.clone();
  const wallIM = new THREE.InstancedMesh(wallIMGeo, wallMat, wallCount);
  wallIM.castShadow = true;
  wallIM.receiveShadow = true;

  const wallUvVar = new Float32Array(wallCount * 3);
  const wallShade = new Float32Array(wallCount);
  const wallDetail = new Float32Array(wallCount * 3);
  for (let i = 0; i < wallCount; i++) {
    wallUvVar[i * 3] = rng();
    wallUvVar[i * 3 + 1] = rng();
    wallUvVar[i * 3 + 2] = 0;
    wallShade[i] = 0.85 + rng() * 0.3;  // 0.85–1.15
    // ~30% of walls get a detail from atlas 1 (moss=0, blood=1, cracks=2)
    const wallRoll = rng();
    if (wallRoll < 0.10) {
      wallDetail[i * 3] = 0; // moss
      wallDetail[i * 3 + 1] = 0.7 + rng() * 0.3;
    } else if (wallRoll < 0.20) {
      wallDetail[i * 3] = 1; // blood
      wallDetail[i * 3 + 1] = 0.7 + rng() * 0.3;
    } else if (wallRoll < 0.30) {
      wallDetail[i * 3] = 2; // cracks
      wallDetail[i * 3 + 1] = 0.7 + rng() * 0.3;
    } else {
      wallDetail[i * 3] = 3; // blank
      wallDetail[i * 3 + 1] = 0;
    }
    wallDetail[i * 3 + 2] = 0;
  }

  // ~15% of walls get a detail from atlas 2
  const wallDetail2 = new Float32Array(wallCount * 3);
  for (let i = 0; i < wallCount; i++) {
    const wallRoll2 = rng();
    if (wallRoll2 < 0.15) {
      wallDetail2[i * 3] = Math.floor(rng() * 3);
      wallDetail2[i * 3 + 1] = 0.7 + rng() * 0.3;
    } else {
      wallDetail2[i * 3] = 3;
      wallDetail2[i * 3 + 1] = 0;
    }
    wallDetail2[i * 3 + 2] = 0;
  }

  // ~12% of walls get a hole from atlas 3
  const wallDetail3 = new Float32Array(wallCount * 3);
  for (let i = 0; i < wallCount; i++) {
    const wallRoll3 = rng();
    if (wallRoll3 < 0.12) {
      wallDetail3[i * 3] = Math.floor(rng() * 3);
      wallDetail3[i * 3 + 1] = 0.85;
    } else {
      wallDetail3[i * 3] = 3;
      wallDetail3[i * 3 + 1] = 0;
    }
    wallDetail3[i * 3 + 2] = 0;
  }

  wallIMGeo.setAttribute('aUvVariation', new THREE.InstancedBufferAttribute(wallUvVar, 3));
  wallIMGeo.setAttribute('aShade', new THREE.InstancedBufferAttribute(wallShade, 1));
  wallIMGeo.setAttribute('aDetail', new THREE.InstancedBufferAttribute(wallDetail, 3));
  wallIMGeo.setAttribute('aDetail2', new THREE.InstancedBufferAttribute(wallDetail2, 3));
  wallIMGeo.setAttribute('aDetail3', new THREE.InstancedBufferAttribute(wallDetail3, 3));

  const blackWallIM = new THREE.InstancedMesh(wallGeo, blackWallMat, blackWallCount);
  blackWallIM.castShadow = true;
  blackWallIM.receiveShadow = true;

  // --- Floors ---
  const floorIMGeo = tileGeo.clone();
  const floorIM = new THREE.InstancedMesh(floorIMGeo, floorMat, floorCount);
  floorIM.receiveShadow = true;

  const floorUvVar = new Float32Array(floorCount * 3);
  const floorShade = new Float32Array(floorCount);
  const floorDetail = new Float32Array(floorCount * 3);  // all blank
  const floorDetail2 = new Float32Array(floorCount * 3); // all blank
  const floorDetail3 = new Float32Array(floorCount * 3); // all blank
  for (let i = 0; i < floorCount; i++) {
    floorUvVar[i * 3] = rng();
    floorUvVar[i * 3 + 1] = rng();
    floorUvVar[i * 3 + 2] = 0;
    floorShade[i] = 0.85 + rng() * 0.3;
    floorDetail[i * 3] = 3;
    floorDetail[i * 3 + 1] = 0;
    floorDetail[i * 3 + 2] = 0;
    floorDetail2[i * 3] = 3;
    floorDetail2[i * 3 + 1] = 0;
    floorDetail2[i * 3 + 2] = 0;
    floorDetail3[i * 3] = 3;
    floorDetail3[i * 3 + 1] = 0;
    floorDetail3[i * 3 + 2] = 0;
  }

  floorIMGeo.setAttribute('aUvVariation', new THREE.InstancedBufferAttribute(floorUvVar, 3));
  floorIMGeo.setAttribute('aShade', new THREE.InstancedBufferAttribute(floorShade, 1));
  floorIMGeo.setAttribute('aDetail', new THREE.InstancedBufferAttribute(floorDetail, 3));
  floorIMGeo.setAttribute('aDetail2', new THREE.InstancedBufferAttribute(floorDetail2, 3));
  floorIMGeo.setAttribute('aDetail3', new THREE.InstancedBufferAttribute(floorDetail3, 3));

  const ceilIM = new THREE.InstancedMesh(tileGeo, ceilMat, ceilCount);

  // 3. Set matrices
  const dummy = new THREE.Object3D();
  let wId = 0, bwId = 0, fId = 0, cId = 0;

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
      } else if (cell === CELL_BLACK_WALL) {
        dummy.position.set(wx, WALL_H / 2, wz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        blackWallIM.setMatrixAt(bwId++, dummy.matrix);
      } else {
        // Ceiling (common to floor and hole)
        dummy.position.set(wx, WALL_H, wz);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        ceilIM.setMatrixAt(cId++, dummy.matrix);

        // Floor (skip for hole)
        if (cell !== CELL_HOLE) {
          dummy.position.set(wx, 0, wz);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.updateMatrix();
          floorIM.setMatrixAt(fId++, dummy.matrix);
        }
      }
    }
  }

  wallIM.instanceMatrix.needsUpdate = true;
  blackWallIM.instanceMatrix.needsUpdate = true;
  floorIM.instanceMatrix.needsUpdate = true;
  ceilIM.instanceMatrix.needsUpdate = true;

  scene.add(wallIM); currentMapMeshes.push(wallIM);
  scene.add(blackWallIM); currentMapMeshes.push(blackWallIM);
  scene.add(floorIM); currentMapMeshes.push(floorIM);
  scene.add(ceilIM); currentMapMeshes.push(ceilIM);

  return null;
}

/**
 * Overlays specific cells with custom wall/floor textures (individual meshes
 * placed on top of the instanced ones). Tracked in currentMapMeshes so they
 * are removed automatically on the next buildLevel call.
 *
 * @param {THREE.Scene} scene
 * @param {[number,number][]} wallCells  - [row,col] pairs to override with wall texture
 * @param {[number,number][]} floorCells - [row,col] pairs to override with floor texture
 * @param {string} wallTexPath  - asset path for the wall texture
 * @param {string} floorTexPath - asset path for the floor texture
 */
export function buildTextureZone(scene, wallCells, floorCells, wallTexPath, floorTexPath) {
  const loader = new THREE.TextureLoader();

  const wTex = loader.load(wallTexPath);
  wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping;
  wTex.anisotropy = 16;

  const fTex = loader.load(floorTexPath);
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.anisotropy = 16;

  const wMat = new THREE.MeshLambertMaterial({ map: wTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const fMat = new THREE.MeshLambertMaterial({ map: fTex });

  for (const [row, col] of wallCells) {
    const mesh = new THREE.Mesh(wallGeo, wMat);
    mesh.position.set(col * CELL, WALL_H / 2, row * CELL);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    currentMapMeshes.push(mesh);
  }

  for (const [row, col] of floorCells) {
    const mesh = new THREE.Mesh(tileGeo, fMat);
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.position.set(col * CELL, 0.002, row * CELL); // tiny offset prevents z-fighting
    mesh.receiveShadow = true;
    scene.add(mesh);
    currentMapMeshes.push(mesh);
  }
}

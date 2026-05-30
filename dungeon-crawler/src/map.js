import * as THREE from 'three';
import { asset } from './assets.js';
import ELEMENT_FLOORS from './data/element-floors.json';

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
export const CELL_LAVA = 8;
export const CELL_ICE = 9;
export const CELL_HOLY = 10;
export const CELL_DARK = 11;
export const CELL_LIGHTNING = 12;
export const CELL_WATER = 13;

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

// Out-of-band level numbers for self-contained, load-on-demand areas (mirrors
// the Schematic Trials at 50). The Crow Realm is reached only via the mist
// portal on level 2 and is fully torn down again on return.
export const CROW_REALM_LEVEL = 60;

/** Seeded pseudo-random — same seed → same map every time. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────
//  TEXTURES
// ─────────────────────────────────────────────
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');


const stoneWallTex = textureLoader.load(asset('/textures/wall.webp'));
stoneWallTex.wrapS = stoneWallTex.wrapT = THREE.RepeatWrapping;
stoneWallTex.anisotropy = 16;

const floorPatternTex = textureLoader.load(asset('/textures/floor1.webp'));
floorPatternTex.wrapS = floorPatternTex.wrapT = THREE.RepeatWrapping;
floorPatternTex.anisotropy = 16;

const ceilPatternTex = textureLoader.load(asset('/textures/ceiling.webp'));
ceilPatternTex.wrapS = ceilPatternTex.wrapT = THREE.RepeatWrapping;
ceilPatternTex.anisotropy = 16;

// Detail overlays
const detailAtlasTex = textureLoader.load(asset('/textures/detail-atlas1.webp'));
detailAtlasTex.wrapS = detailAtlasTex.wrapT = THREE.ClampToEdgeWrapping;
detailAtlasTex.anisotropy = 16;

const detailAtlas2Tex = textureLoader.load(asset('/textures/detail-atlas2.webp'));
detailAtlas2Tex.wrapS = detailAtlas2Tex.wrapT = THREE.ClampToEdgeWrapping;
detailAtlas2Tex.anisotropy = 16;

const detailAtlas3Tex = textureLoader.load(asset('/textures/detail-atlas3.webp'));
detailAtlas3Tex.wrapS = detailAtlas3Tex.wrapT = THREE.ClampToEdgeWrapping;
detailAtlas3Tex.anisotropy = 16;

const detailAtlas4Tex = textureLoader.load(asset('/textures/detail-atlas4.webp'));
detailAtlas4Tex.wrapS = detailAtlas4Tex.wrapT = THREE.ClampToEdgeWrapping;
detailAtlas4Tex.anisotropy = 16;

export function invalidateWallTextures() {
  stoneWallTex.needsUpdate = true;
  floorPatternTex.needsUpdate = true;
  ceilPatternTex.needsUpdate = true;
  detailAtlasTex.needsUpdate = true;
  detailAtlas2Tex.needsUpdate = true;
  detailAtlas3Tex.needsUpdate = true;
  detailAtlas4Tex.needsUpdate = true;
}

// ─────────────────────────────────────────────
//  MATERIALS
// ─────────────────────────────────────────────
function injectVariationShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailAtlas = { value: detailAtlasTex };
    shader.uniforms.detailAtlas2 = { value: detailAtlas2Tex };
    shader.uniforms.detailAtlas3 = { value: detailAtlas3Tex };
    shader.uniforms.detailAtlas4 = { value: detailAtlas4Tex };

    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      [
        'attribute vec3 aUvVariation;',
        'attribute float aShade;',
        'attribute vec3 aDetail;',
        'attribute vec3 aDetail2;',
        'attribute vec3 aDetail3;',
        'attribute vec3 aDetail4;',
        'varying vec3 vUvVariation;',
        'varying float vShade;',
        'varying vec3 vDetail;',
        'varying vec3 vDetail2;',
        'varying vec3 vDetail3;',
        'varying vec3 vDetail4;',
        'void main() {',
        '  vUvVariation = aUvVariation;',
        '  vShade = aShade;',
        '  vDetail = aDetail;',
        '  vDetail2 = aDetail2;',
        '  vDetail3 = aDetail3;',
        '  vDetail4 = aDetail4;',
      ].join('\n')
    );

    shader.fragmentShader = [
      'uniform sampler2D detailAtlas;',
      'uniform sampler2D detailAtlas2;',
      'uniform sampler2D detailAtlas3;',
      'uniform sampler2D detailAtlas4;',
      'varying vec3 vUvVariation;',
      'varying float vShade;',
      'varying vec3 vDetail;',
      'varying vec3 vDetail2;',
      'varying vec3 vDetail3;',
      'varying vec3 vDetail4;',
    ].join('\n') + '\n' + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
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
        '    #define DETAIL_EDGE_FADE(s, e) (smoothstep(0.0, e, (s).x) * smoothstep(1.0, 1.0-(e), (s).x) * smoothstep(0.0, e, (s).y) * smoothstep(1.0, 1.0-(e), (s).y))',
        '    if (vDetail.y > 0.0) {',
        '      float d1Idx = vDetail.x;',
        '      float d1Opacity = vDetail.y;',
        '      float d1Col = mod(d1Idx, 2.0);',
        '      float d1Row = floor(d1Idx / 2.0);',
        '      float d1Scale = 0.16;',
        '      vec2 d1TileUv = fract(vMapUv);',
        '      vec2 d1Center = vec2(0.3 + vUvVariation.x * 0.4, 0.3 + vUvVariation.y * 0.4);',
        '      vec2 d1Scaled = (d1TileUv - d1Center) / d1Scale + 0.5;',
        '      float d1Fade = DETAIL_EDGE_FADE(d1Scaled, 0.15);',
        '      if (d1Fade > 0.0) {',
        '        vec2 d1Uv = clamp(d1Scaled, 0.0, 1.0) * 0.5 + vec2(d1Col * 0.5, d1Row * 0.5);',
        '        vec4 d1Color = texture2D(detailAtlas, d1Uv);',
        '        diffuseColor.rgb = mix(diffuseColor.rgb, d1Color.rgb, d1Color.a * d1Opacity * d1Fade);',
        '      }',
        '    }',
        '    if (vDetail2.y > 0.0) {',
        '      float d2Idx = vDetail2.x;',
        '      float d2Opacity = vDetail2.y;',
        '      float d2Col = mod(d2Idx, 2.0);',
        '      float d2Row = floor(d2Idx / 2.0);',
        '      float d2Scale = 0.16;',
        '      vec2 d2TileUv = fract(vMapUv);',
        '      vec2 d2Center = vec2(0.3 + vUvVariation.y * 0.4, 0.3 + vUvVariation.x * 0.4);',
        '      vec2 d2Scaled = (d2TileUv - d2Center) / d2Scale + 0.5;',
        '      float d2Fade = DETAIL_EDGE_FADE(d2Scaled, 0.15);',
        '      if (d2Fade > 0.0) {',
        '        vec2 d2Uv = clamp(d2Scaled, 0.0, 1.0) * 0.5 + vec2(d2Col * 0.5, d2Row * 0.5);',
        '        vec4 d2Color = texture2D(detailAtlas2, d2Uv);',
        '        diffuseColor.rgb = mix(diffuseColor.rgb, d2Color.rgb, d2Color.a * d2Opacity * d2Fade);',
        '      }',
        '    }',
        '    if (vDetail3.y > 0.0) {',
        '      float d3Idx = vDetail3.x;',
        '      float d3Opacity = vDetail3.y;',
        '      float d3Col = mod(d3Idx, 2.0);',
        '      float d3Row = floor(d3Idx / 2.0);',
        '      float d3Scale = 0.16;',
        '      vec2 d3TileUv = fract(vMapUv);',
        '      vec2 d3Center = vec2(0.3 + fract(vUvVariation.x + 0.5) * 0.4, 0.3 + fract(vUvVariation.y + 0.5) * 0.4);',
        '      vec2 d3Scaled = (d3TileUv - d3Center) / d3Scale + 0.5;',
        '      float d3Fade = DETAIL_EDGE_FADE(d3Scaled, 0.15);',
        '      if (d3Fade > 0.0) {',
        '        vec2 d3Uv = clamp(d3Scaled, 0.0, 1.0) * 0.5 + vec2(d3Col * 0.5, d3Row * 0.5);',
        '        vec4 d3Color = texture2D(detailAtlas3, d3Uv);',
        '        diffuseColor.rgb = mix(diffuseColor.rgb, d3Color.rgb, d3Color.a * 0.85 * d3Fade);',
        '      }',
        '    }',
        '    if (vDetail4.y > 0.0) {',
        '      float d4Idx = vDetail4.x;',
        '      float d4Opacity = vDetail4.y;',
        '      float d4Col = mod(d4Idx, 2.0);',
        '      float d4Row = floor(d4Idx / 2.0);',
        '      float d4Scale = 0.16;',
        '      vec2 d4TileUv = fract(vMapUv);',
        '      vec2 d4Center = vec2(0.3 + fract(vUvVariation.y + 0.3) * 0.4, 0.3 + fract(vUvVariation.x + 0.7) * 0.4);',
        '      vec2 d4Scaled = (d4TileUv - d4Center) / d4Scale + 0.5;',
        '      float d4Fade = DETAIL_EDGE_FADE(d4Scaled, 0.15);',
        '      if (d4Fade > 0.0) {',
        '        vec2 d4Uv = clamp(d4Scaled, 0.0, 1.0) * 0.5 + vec2(d4Col * 0.5, d4Row * 0.5);',
        '        vec4 d4Color = texture2D(detailAtlas4, d4Uv);',
        '        diffuseColor.rgb = mix(diffuseColor.rgb, d4Color.rgb, d4Color.a * d4Opacity * d4Fade);',
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
const ceilMat = new THREE.MeshLambertMaterial({ map: ceilPatternTex });
injectVariationShader(ceilMat);
const exitMat = new THREE.MeshLambertMaterial({ color: 0x226622, emissive: 0x113311 });
const blackWallMat = new THREE.MeshLambertMaterial({ color: 0x000000 });

// ── Element floor registry ────────────────────────────────────────────────
// Each entry in element-floors.json maps a cell id to a tinted overlay tile
// that ticks elemental damage. To add a new one (e.g. acid, holy) just add a
// JSON entry — the material is built here and the damage tick in main.js
// loops over the same registry.
const _elementFloorMatByCell = {};
for (const [, def] of Object.entries(ELEMENT_FLOORS)) {
  const tex = textureLoader.load(asset(def.texture));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  // Soft radial alpha fade so the tile blends into surrounding floor instead
  // of forming a hard square. Distance is measured from tile centre in UV space.
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      [
        '#include <map_fragment>',
        'float efR = length(vMapUv - vec2(0.5));',
        'float efMask = 1.0 - smoothstep(0.28, 0.5, efR);',
        'diffuseColor.a *= efMask;',
      ].join('\n')
    );
  };
  _elementFloorMatByCell[def.cell] = mat;
}

const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
const tileGeo = new THREE.PlaneGeometry(CELL, CELL);

// ─────────────────────────────────────────────
//  LEVEL BUILDER
// ─────────────────────────────────────────────
export function findCell(type) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (dungeonMap[row][col] === type) return { row, col };
    }
  }
  return { row: 1, col: 1 };
}

export function isPassable(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  const cell = dungeonMap[row][col];
  if (cell === CELL_FLOOR || cell === CELL_START || cell === CELL_EXIT || cell === CELL_HOLE || cell === CELL_STAIRS_UP) return true;
  return _elementFloorMatByCell[cell] !== undefined;
}

export function cellToWorld(row, col) {
  return { x: col * CELL, y: WALL_H * 0.4, z: row * CELL };
}

let currentMapMeshes = [];

/**
 * Look up the cell id for an element-floor entry by its `element` field
 * (e.g. "fire" → the lava entry's cell id). Returns null if no entry matches.
 * Lets gameplay code reference floors by element name rather than the
 * registry's internal key.
 */
export function elementFloorCellId(elementName) {
  for (const [, def] of Object.entries(ELEMENT_FLOORS)) {
    if (def.element === elementName) return def.cell;
  }
  return null;
}

/**
 * Spawn an element-floor tile at runtime (e.g. a Crow Wizard's Flaming Floor).
 *
 * Mutates `dungeonMap[row][col]` to the given cell id and adds the visual
 * overlay tile to the scene. The mesh is tracked in `currentMapMeshes` so it
 * gets cleaned up the next time `buildLevel` runs.
 *
 * Idempotent: if the target cell is already this element floor, the function
 * is a no-op (used by save-restore paths where dungeonMap may still hold the
 * mutation in-session). Refuses to overwrite walls or non-floor structural
 * cells — only `CELL_FLOOR` and existing element floors are valid targets.
 *
 * Returns true if a tile was spawned (or was already present), false if the
 * target cell was not a valid floor to convert.
 */
export function spawnElementFloorAt(scene, row, col, cellId) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  const existing = dungeonMap[row][col];
  if (existing === cellId) return true; // already mutated this session
  // Only convert ordinary floor tiles (avoid stomping start/exit/holes/walls)
  if (existing !== CELL_FLOOR) return false;
  const mat = _elementFloorMatByCell[cellId];
  if (!mat) return false;
  dungeonMap[row][col] = cellId;
  const tile = new THREE.Mesh(tileGeo, mat);
  tile.rotation.set(-Math.PI / 2, 0, 0);
  tile.position.set(col * CELL, 0.012, row * CELL);
  scene.add(tile);
  currentMapMeshes.push(tile);
  return true;
}

// ─────────────────────────────────────────────
//  FLOOR ZONE REGISTRY
// ─────────────────────────────────────────────
const _floorZoneMap = {};

export function registerFloorZoneCells(cells, zoneType) {
  for (const [r, c] of cells) _floorZoneMap[`${r},${c}`] = zoneType;
}

export function getFloorZoneAtCell(r, c) {
  return _floorZoneMap[`${r},${c}`] ?? null;
}

export function buildLevel(scene) {
  currentMapMeshes.forEach(mesh => scene.remove(mesh));
  currentMapMeshes = [];
  // Clear floor zone registry for the new level
  for (const k of Object.keys(_floorZoneMap)) delete _floorZoneMap[k];

  let wallCount = 0, blackWallCount = 0, floorCount = 0, ceilCount = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = dungeonMap[row][col];
      if (cell === CELL_WALL) wallCount++;
      else if (cell === CELL_BLACK_WALL) blackWallCount++;
      else if (cell !== CELL_HOLE) { floorCount++; ceilCount++; }
      else ceilCount++;
    }
  }
  // Count extra boundary walls needed — one for each direction a floor/non-wall
  // cell touches the map edge, so the player never sees through to a black void.
  let boundaryWallCount = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = dungeonMap[row][col];
      if (cell === CELL_WALL || cell === CELL_BLACK_WALL) continue;
      if (col === 0) boundaryWallCount++;
      if (col === COLS - 1) boundaryWallCount++;
      if (row === 0) boundaryWallCount++;
      if (row === ROWS - 1) boundaryWallCount++;
    }
  }
  wallCount += boundaryWallCount;

  const rng = mulberry32(0xa117e45);

  const createIMAttributes = (count) => {
    const uvVar = new Float32Array(count * 3);
    const shade = new Float32Array(count);
    const detail1 = new Float32Array(count * 3);
    const detail2 = new Float32Array(count * 3);
    const detail3 = new Float32Array(count * 3);
    const detail4 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      uvVar[i * 3] = rng(); uvVar[i * 3 + 1] = rng();
      shade[i] = 0.85 + rng() * 0.3;
      for (let j = 0; j < 4; j++) {
        const d = (j === 0 ? detail1 : j === 1 ? detail2 : j === 2 ? detail3 : detail4);
        d[i * 3] = 3; d[i * 3 + 1] = 0; d[i * 3 + 2] = 0;
      }
    }
    return { uvVar, shade, detail1, detail2, detail3, detail4 };
  };

  const applyAttrs = (geo, attrs) => {
    geo.setAttribute('aUvVariation', new THREE.InstancedBufferAttribute(attrs.uvVar, 3));
    geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(attrs.shade, 1));
    geo.setAttribute('aDetail', new THREE.InstancedBufferAttribute(attrs.detail1, 3));
    geo.setAttribute('aDetail2', new THREE.InstancedBufferAttribute(attrs.detail2, 3));
    geo.setAttribute('aDetail3', new THREE.InstancedBufferAttribute(attrs.detail3, 3));
    geo.setAttribute('aDetail4', new THREE.InstancedBufferAttribute(attrs.detail4, 3));
  };

  // Walls — no random UV offset so seamless texture tiles correctly across adjacent blocks
  const wGeo = wallGeo.clone();
  const wAttrs = createIMAttributes(wallCount);
  wAttrs.uvVar.fill(0);
  // Special wall details
  for (let i = 0; i < wallCount; i++) {
    const roll = rng();
    if (roll < 0.1) { wAttrs.detail1[i * 3] = 0; wAttrs.detail1[i * 3 + 1] = 0.8; }
    else if (roll < 0.2) { wAttrs.detail1[i * 3] = 1; wAttrs.detail1[i * 3 + 1] = 0.8; }
    else if (roll < 0.3) { wAttrs.detail1[i * 3] = 2; wAttrs.detail1[i * 3 + 1] = 0.8; }
    if (rng() < 0.15) { wAttrs.detail2[i * 3] = Math.floor(rng() * 3); wAttrs.detail2[i * 3 + 1] = 0.8; }
    if (rng() < 0.12) { wAttrs.detail3[i * 3] = Math.floor(rng() * 3); wAttrs.detail3[i * 3 + 1] = 0.85; }
    if (rng() < 0.15) { wAttrs.detail4[i * 3] = Math.floor(rng() * 3); wAttrs.detail4[i * 3 + 1] = 0.8; }
  }
  applyAttrs(wGeo, wAttrs);
  const wallIM = new THREE.InstancedMesh(wGeo, wallMat, wallCount);
  wallIM.castShadow = true; wallIM.receiveShadow = true;

  const blackWallIM = new THREE.InstancedMesh(wallGeo, blackWallMat, blackWallCount);

  // Floors
  const fGeo = tileGeo.clone();
  applyAttrs(fGeo, createIMAttributes(floorCount));
  const floorIM = new THREE.InstancedMesh(fGeo, floorMat, floorCount);
  floorIM.receiveShadow = true;

  // Ceilings — no random UV offset so seamless texture tiles correctly across adjacent tiles
  const cGeo = tileGeo.clone();
  const cAttrs = createIMAttributes(ceilCount);
  cAttrs.uvVar.fill(0);
  applyAttrs(cGeo, cAttrs);
  const ceilIM = new THREE.InstancedMesh(cGeo, ceilMat, ceilCount);
  ceilIM.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let wI = 0, bwI = 0, fI = 0, cI = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = dungeonMap[r][c];
      const wx = c * CELL, wz = r * CELL;
      if (cell === CELL_WALL) {
        dummy.position.set(wx, WALL_H / 2, wz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
        wallIM.setMatrixAt(wI++, dummy.matrix);
      } else if (cell === CELL_BLACK_WALL) {
        dummy.position.set(wx, WALL_H / 2, wz); dummy.updateMatrix();
        blackWallIM.setMatrixAt(bwI++, dummy.matrix);
      } else {
        dummy.position.set(wx, WALL_H, wz); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.updateMatrix();
        ceilIM.setMatrixAt(cI++, dummy.matrix);
        if (cell !== CELL_HOLE) {
          dummy.position.set(wx, 0, wz); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.updateMatrix();
          floorIM.setMatrixAt(fI++, dummy.matrix);
        }
        const elemMat = _elementFloorMatByCell[cell];
        if (elemMat) {
          const tile = new THREE.Mesh(tileGeo, elemMat);
          tile.rotation.set(-Math.PI / 2, 0, 0);
          tile.position.set(wx, 0.012, wz);
          scene.add(tile); currentMapMeshes.push(tile);
        }
      }
    }
  }

  // Place boundary walls just outside the map edge for any floor cell that
  // touches the border, giving them the same stone texture as interior walls.
  dummy.rotation.set(0, 0, 0);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = dungeonMap[r][c];
      if (cell === CELL_WALL || cell === CELL_BLACK_WALL) continue;
      if (c === 0) {
        dummy.position.set(-CELL, WALL_H / 2, r * CELL); dummy.updateMatrix();
        wallIM.setMatrixAt(wI++, dummy.matrix);
      }
      if (c === COLS - 1) {
        dummy.position.set(COLS * CELL, WALL_H / 2, r * CELL); dummy.updateMatrix();
        wallIM.setMatrixAt(wI++, dummy.matrix);
      }
      if (r === 0) {
        dummy.position.set(c * CELL, WALL_H / 2, -CELL); dummy.updateMatrix();
        wallIM.setMatrixAt(wI++, dummy.matrix);
      }
      if (r === ROWS - 1) {
        dummy.position.set(c * CELL, WALL_H / 2, ROWS * CELL); dummy.updateMatrix();
        wallIM.setMatrixAt(wI++, dummy.matrix);
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
}

export function buildTextureZone(scene, wallCells, floorCells, wallTexPath, floorTexPath) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  const wTex = loader.load(wallTexPath); wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.anisotropy = 16;
  const wM = new THREE.MeshLambertMaterial({ map: wTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  let fM = null;
  if (floorCells && floorCells.length > 0 && floorTexPath) {
    const fTex = loader.load(floorTexPath); fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping; fTex.anisotropy = 16;
    fM = new THREE.MeshLambertMaterial({ map: fTex });
  }

  for (const [r, c] of wallCells) {
    const m = new THREE.Mesh(wallGeo, wM);
    m.position.set(c * CELL, WALL_H / 2, r * CELL); scene.add(m); currentMapMeshes.push(m);
  }
  if (fM) for (const [r, c] of floorCells) {
    const m = new THREE.Mesh(tileGeo, fM);
    m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(c * CELL, 0.002, r * CELL);
    scene.add(m); currentMapMeshes.push(m);
  }
}

export function buildFloorZone(scene, floorCells, texPath, zoneType = null) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tex = loader.load(texPath);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  for (const [r, c] of floorCells) {
    const tile = new THREE.Mesh(tileGeo, mat);
    tile.rotation.set(-Math.PI / 2, 0, 0);
    tile.position.set(c * CELL, 0.005, r * CELL);
    scene.add(tile); currentMapMeshes.push(tile);
  }
  if (zoneType) registerFloorZoneCells(floorCells, zoneType);
}

export function buildCeilingZone(scene, floorCells, texPath) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tex = loader.load(texPath);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  for (const [r, c] of floorCells) {
    const tile = new THREE.Mesh(tileGeo, mat);
    tile.rotation.set(Math.PI / 2, 0, 0);
    tile.position.set(c * CELL, WALL_H - 0.005, r * CELL);
    scene.add(tile); currentMapMeshes.push(tile);
  }
}


export function buildInnerTextureZone(scene, floorCells, wallTexPath) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const wTex = loader.load(wallTexPath);
  wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping;
  wTex.anisotropy = 16;
  const wM = new THREE.MeshLambertMaterial({ map: wTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  const planeGeo = new THREE.PlaneGeometry(CELL, WALL_H);

  const isWall = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    const cell = dungeonMap[r][c];
    return cell === CELL_WALL || cell === CELL_BLACK_WALL || cell === CELL_PORTCULLIS;
  };

  for (const [r, c] of floorCells) {
    // North Wall
    if (isWall(r - 1, c)) {
      const m = new THREE.Mesh(planeGeo, wM);
      m.position.set(c * CELL, WALL_H / 2, (r - 0.5) * CELL + 0.01);
      m.rotation.set(0, 0, 0);
      scene.add(m); currentMapMeshes.push(m);
    }
    // South Wall
    if (isWall(r + 1, c)) {
      const m = new THREE.Mesh(planeGeo, wM);
      m.position.set(c * CELL, WALL_H / 2, (r + 0.5) * CELL - 0.01);
      m.rotation.set(0, Math.PI, 0);
      scene.add(m); currentMapMeshes.push(m);
    }
    // West Wall
    if (isWall(r, c - 1)) {
      const m = new THREE.Mesh(planeGeo, wM);
      m.position.set((c - 0.5) * CELL + 0.01, WALL_H / 2, r * CELL);
      m.rotation.set(0, Math.PI / 2, 0);
      scene.add(m); currentMapMeshes.push(m);
    }
    // East Wall
    if (isWall(r, c + 1)) {
      const m = new THREE.Mesh(planeGeo, wM);
      m.position.set((c + 0.5) * CELL - 0.01, WALL_H / 2, r * CELL);
      m.rotation.set(0, -Math.PI / 2, 0);
      scene.add(m); currentMapMeshes.push(m);
    }
  }
}

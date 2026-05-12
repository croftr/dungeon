import { Tween, Easing, Group } from '@tweenjs/tween.js';
import { changeZoom, changeSize, toggleFullscreen, resetPan } from './minimap.js';
import { getPartyMoveMs } from './equipment.js';

export const tweenGroup = new Group();
import { isPassable, cellToWorld, CELL_EXIT, dungeonMap } from './map.js';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
export const FACING_NAMES = ['North', 'East', 'South', 'West'];
export const FACING_ANGLES = [0, -Math.PI / 2, Math.PI, Math.PI / 2]; // camera Y rotation

// dx/dz deltas per facing direction
const DIR = [
  { dx: 0, dz: -1 }, // 0 North
  { dx: 1, dz: 0 }, // 1 East
  { dx: 0, dz: 1 }, // 2 South
  { dx: -1, dz: 0 }, // 3 West
];

const MOVE_MS = 300; // baseline tween duration; encumbrance can stretch or block movement (see getPartyMoveMs)

// Resolves the active per-cell move duration. null = blocked (overloaded party).
function currentMoveMs() {
  const ms = getPartyMoveMs();
  return ms;
}

// ─────────────────────────────────────────────
//  PLAYER STATE
// ─────────────────────────────────────────────
export const player = {
  gridRow: 1,
  gridCol: 1,
  facing: 0,      // 0-3
  moving: false,  // input lock during tween
};

export let playerFrozen = false;
export function setPlayerFrozen(val) { playerFrozen = val; }

// Callbacks set by main.js
let onMoved = () => { };
let onReached = () => { };
let isBlocked = () => false;

export function setCallbacks({ moved, reached, blocked }) {
  onMoved = moved ?? onMoved;
  onReached = reached ?? onReached;
  isBlocked = blocked ?? isBlocked;
}

// ─────────────────────────────────────────────
//  SAVE / RESTORE
// ─────────────────────────────────────────────
export function capturePlayerState() {
  return {
    gridRow: player.gridRow,
    gridCol: player.gridCol,
    facing: player.facing,
  };
}

export function restorePlayerState(data, camera) {
  if (!data) return;
  player.gridRow = data.gridRow ?? player.gridRow;
  player.gridCol = data.gridCol ?? player.gridCol;
  player.facing = data.facing ?? player.facing;
  if (camera) {
    const w = cellToWorld(player.gridRow, player.gridCol);
    camera.position.set(w.x, w.y, w.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  }
}

// ─────────────────────────────────────────────
//  MOVEMENT
// ─────────────────────────────────────────────
export function initPlayer(startRow, startCol, camera, facing = 0) {
  player.gridRow = startRow;
  player.gridCol = startCol;
  player.facing = facing;

  const w = cellToWorld(startRow, startCol);
  camera.position.set(w.x, w.y, w.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = FACING_ANGLES[player.facing];
}

export function moveForward(camera, sign = 1) {
  if (player.moving || playerFrozen) return;

  const moveMs = currentMoveMs();
  if (moveMs === null) {
    // Overloaded — party can't move at all.
    bumpFeedback(camera);
    return;
  }

  const dir = DIR[player.facing];
  const newRow = player.gridRow + dir.dz * sign;
  const newCol = player.gridCol + dir.dx * sign;

  if (!isPassable(newRow, newCol) || isBlocked(newRow, newCol)) {
    bumpFeedback(camera);
    return;
  }

  player.moving = true;
  player.gridRow = newRow;
  player.gridCol = newCol;

  const target = cellToWorld(newRow, newCol);

  new Tween(camera.position, tweenGroup)
    .to({ x: target.x, z: target.z }, moveMs)
    .easing(Easing.Quadratic.InOut)
    .onComplete(() => {
      player.moving = false;
      onMoved();
      if (dungeonMap[newRow][newCol] === CELL_EXIT) onReached();
    })
    .start();

  onMoved();
}

export function turnPlayer(camera, sign = 1) {
  if (player.moving || playerFrozen) return;

  const moveMs = currentMoveMs();
  if (moveMs === null) {
    // Overloaded — even turning is gated for consistency with movement lock.
    bumpFeedback(camera);
    return;
  }

  player.moving = true;

  player.facing = ((player.facing + sign) + 4) % 4;

  const currentY = camera.rotation.y;
  const targetY = FACING_ANGLES[player.facing];

  // Shortest angular path
  let delta = targetY - currentY;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  const rot = { y: currentY };
  new Tween(rot, tweenGroup)
    .to({ y: currentY + delta }, moveMs)
    .easing(Easing.Quadratic.InOut)
    .onUpdate(() => { camera.rotation.y = rot.y; })
    .onComplete(() => {
      camera.rotation.y = targetY; // snap to exact value
      player.moving = false;
      onMoved();
    })
    .start();

  onMoved();
}

// sign =  1 → strafe right (perpendicular clockwise from facing)
// sign = -1 → strafe left  (perpendicular counter-clockwise from facing)
export function strafePlayer(camera, sign = 1) {
  if (player.moving || playerFrozen) return;

  const moveMs = currentMoveMs();
  if (moveMs === null) {
    bumpFeedback(camera);
    return;
  }

  // The strafe direction is 90° to the right of current facing (+1 turn),
  // or 90° to the left (-1 turn), without changing player.facing.
  const strafeDir = DIR[((player.facing + sign) + 4) % 4];
  const newRow = player.gridRow + strafeDir.dz;
  const newCol = player.gridCol + strafeDir.dx;

  if (!isPassable(newRow, newCol) || isBlocked(newRow, newCol)) {
    bumpFeedback(camera);
    return;
  }

  player.moving = true;
  player.gridRow = newRow;
  player.gridCol = newCol;

  const target = cellToWorld(newRow, newCol);

  new Tween(camera.position, tweenGroup)
    .to({ x: target.x, z: target.z }, moveMs)
    .easing(Easing.Quadratic.InOut)
    .onComplete(() => {
      player.moving = false;
      onMoved();
      if (dungeonMap[newRow][newCol] === CELL_EXIT) onReached();
    })
    .start();

  onMoved();
}

// Brief recoil when walking into a wall
function bumpFeedback(camera) {
  const dir = DIR[player.facing];
  const bump = 0.12;
  const origin = { x: camera.position.x, z: camera.position.z };

  new Tween(camera.position, tweenGroup)
    .to({ x: origin.x + dir.dx * bump, z: origin.z + dir.dz * bump }, 80)
    .easing(Easing.Quadratic.Out)
    .chain(
      new Tween(camera.position, tweenGroup)
        .to({ x: origin.x, z: origin.z }, 100)
        .easing(Easing.Quadratic.In)
    )
    .start();
}

// ─────────────────────────────────────────────
//  RANGE HELPERS
// ─────────────────────────────────────────────

/**
 * Returns the grid deltas (dx, dz) for the direction the player is facing.
 */
export function facingDir() {
  return DIR[player.facing];
}

/**
 * Returns true if the given grid cell (targetRow, targetCol) is directly in
 * front of the player within `maxSteps` steps along the facing direction.
 * The cell must be along the exact forward axis — no diagonals.
 *
 * @param {number} targetRow
 * @param {number} targetCol
 * @param {number} maxSteps  — 1 for melee, 8 for ranged
 */
export function isInFrontOfPlayer(targetRow, targetCol, maxSteps = 1) {
  const dir = DIR[player.facing];
  for (let step = 1; step <= maxSteps; step++) {
    const checkRow = player.gridRow + dir.dz * step;
    const checkCol = player.gridCol + dir.dx * step;
    if (checkRow === targetRow && checkCol === targetCol) return true;
    // A wall in an intermediate cell blocks both detection and projectiles
    if (!isPassable(checkRow, checkCol)) return false;
  }
  return false;
}

// ─────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────
export function initInput(camera) {
  const keyMap = {
    // Move forward / back
    'w': () => moveForward(camera, 1),
    'ArrowUp': () => moveForward(camera, 1),
    's': () => moveForward(camera, -1),
    'ArrowDown': () => moveForward(camera, -1),
    // Turn left / right
    'q': () => turnPlayer(camera, -1),
    'ArrowLeft': () => turnPlayer(camera, -1),
    'e': () => turnPlayer(camera, 1),
    'ArrowRight': () => turnPlayer(camera, 1),
    // Strafe left / right
    'a': () => strafePlayer(camera, -1),
    'd': () => strafePlayer(camera, 1),
    'Tab': () => {
      const wrap = document.getElementById('minimap-wrap');
      const wasHidden = wrap.classList.contains('hud-hidden');
      wrap.classList.toggle('hud-hidden');
      if (wasHidden) resetPan();
    },
    'm': () => {
      const wrap = document.getElementById('minimap-wrap');
      const wasHidden = wrap.classList.contains('hud-hidden');
      wrap.classList.toggle('hud-hidden');
      if (wasHidden) resetPan();
    },
    '=': () => {
      const wrap = document.getElementById('minimap-wrap');
      if (!wrap.classList.contains('hud-hidden')) changeZoom(0.25);
    },
    '-': () => {
      const wrap = document.getElementById('minimap-wrap');
      if (!wrap.classList.contains('hud-hidden')) changeZoom(-0.25);
    },
    '[': () => {
      const wrap = document.getElementById('minimap-wrap');
      if (!wrap.classList.contains('hud-hidden')) changeSize(-40);
    },
    ']': () => {
      const wrap = document.getElementById('minimap-wrap');
      if (!wrap.classList.contains('hud-hidden')) changeSize(40);
    },
    'f': () => {
      const wrap = document.getElementById('minimap-wrap');
      if (!wrap.classList.contains('hud-hidden')) toggleFullscreen();
    }
  };

  document.addEventListener('keydown', (e) => {
    const handler = keyMap[e.key];
    if (handler) { e.preventDefault(); handler(); }
  });
}


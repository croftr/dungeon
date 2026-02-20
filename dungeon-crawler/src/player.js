import { Tween, Easing, Group } from '@tweenjs/tween.js';

export const tweenGroup = new Group();
import { isPassable, cellToWorld, CELL_EXIT, dungeonMap } from './map.js';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
export const FACING_NAMES  = ['North', 'East', 'South', 'West'];
export const FACING_ANGLES = [0, -Math.PI / 2, Math.PI, Math.PI / 2]; // camera Y rotation

// dx/dz deltas per facing direction
const DIR = [
  { dx:  0, dz: -1 }, // 0 North
  { dx:  1, dz:  0 }, // 1 East
  { dx:  0, dz:  1 }, // 2 South
  { dx: -1, dz:  0 }, // 3 West
];

const MOVE_MS = 300; // tween duration

// ─────────────────────────────────────────────
//  PLAYER STATE
// ─────────────────────────────────────────────
export const player = {
  gridRow: 1,
  gridCol: 1,
  facing:  0,      // 0-3
  moving:  false,  // input lock during tween
};

// Callbacks set by main.js
let onMoved   = () => {};
let onReached = () => {};

export function setCallbacks({ moved, reached }) {
  onMoved   = moved   ?? onMoved;
  onReached = reached ?? onReached;
}

// ─────────────────────────────────────────────
//  MOVEMENT
// ─────────────────────────────────────────────
export function initPlayer(startRow, startCol, camera) {
  player.gridRow = startRow;
  player.gridCol = startCol;
  player.facing  = 0;

  const w = cellToWorld(startRow, startCol);
  camera.position.set(w.x, w.y, w.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = FACING_ANGLES[player.facing];
}

export function moveForward(camera, sign = 1) {
  if (player.moving) return;

  const dir    = DIR[player.facing];
  const newRow = player.gridRow + dir.dz * sign;
  const newCol = player.gridCol + dir.dx * sign;

  if (!isPassable(newRow, newCol)) {
    bumpFeedback(camera);
    return;
  }

  player.moving  = true;
  player.gridRow = newRow;
  player.gridCol = newCol;

  const target = cellToWorld(newRow, newCol);

  new Tween(camera.position, tweenGroup)
    .to({ x: target.x, z: target.z }, MOVE_MS)
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
  if (player.moving) return;
  player.moving = true;

  player.facing = ((player.facing + sign) + 4) % 4;

  const currentY = camera.rotation.y;
  const targetY  = FACING_ANGLES[player.facing];

  // Shortest angular path
  let delta = targetY - currentY;
  while (delta >  Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  const rot = { y: currentY };
  new Tween(rot, tweenGroup)
    .to({ y: currentY + delta }, MOVE_MS)
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
  if (player.moving) return;

  // The strafe direction is 90° to the right of current facing (+1 turn),
  // or 90° to the left (-1 turn), without changing player.facing.
  const strafeDir = DIR[((player.facing + sign) + 4) % 4];
  const newRow    = player.gridRow + strafeDir.dz;
  const newCol    = player.gridCol + strafeDir.dx;

  if (!isPassable(newRow, newCol)) {
    bumpFeedback(camera);
    return;
  }

  player.moving  = true;
  player.gridRow = newRow;
  player.gridCol = newCol;

  const target = cellToWorld(newRow, newCol);

  new Tween(camera.position, tweenGroup)
    .to({ x: target.x, z: target.z }, MOVE_MS)
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
  const dir  = DIR[player.facing];
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
//  INPUT
// ─────────────────────────────────────────────
export function initInput(camera) {
  const keyMap = {
    // Move forward / back
    'w'          : () => moveForward(camera,  1),
    'ArrowUp'    : () => moveForward(camera,  1),
    's'          : () => moveForward(camera, -1),
    'ArrowDown'  : () => moveForward(camera, -1),
    // Turn left / right
    'q'          : () => turnPlayer(camera, -1),
    'ArrowLeft'  : () => turnPlayer(camera, -1),
    'e'          : () => turnPlayer(camera,  1),
    'ArrowRight' : () => turnPlayer(camera,  1),
    // Strafe left / right
    'a'          : () => strafePlayer(camera, -1),
    'd'          : () => strafePlayer(camera,  1),
  };

  document.addEventListener('keydown', (e) => {
    const handler = keyMap[e.key];
    if (handler) { e.preventDefault(); handler(); }
  });
}

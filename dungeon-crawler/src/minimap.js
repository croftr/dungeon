import { dungeonMap, ROWS, COLS } from './map.js';
import { player, FACING_ANGLES, FACING_NAMES } from './player.js';

// ─────────────────────────────────────────────
//  MINIMAP  (2D canvas overlay)
// ─────────────────────────────────────────────
const CELL_COLORS = {
  0: 'rgba(60, 60, 60, 0.5)',  // floor (dark translucent)
  1: 'rgba(212, 196, 168, 0.8)', // wall outline color
  2: '#4a7a4a',               // start (faded green)
  3: '#8a4a4a',               // exit (faded red/rust)
  5: 'rgba(0, 0, 0, 0)',      // hole (fully transparent)
  6: '#5a5040',               // stairs
  8: 'rgba(200, 60, 30, 0.8)', // lava
};

let mmCtx = null;
let MM_CELL = 14;
let zoomLevel = 1.0;
let displaySize = 288;   // normal viewport size (px) — drives the whole wrap width
let vpSize = 288;        // current active viewport size (may differ in fullscreen)
let isFullscreen = false;
let panOffset = { x: 0, y: 0 };

const SIZE_MIN = 160;
const SIZE_MAX = 480;
const SIZE_STEP = 32;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4.0;

// Drive sizing through a CSS custom property on the wrap. The wrap's CSS pins
// its width to --mm-size and the status bar above naturally stretches to the
// same width; the viewport inside is width:100% + aspect-ratio:1/1 so it stays
// perfectly square no matter what.
function _setViewport(size) {
  vpSize = size;
  const wrap = document.getElementById('minimap-wrap');
  if (wrap) wrap.style.setProperty('--mm-size', size + 'px');
}

function _updateCellSize() {
  const canvas = document.getElementById('minimap');
  if (!canvas) return;
  const baseCell = vpSize / Math.max(ROWS, COLS);
  MM_CELL = Math.max(2, baseCell * zoomLevel);
  canvas.width = Math.round(COLS * MM_CELL);
  canvas.height = Math.round(ROWS * MM_CELL);
}

// Position canvas inside viewport: player-centered + pan offset
function _centerCanvas() {
  const canvas = document.getElementById('minimap');
  const vp = document.getElementById('mm-viewport');
  if (!canvas || !vp) return;

  const px = player.gridCol * MM_CELL + MM_CELL / 2;
  const py = player.gridRow * MM_CELL + MM_CELL / 2;

  let left = vpSize / 2 - px + panOffset.x;
  let top = vpSize / 2 - py + panOffset.y;

  // X axis — clamp, or center when map is smaller than viewport
  if (canvas.width <= vpSize) {
    left = (vpSize - canvas.width) / 2;
  } else {
    left = Math.max(vpSize - canvas.width, Math.min(0, left));
  }

  // Y axis
  if (canvas.height <= vpSize) {
    top = (vpSize - canvas.height) / 2;
  } else {
    top = Math.max(vpSize - canvas.height, Math.min(0, top));
  }

  canvas.style.left = left + 'px';
  canvas.style.top = top + 'px';
}

export function initMinimap() {
  const canvas = document.getElementById('minimap');
  _setViewport(displaySize);
  _updateCellSize();
  mmCtx = canvas.getContext('2d');

  document.getElementById('mm-zoom-in')?.addEventListener('click', () => changeZoom(0.25));
  document.getElementById('mm-zoom-out')?.addEventListener('click', () => changeZoom(-0.25));
  document.getElementById('mm-size-up')?.addEventListener('click', () => changeSize(SIZE_STEP));
  document.getElementById('mm-size-down')?.addEventListener('click', () => changeSize(-SIZE_STEP));
  document.getElementById('mm-fullscreen')?.addEventListener('click', () => toggleFullscreen());

  _initPanDrag();
}

function _initPanDrag() {
  const vp = document.getElementById('mm-viewport');
  if (!vp) return;

  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragStartPan = { x: 0, y: 0 };

  vp.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    dragStartPan = { ...panOffset };
    vp.classList.add('is-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panOffset.x = dragStartPan.x + (e.clientX - dragStart.x);
    panOffset.y = dragStartPan.y + (e.clientY - dragStart.y);
    _centerCanvas();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    vp.classList.remove('is-dragging');
  });

  vp.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    dragging = true;
    dragStart = { x: t.clientX, y: t.clientY };
    dragStartPan = { ...panOffset };
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    panOffset.x = dragStartPan.x + (t.clientX - dragStart.x);
    panOffset.y = dragStartPan.y + (t.clientY - dragStart.y);
    _centerCanvas();
  });

  document.addEventListener('touchend', () => { dragging = false; });
}

export function resetPan() {
  panOffset = { x: 0, y: 0 };
  drawMinimap();
}

export function changeZoom(delta) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel + delta));
  _updateCellSize();
  drawMinimap();
}

export function changeSize(delta) {
  if (isFullscreen) return;
  displaySize = Math.min(SIZE_MAX, Math.max(SIZE_MIN, displaySize + delta));
  _setViewport(displaySize);
  _updateCellSize();
  drawMinimap();
}

export function toggleFullscreen() {
  const wrap = document.getElementById('minimap-wrap');
  const btn = document.getElementById('mm-fullscreen');
  isFullscreen = !isFullscreen;
  wrap.classList.toggle('mm-fullscreen', isFullscreen);
  if (isFullscreen) {
    const size = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.85);
    _setViewport(size);
    if (btn) btn.title = 'Exit Fullscreen';
  } else {
    _setViewport(displaySize);
    if (btn) btn.title = 'Fullscreen';
  }
  _updateCellSize();
  drawMinimap();
}

export function drawMinimap() {
  if (!mmCtx) return;
  // Resize the canvas/cell to the *current* map bounds. ROWS/COLS are live
  // bindings that change on every level swap (changeMapArray), but nothing else
  // recomputes MM_CELL on a level change — without this, entering a map with
  // very different dimensions (e.g. the Crow Realm's 12×58 grid) leaves the
  // canvas sized for the previous level and the visible region clips away the
  // whole walkable area, so the minimap renders blank.
  _updateCellSize();
  const canvas = mmCtx.canvas;
  mmCtx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw floors and special cells first
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = dungeonMap[r][c];
      if (cell === 5) continue; // Skip holes

      // Fill passable areas with dark translucent grey
      if (cell !== 1) {
        mmCtx.fillStyle = CELL_COLORS[cell] ?? CELL_COLORS[0];
        mmCtx.fillRect(c * MM_CELL, r * MM_CELL, MM_CELL, MM_CELL);
      }
    }
  }

  // Draw wall outlines (Diablo 3 style)
  mmCtx.strokeStyle = CELL_COLORS[1];
  mmCtx.lineWidth = 1.5;
  mmCtx.lineCap = 'round';
  mmCtx.beginPath();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = dungeonMap[r][c];
      if (cell !== 1) continue; // Only process walls

      const x = c * MM_CELL;
      const y = r * MM_CELL;

      // Check neighbors: if neighbor is NOT a wall, draw an edge
      if (r === 0 || dungeonMap[r - 1][c] !== 1) { mmCtx.moveTo(x, y); mmCtx.lineTo(x + MM_CELL, y); }
      if (r === ROWS - 1 || dungeonMap[r + 1][c] !== 1) { mmCtx.moveTo(x, y + MM_CELL); mmCtx.lineTo(x + MM_CELL, y + MM_CELL); }
      if (c === 0 || dungeonMap[r][c - 1] !== 1) { mmCtx.moveTo(x, y); mmCtx.lineTo(x, y + MM_CELL); }
      if (c === COLS - 1 || dungeonMap[r][c + 1] !== 1) { mmCtx.moveTo(x + MM_CELL, y); mmCtx.lineTo(x + MM_CELL, y + MM_CELL); }
    }
  }
  mmCtx.stroke();

  // Very subtle grid on floors
  mmCtx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  mmCtx.lineWidth = 0.5;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (dungeonMap[r][c] === 0) {
        mmCtx.strokeRect(c * MM_CELL, r * MM_CELL, MM_CELL, MM_CELL);
      }
    }
  }

  // Player marker — directional vision cone + center dot.
  // The cone fans forward from the player's facing so there is no symmetry
  // and the heading is unambiguous at any zoom level.
  const px = player.gridCol * MM_CELL + MM_CELL / 2;
  const py = player.gridRow * MM_CELL + MM_CELL / 2;
  const angle = -FACING_ANGLES[player.facing];

  mmCtx.save();
  mmCtx.translate(px, py);
  mmCtx.rotate(angle);   // 0 rad points "up" on canvas, which is forward

  const dotR    = Math.max(2, MM_CELL * 0.22);   // player position dot
  const coneR   = MM_CELL * 1.25;                // cone reach
  const halfArc = Math.PI / 9;                   // 40° total field-of-view cone

  // Glow under the cone — gives forward direction an obvious "headlight" feel
  const coneGrad = mmCtx.createRadialGradient(0, 0, 0, 0, 0, coneR);
  coneGrad.addColorStop(0,   'rgba(255, 230, 150, 0.55)');
  coneGrad.addColorStop(0.6, 'rgba(255, 200, 110, 0.18)');
  coneGrad.addColorStop(1,   'rgba(255, 200, 110, 0)');
  mmCtx.fillStyle = coneGrad;
  mmCtx.beginPath();
  mmCtx.moveTo(0, 0);
  // -PI/2 is "up" (forward) in canvas coords after rotation
  mmCtx.arc(0, 0, coneR, -Math.PI / 2 - halfArc, -Math.PI / 2 + halfArc);
  mmCtx.closePath();
  mmCtx.fill();

  // Crisp leading edge so the cone reads even on busy backgrounds
  mmCtx.strokeStyle = 'rgba(255, 240, 180, 0.85)';
  mmCtx.lineWidth = 0.6;
  mmCtx.beginPath();
  mmCtx.moveTo(0, 0);
  mmCtx.lineTo(Math.cos(-Math.PI / 2 - halfArc) * coneR, Math.sin(-Math.PI / 2 - halfArc) * coneR);
  mmCtx.moveTo(0, 0);
  mmCtx.lineTo(Math.cos(-Math.PI / 2 + halfArc) * coneR, Math.sin(-Math.PI / 2 + halfArc) * coneR);
  mmCtx.stroke();

  // Player dot — solid bright core with dark outline for contrast
  mmCtx.fillStyle = '#ffe89a';
  mmCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  mmCtx.lineWidth = 1.25;
  mmCtx.beginPath();
  mmCtx.arc(0, 0, dotR, 0, Math.PI * 2);
  mmCtx.fill();
  mmCtx.stroke();

  mmCtx.restore();

  // Center canvas on player after each draw
  _centerCanvas();
}

// ─────────────────────────────────────────────
//  STATUS BAR
// ─────────────────────────────────────────────
const elPos = document.getElementById('st-pos');
const elFacing = document.getElementById('st-facing');
const elLevel = document.getElementById('st-level');

export const LEVEL_NAMES = {
  0: 'Crystal Vault',
  1: 'Level 1',
  2: 'Level 2',
  3: 'Level 3',
  4: 'Level 4',
  5: 'Hall of Heroes',
  60: 'The Crow Realm',
  99: 'The Arena'
};

export function updateStatus() {
  elPos.textContent = `(${player.gridCol}, ${player.gridRow})`;
  elFacing.textContent = FACING_NAMES[player.facing];
  const lv = window.currentLevel ?? 0;
  elLevel.textContent = LEVEL_NAMES[lv] ?? `Level ${lv}`;
}

// ─────────────────────────────────────────────
//  VICTORY MESSAGE
// ─────────────────────────────────────────────
let _messageDismissTimer = null;
export function showMessage(html, duration = 2500) {
  const el = document.getElementById('message');
  el.innerHTML = html;
  el.style.display = 'block';
  if (_messageDismissTimer) clearTimeout(_messageDismissTimer);
  _messageDismissTimer = setTimeout(() => {
    el.style.display = 'none';
    _messageDismissTimer = null;
  }, duration);
}

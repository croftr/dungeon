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
};

let mmCtx = null;
let MM_CELL = 14;
let zoomLevel = 1.0;
let displaySize = 200;   // normal viewport size (px)
let vpSize = 200;        // current active viewport size (may differ in fullscreen)
let isFullscreen = false;

const SIZE_MIN  = 120;
const SIZE_MAX  = 400;
const SIZE_STEP = 40;
const ZOOM_MIN  = 0.4;
const ZOOM_MAX  = 4.0;

function _setViewport(size) {
  vpSize = size;
  const vp = document.getElementById('mm-viewport');
  if (vp) { vp.style.width = size + 'px'; vp.style.height = size + 'px'; }
}

function _updateCellSize() {
  const canvas = document.getElementById('minimap');
  if (!canvas) return;
  const baseCell = vpSize / Math.max(ROWS, COLS);
  MM_CELL = Math.max(2, baseCell * zoomLevel);
  canvas.width  = Math.round(COLS * MM_CELL);
  canvas.height = Math.round(ROWS * MM_CELL);
}

// Position canvas inside viewport so player is centered
function _centerCanvas() {
  const canvas = document.getElementById('minimap');
  const vp     = document.getElementById('mm-viewport');
  if (!canvas || !vp) return;

  const px = player.gridCol * MM_CELL + MM_CELL / 2;
  const py = player.gridRow * MM_CELL + MM_CELL / 2;

  // X axis
  if (canvas.width <= vpSize) {
    canvas.style.left = ((vpSize - canvas.width)  / 2) + 'px';
  } else {
    canvas.style.left = Math.max(vpSize - canvas.width,  Math.min(0, vpSize / 2 - px)) + 'px';
  }

  // Y axis
  if (canvas.height <= vpSize) {
    canvas.style.top  = ((vpSize - canvas.height) / 2) + 'px';
  } else {
    canvas.style.top  = Math.max(vpSize - canvas.height, Math.min(0, vpSize / 2 - py)) + 'px';
  }
}

export function initMinimap() {
  const canvas = document.getElementById('minimap');
  _setViewport(displaySize);
  _updateCellSize();
  mmCtx = canvas.getContext('2d');

  document.getElementById('mm-zoom-in')   ?.addEventListener('click', () => changeZoom( 0.25));
  document.getElementById('mm-zoom-out')  ?.addEventListener('click', () => changeZoom(-0.25));
  document.getElementById('mm-size-up')   ?.addEventListener('click', () => changeSize( SIZE_STEP));
  document.getElementById('mm-size-down') ?.addEventListener('click', () => changeSize(-SIZE_STEP));
  document.getElementById('mm-fullscreen')?.addEventListener('click', () => toggleFullscreen());
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
  const btn  = document.getElementById('mm-fullscreen');
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
      if (r === 0 || dungeonMap[r - 1][c] !== 1) { mmCtx.moveTo(x, y);            mmCtx.lineTo(x + MM_CELL, y);            }
      if (r === ROWS - 1 || dungeonMap[r + 1][c] !== 1) { mmCtx.moveTo(x, y + MM_CELL);  mmCtx.lineTo(x + MM_CELL, y + MM_CELL);  }
      if (c === 0 || dungeonMap[r][c - 1] !== 1) { mmCtx.moveTo(x, y);            mmCtx.lineTo(x, y + MM_CELL);            }
      if (c === COLS - 1 || dungeonMap[r][c + 1] !== 1) { mmCtx.moveTo(x + MM_CELL, y);  mmCtx.lineTo(x + MM_CELL, y + MM_CELL);  }
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

  // Player Compass Needle
  const px = player.gridCol * MM_CELL + MM_CELL / 2;
  const py = player.gridRow * MM_CELL + MM_CELL / 2;
  const angle = -FACING_ANGLES[player.facing];

  mmCtx.save();
  mmCtx.translate(px, py);
  mmCtx.rotate(angle);

  const radius = MM_CELL * 0.6;

  // Outer glow
  const gradient = mmCtx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.5);
  gradient.addColorStop(0, 'rgba(232, 200, 122, 0.4)');
  gradient.addColorStop(1, 'rgba(232, 200, 122, 0)');
  mmCtx.fillStyle = gradient;
  mmCtx.beginPath();
  mmCtx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  mmCtx.fill();

  // North pointer
  mmCtx.fillStyle = '#ecf0f1';
  mmCtx.beginPath();
  mmCtx.moveTo(0, -radius);
  mmCtx.lineTo(radius * 0.3, 0);
  mmCtx.lineTo(-radius * 0.3, 0);
  mmCtx.closePath();
  mmCtx.fill();

  // South rear
  mmCtx.fillStyle = '#c0392b';
  mmCtx.beginPath();
  mmCtx.moveTo(0, radius);
  mmCtx.lineTo(radius * 0.3, 0);
  mmCtx.lineTo(-radius * 0.3, 0);
  mmCtx.closePath();
  mmCtx.fill();

  // Central pin
  mmCtx.fillStyle = '#2c3e50';
  mmCtx.beginPath();
  mmCtx.arc(0, 0, radius * 0.1, 0, Math.PI * 2);
  mmCtx.fill();

  mmCtx.restore();

  // Center canvas on player after each draw
  _centerCanvas();
}

// ─────────────────────────────────────────────
//  STATUS BAR
// ─────────────────────────────────────────────
const elPos    = document.getElementById('st-pos');
const elFacing = document.getElementById('st-facing');

export function updateStatus() {
  elPos.textContent    = `(${player.gridCol}, ${player.gridRow})`;
  elFacing.textContent = FACING_NAMES[player.facing];
}

// ─────────────────────────────────────────────
//  VICTORY MESSAGE
// ─────────────────────────────────────────────
let _messageDismissTimer = null;
export function showMessage(html, duration = 2500) {
  const el = document.getElementById('message');
  el.innerHTML  = html;
  el.style.display = 'block';
  if (_messageDismissTimer) clearTimeout(_messageDismissTimer);
  _messageDismissTimer = setTimeout(() => {
    el.style.display = 'none';
    _messageDismissTimer = null;
  }, duration);
}

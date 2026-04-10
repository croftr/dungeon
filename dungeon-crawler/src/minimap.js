import { dungeonMap, ROWS, COLS } from './map.js';
import { player, FACING_ANGLES, FACING_NAMES } from './player.js';

// ─────────────────────────────────────────────
//  MINIMAP  (2D canvas overlay)
// ─────────────────────────────────────────────
const CELL_COLORS = {
  0: '#2a2218', // floor
  1: '#7a6a55', // wall
  2: '#3355aa', // start
  3: '#22aa44', // exit
  5: '#000000', // hole
  6: '#aaaaaa', // stairs
};

let mmCtx    = null;
let MM_CELL  = 14;
let zoomLevel = 1.0;

export function initMinimap() {
  const canvas = document.getElementById('minimap');
  
  // Base cell size based on 200px / dimensions
  const baseCell = Math.floor(200 / Math.max(ROWS, COLS));
  MM_CELL = Math.max(4, Math.floor(baseCell * zoomLevel));
  
  canvas.width  = COLS * MM_CELL;
  canvas.height = ROWS * MM_CELL;
  mmCtx = canvas.getContext('2d');

  // Hook up controls
  document.getElementById('mm-zoom-in')?.addEventListener('click', () => {
    changeZoom(0.2);
  });
  document.getElementById('mm-zoom-out')?.addEventListener('click', () => {
    changeZoom(-0.2);
  });
}

export function changeZoom(delta) {
  zoomLevel = Math.min(3.0, Math.max(0.5, zoomLevel + delta));
  const canvas = document.getElementById('minimap');
  const baseCell = Math.floor(200 / Math.max(ROWS, COLS));
  MM_CELL = Math.max(4, Math.floor(baseCell * zoomLevel));
  
  canvas.width  = COLS * MM_CELL;
  canvas.height = ROWS * MM_CELL;
  drawMinimap();
}



export function drawMinimap() {
  if (!mmCtx) return;
  const canvas = mmCtx.canvas;
  mmCtx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = dungeonMap[r][c];
      mmCtx.fillStyle = CELL_COLORS[cell] ?? '#000';
      mmCtx.fillRect(c * MM_CELL, r * MM_CELL, MM_CELL - 1, MM_CELL - 1);
    }
  }

  // Player arrow
  const px = player.gridCol * MM_CELL + MM_CELL / 2;
  const py = player.gridRow * MM_CELL + MM_CELL / 2;

  // FACING_ANGLES is camera Y rotation; map canvas has Z going down,
  // so negate to get the correct arrow orientation.
  const angle = -FACING_ANGLES[player.facing];

  mmCtx.save();
  mmCtx.translate(px, py);
  mmCtx.rotate(angle);

  const r = MM_CELL * 0.45; // slightly larger arrow
  mmCtx.fillStyle = '#e8c87a';
  mmCtx.shadowBlur = 4;
  mmCtx.shadowColor = 'rgba(0,0,0,0.5)';
  mmCtx.beginPath();
  mmCtx.moveTo(0, -r);
  mmCtx.lineTo( r * 0.55,  r * 0.7);
  mmCtx.lineTo(0,          r * 0.35);
  mmCtx.lineTo(-r * 0.55,  r * 0.7);
  mmCtx.closePath();
  mmCtx.fill();

  mmCtx.restore();
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

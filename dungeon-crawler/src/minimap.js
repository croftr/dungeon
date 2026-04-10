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
      // Top
      if (r === 0 || dungeonMap[r - 1][c] !== 1) {
        mmCtx.moveTo(x, y);
        mmCtx.lineTo(x + MM_CELL, y);
      }
      // Bottom
      if (r === ROWS - 1 || dungeonMap[r + 1][c] !== 1) {
        mmCtx.moveTo(x, y + MM_CELL);
        mmCtx.lineTo(x + MM_CELL, y + MM_CELL);
      }
      // Left
      if (c === 0 || dungeonMap[r][c - 1] !== 1) {
        mmCtx.moveTo(x, y);
        mmCtx.lineTo(x, y + MM_CELL);
      }
      // Right
      if (c === COLS - 1 || dungeonMap[r][c + 1] !== 1) {
        mmCtx.moveTo(x + MM_CELL, y);
        mmCtx.lineTo(x + MM_CELL, y + MM_CELL);
      }
    }
  }
  mmCtx.stroke();

  // Draw a very subtle grid ONLY on floors (optional, keeping it extremely faint)
  mmCtx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  mmCtx.lineWidth = 0.5;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (dungeonMap[r][c] === 0) {
        mmCtx.strokeRect(c * MM_CELL, r * MM_CELL, MM_CELL, MM_CELL);
      }
    }
  }

  // Player Compass Needle (Grid drawing was removed here)
  const px = player.gridCol * MM_CELL + MM_CELL / 2;
  const py = player.gridRow * MM_CELL + MM_CELL / 2;
  const angle = -FACING_ANGLES[player.facing];

  mmCtx.save();
  mmCtx.translate(px, py);
  mmCtx.rotate(angle);

  const radius = MM_CELL * 0.6;
  
  // Outer glow for player pos
  const gradient = mmCtx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.5);
  gradient.addColorStop(0, 'rgba(232, 200, 122, 0.4)');
  gradient.addColorStop(1, 'rgba(232, 200, 122, 0)');
  mmCtx.fillStyle = gradient;
  mmCtx.beginPath();
  mmCtx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  mmCtx.fill();

  // Compass needle (North half - POINTER)
  mmCtx.fillStyle = '#ecf0f1'; // Bright white/gray for the pointer (Forward)
  mmCtx.beginPath();
  mmCtx.moveTo(0, -radius);
  mmCtx.lineTo(radius * 0.3, 0);
  mmCtx.lineTo(-radius * 0.3, 0);
  mmCtx.closePath();
  mmCtx.fill();

  // Compass needle (South half - REAR)
  mmCtx.fillStyle = '#c0392b'; // Dark red for the rear (South)
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

import { getItemDef } from './items.js';
import { renderItemIcon } from './equipment.js';

// ─────────────────────────────────────────────
//  PARTY DATA  — 4 members
// ─────────────────────────────────────────────
export const party = [
  { id: 0, isEmpty: true },
  { id: 1, isEmpty: true },
  { id: 2, isEmpty: true },
  { id: 3, isEmpty: true },
];

// ─────────────────────────────────────────────
//  PORTRAIT RENDERER
// ─────────────────────────────────────────────
function drawPortrait(canvas, member) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');

  if (member.image) {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);

      // Keep the vignette on top to match the style
      const vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, W, H);
    };
    img.src = member.image;
    return;
  }

  ctx.fillStyle = '#0d0a06';
  ctx.fillRect(0, 0, W, H);

  // Cloak / body
  const cloakGrad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  cloakGrad.addColorStop(0, '#2a1e0e');
  cloakGrad.addColorStop(1, '#0e0905');
  ctx.fillStyle = cloakGrad;
  ctx.beginPath();
  ctx.moveTo(W * 0.05, H);
  ctx.lineTo(W * 0.22, H * 0.58);
  ctx.lineTo(W * 0.5, H * 0.52);
  ctx.lineTo(W * 0.78, H * 0.58);
  ctx.lineTo(W * 0.95, H);
  ctx.closePath();
  ctx.fill();

  // Neck
  ctx.fillStyle = member.skinLight;
  ctx.fillRect(W * 0.41, H * 0.46, W * 0.18, H * 0.12);

  // Head
  const headCx = W * 0.5;
  const headCy = H * 0.33;
  const headRx = W * 0.21;
  const headRy = H * 0.23;

  const skinGrad = ctx.createRadialGradient(
    headCx - headRx * 0.2, headCy - headRy * 0.2, headRy * 0.1,
    headCx, headCy, headRy * 1.2
  );
  skinGrad.addColorStop(0, member.skinLight);
  skinGrad.addColorStop(1, member.skinDark);
  ctx.fillStyle = skinGrad;
  ctx.beginPath();
  ctx.ellipse(headCx, headCy, headRx, headRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = member.hairColor;
  ctx.beginPath();
  ctx.ellipse(headCx, headCy - headRy * 0.6, headRx * 1.05, headRy * 0.55, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headCx - headRx * 0.85, headCy - headRy * 0.1, headRx * 0.22, headRy * 0.45, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headCx + headRx * 0.85, headCy - headRy * 0.1, headRx * 0.22, headRy * 0.45, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeY = headCy - headRy * 0.05;
  const eyeOX = headRx * 0.38;
  const eyeR = W * 0.05;

  ctx.fillStyle = '#e8dcc8';
  ctx.beginPath();
  ctx.ellipse(headCx - eyeOX, eyeY, eyeR * 1.1, eyeR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headCx + eyeOX, eyeY, eyeR * 1.1, eyeR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = member.irisColor;
  ctx.beginPath();
  ctx.arc(headCx - eyeOX, eyeY, eyeR * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(headCx + eyeOX, eyeY, eyeR * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#080400';
  ctx.beginPath();
  ctx.arc(headCx - eyeOX, eyeY, eyeR * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(headCx + eyeOX, eyeY, eyeR * 0.38, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrows
  ctx.strokeStyle = member.hairColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(headCx - eyeOX - eyeR, eyeY - eyeR * 1.4);
  ctx.quadraticCurveTo(headCx - eyeOX, eyeY - eyeR * 2, headCx - eyeOX + eyeR, eyeY - eyeR * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(headCx + eyeOX - eyeR, eyeY - eyeR * 1.4);
  ctx.quadraticCurveTo(headCx + eyeOX, eyeY - eyeR * 2, headCx + eyeOX + eyeR, eyeY - eyeR * 1.4);
  ctx.stroke();

  // Nose
  ctx.strokeStyle = member.skinDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(headCx, eyeY + eyeR * 0.5);
  ctx.lineTo(headCx - eyeR * 0.5, eyeY + eyeR * 2.2);
  ctx.lineTo(headCx + eyeR * 0.5, eyeY + eyeR * 2.2);
  ctx.stroke();

  // Mouth
  ctx.strokeStyle = member.skinDark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(headCx - eyeR * 0.9, eyeY + eyeR * 3.2);
  ctx.quadraticCurveTo(headCx, eyeY + eyeR * 3.6, headCx + eyeR * 0.9, eyeY + eyeR * 3.2);
  ctx.stroke();

  // Torchlight glow overlay
  const glowGrad = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.9);
  glowGrad.addColorStop(0, 'rgba(255,160,40,0.12)');
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);
}

// ─────────────────────────────────────────────
//  DOM REFRESH
// ─────────────────────────────────────────────
function pct(val, max) {
  return Math.max(0, Math.min(100, (val / max) * 100)).toFixed(1) + '%';
}

function refreshMember(m) {
  const i = m.id;
  const card = document.getElementById(`member-${i}`);

  if (m.isEmpty) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = 'flex';

  const nameEl = document.getElementById(`name-${i}`);
  if (nameEl) nameEl.textContent = m.name;

  const hpFill = document.getElementById(`bar-hp-${i}`);
  const mpFill = document.getElementById(`bar-mp-${i}`);
  const spFill = document.getElementById(`bar-sp-${i}`);
  if (hpFill) hpFill.style.width = pct(m.hp, m.hpMax);
  if (mpFill) mpFill.style.width = pct(m.mp, m.mpMax);
  if (spFill) spFill.style.width = pct(m.sp ?? 100, m.spMax ?? 100);

  const hpVal = document.getElementById(`val-hp-${i}`);
  const mpVal = document.getElementById(`val-mp-${i}`);
  const spVal = document.getElementById(`val-sp-${i}`);
  if (hpVal) hpVal.textContent = `${m.hp}/${m.hpMax}`;
  if (mpVal) mpVal.textContent = `${m.mp}/${m.mpMax}`;
  if (spVal) spVal.textContent = `${m.sp ?? 100}/${m.spMax ?? 100}`;

  const lhEl = document.getElementById(`item-lh-${i}`);
  const rhEl = document.getElementById(`item-rh-${i}`);
  const skEl = document.getElementById(`item-sk-${i}`);
  const lhSlot = document.getElementById(`slot-lh-${i}`);
  const rhSlot = document.getElementById(`slot-rh-${i}`);
  const skSlot = document.getElementById(`slot-sk-${i}`);

  // Use m.equipment as the authoritative source when it exists (after the equipment
  // modal has initialised it), otherwise fall back to the initial hand-assignment strings.
  const lhName = m.equipment
    ? (m.equipment.leftHand?.name ?? null)
    : (m.leftHand && m.leftHand !== '—' ? m.leftHand : null);
  const rhName = m.equipment
    ? (m.equipment.rightHand?.name ?? null)
    : (m.rightHand && m.rightHand !== '—' ? m.rightHand : null);
  const skName = m.equipment
    ? (m.equipment.skill?.name ?? null)
    : null;

  let lhDef = null;
  let rhDef = null;
  try {
    if (lhName) lhDef = getItemDef(lhName);
    if (rhName) rhDef = getItemDef(rhName);
    if (skName) getItemDef(skName);
  } catch (e) {
    console.warn('Could not get item def:', e);
  }

  const lhBothHands = lhDef?.slot === 'bothHands';

  // Passive items (no attackType, e.g. Shield) are shown faded
  const lhNoAction = lhDef !== null && lhDef?.attackType == null && !lhBothHands;
  const rhNoAction = rhDef !== null && rhDef?.attackType == null && !lhBothHands;

  if (lhEl) renderItemIcon(lhName ? { name: lhName } : null, lhEl);
  if (rhEl) renderItemIcon((lhBothHands ? lhName : rhName) ? { name: lhBothHands ? lhName : rhName } : null, rhEl);
  if (skEl) renderItemIcon(skName ? { name: skName } : null, skEl);

  if (lhSlot) {
    lhSlot.classList.toggle('slot-empty', !lhName);
    lhSlot.classList.toggle('slot-no-action', lhNoAction);
  }
  if (rhSlot) {
    rhSlot.classList.toggle('slot-empty', !lhBothHands && !rhName);
    rhSlot.classList.toggle('both-hands-secondary', lhBothHands);
    rhSlot.classList.toggle('slot-no-action', !lhBothHands && rhNoAction);
  }
  if (skSlot) {
    skSlot.classList.toggle('slot-empty', !skName);
  }
}

// ─────────────────────────────────────────────
//  SWAP HELPERS
// ─────────────────────────────────────────────

/** Swaps two party slots (by index), keeping id fields correct, then redraws. */
function swapSlots(a, b) {
  const tmp = { ...party[a] };
  party[a] = { ...party[b], id: a };
  party[b] = { ...tmp, id: b };
  refreshAll();
}

function refreshAll() {
  party.forEach((member) => {
    const canvas = document.getElementById(`portrait-${member.id}`);
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      if (!member.isEmpty) drawPortrait(canvas, member);
    }
    refreshMember(member);
  });
}

// ─────────────────────────────────────────────
//  PARTY TACTICS MODAL
// ─────────────────────────────────────────────

let tacticsOverlay = null;
let tacticsSel = null; // currently selected slot index (null = none)

function buildTacticsOverlay() {
  tacticsOverlay = document.createElement('div');
  tacticsOverlay.id = 'tactics-overlay';
  tacticsOverlay.style.display = 'none';
  tacticsOverlay.innerHTML = `
    <div id="tactics-modal">
      <div id="tactics-header">
        <span>Party Tactics</span>
        <button id="tactics-close" aria-label="Close">&times;</button>
      </div>
      <div id="tactics-body">
        <div class="tactics-row-label">Front Row &mdash; Melee &amp; Ranged</div>
        <div class="tactics-row" id="tactics-front"></div>
        <button id="tactics-swap-rows">&#8597; Swap Rows</button>
        <div class="tactics-row-label tactics-row-label--back">Back Row &mdash; Ranged only</div>
        <div class="tactics-row" id="tactics-back"></div>
        <p class="tactics-hint">Click a character to select &bull; Click another slot to move them</p>
      </div>
    </div>
  `;
  document.body.appendChild(tacticsOverlay);

  document.getElementById('tactics-close').addEventListener('click', closeTacticsModal);
  document.getElementById('tactics-swap-rows').addEventListener('click', () => {
    tacticsSel = null;
    swapSlots(0, 2);
    swapSlots(1, 3);
    renderTacticsSlots();
  });
  // Close on backdrop click
  tacticsOverlay.addEventListener('click', (e) => {
    if (e.target === tacticsOverlay) closeTacticsModal();
  });
}

function renderTacticsSlots() {
  const frontEl = document.getElementById('tactics-front');
  const backEl = document.getElementById('tactics-back');
  if (!frontEl || !backEl) return;

  [frontEl, backEl].forEach(el => (el.innerHTML = ''));

  party.forEach((m, i) => {
    const cell = document.createElement('div');
    cell.className = 'tactics-slot' +
      (m.isEmpty ? ' empty-slot' : '') +
      (i === tacticsSel ? ' selected' : '');

    if (m.isEmpty) {
      cell.innerHTML = '<span class="tactics-empty">Empty</span>';
    } else {
      const canvas = document.createElement('canvas');
      canvas.className = 'tactics-portrait';
      canvas.width = 56;
      canvas.height = 56;
      cell.appendChild(canvas);
      drawPortrait(canvas, m);

      const nameEl = document.createElement('span');
      nameEl.className = 'tactics-name';
      nameEl.textContent = m.name;
      cell.appendChild(nameEl);

      if (m.job) {
        const jobEl = document.createElement('span');
        jobEl.className = 'tactics-job';
        jobEl.textContent = m.job;
        cell.appendChild(jobEl);
      }

      cell.addEventListener('click', () => handleTacticsSlotClick(i));
    }

    (i < 2 ? frontEl : backEl).appendChild(cell);
  });
}

function handleTacticsSlotClick(index) {
  if (party[index].isEmpty) return;

  if (tacticsSel === null) {
    tacticsSel = index;
    renderTacticsSlots();
  } else if (tacticsSel === index) {
    tacticsSel = null;
    renderTacticsSlots();
  } else {
    swapSlots(tacticsSel, index);
    tacticsSel = null;
    renderTacticsSlots();
  }
}

export function openTacticsModal() {
  tacticsSel = null;
  renderTacticsSlots();
  tacticsOverlay.style.display = 'flex';
}

function closeTacticsModal() {
  tacticsSel = null;
  tacticsOverlay.style.display = 'none';
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
export function initParty() {
  party.forEach((member) => {
    const canvas = document.getElementById(`portrait-${member.id}`);
    if (canvas && !member.isEmpty) drawPortrait(canvas, member);
    refreshMember(member);
  });

  buildTacticsOverlay();

  // Tactics button (bottom-right panel)
  document.getElementById('tactics-btn')?.addEventListener('click', openTacticsModal);

  // P key opens/closes the tactics modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      if (tacticsOverlay.style.display === 'none') {
        openTacticsModal();
      } else {
        closeTacticsModal();
      }
    }
    if (e.key === 'Escape' && tacticsOverlay.style.display !== 'none') {
      closeTacticsModal();
    }
  });
}

/** Called by equipment.js whenever the equipment modal closes, so party cards stay in sync. */
export function refreshPartyCards() {
  refreshAll();
}

window.onPartyChanged = () => {
  refreshAll();
};

// ─────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────
export function setHp(index, value) {
  const m = party[index];
  if (!m) return;
  m.hp = Math.max(0, Math.min(m.hpMax, value));
  refreshMember(m);
}

export function setMp(index, value) {
  const m = party[index];
  if (!m) return;
  m.mp = Math.max(0, Math.min(m.mpMax, value));
  refreshMember(m);
}

export function setEquip(index, hand, itemName) {
  const m = party[index];
  if (!m) return;
  if (hand === 'left') m.leftHand = itemName;
  if (hand === 'right') m.rightHand = itemName;
  refreshMember(m);
}

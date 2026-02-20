import { getItemDef } from './items.js';

// ─────────────────────────────────────────────
//  PARTY DATA  — 4 members
// ─────────────────────────────────────────────
export const party = [
  {
    id: 0, name: 'Aldric',
    hp: 80,  hpMax: 100,
    mp: 55,  mpMax: 100,
    leftHand: 'Torch', rightHand: 'Sword',
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    skills: [
      { name: 'Dual-Wielding',          description: 'Equip a weapon in the off-hand slot. Attacking triggers two cooldowns — one per weapon.' },
      { name: 'Whirlwind',              description: 'With a two-handed weapon, strikes the enemy ahead and the two diagonal enemies simultaneously.' },
    ],
    // Portrait palette overrides
    skinLight: '#d4a070', skinDark: '#8a5830',
    hairColor: '#1a0e04',
    irisColor: '#7a4a10',
  },
  {
    id: 1, name: 'Seraphina',
    hp: 60,  hpMax: 80,
    mp: 95,  mpMax: 120,
    leftHand: 'Staff', rightHand: 'Staff',
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    skills: [
      { name: 'Runic Scholar',          description: 'Read ancient wall inscriptions to uncover puzzle hints or gain permanent stat buffs.' },
      { name: 'Field Medic',            description: 'Use Bandages or Heal actions during combat, not just while resting.' },
    ],
    skinLight: '#e8c8a0', skinDark: '#b08050',
    hairColor: '#8a1a1a',  // auburn
    irisColor: '#2a6a3a',  // green
  },
  {
    id: 2, name: 'Dorak',
    hp: 110, hpMax: 130,
    mp: 20,  mpMax: 40,
    leftHand: 'Shield', rightHand: 'Axe',
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    skills: [
      { name: 'Trap Disarming',         description: 'Highlights pressure plates within 2 tiles. Right-click to disable them before they trigger.' },
      { name: 'Lockpicking',            description: 'Open iron doors or chests without a key, or by consuming a Lockpick item.' },
    ],
    skinLight: '#b07840', skinDark: '#6a3818',
    hairColor: '#3a2808',  // dark brown
    irisColor: '#4a3020',  // brown
  },
  {
    id: 3, name: 'Lyra',
    hp: 50,  hpMax: 70,
    mp: 80,  mpMax: 90,
    leftHand: 'Bow', rightHand: 'Bow',
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    skills: [
      { name: 'Point-Blank Shot',       description: 'No accuracy penalty when firing a Bow or Crossbow at an enemy in the adjacent tile.' },
      { name: 'Botanist',               description: '50% chance to find two Herbs instead of one when clicking a Herb on the ground.' },
    ],
    skinLight: '#f0d8b0', skinDark: '#c09860',
    hairColor: '#c8b040',  // blonde
    irisColor: '#1a4a7a',  // blue
  },
];

// ─────────────────────────────────────────────
//  PORTRAIT RENDERER
// ─────────────────────────────────────────────
function drawPortrait(canvas, member) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');

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
  ctx.lineTo(W * 0.5,  H * 0.52);
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
  const eyeY  = headCy - headRy * 0.05;
  const eyeOX = headRx * 0.38;
  const eyeR  = W * 0.05;

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

  document.getElementById(`name-${i}`).textContent    = m.name;

  const hpFill = document.getElementById(`bar-hp-${i}`);
  const mpFill = document.getElementById(`bar-mp-${i}`);
  if (hpFill) hpFill.style.width = pct(m.hp, m.hpMax);
  if (mpFill) mpFill.style.width = pct(m.mp, m.mpMax);

  const hpVal = document.getElementById(`val-hp-${i}`);
  const mpVal = document.getElementById(`val-mp-${i}`);
  if (hpVal) hpVal.textContent = `${m.hp}/${m.hpMax}`;
  if (mpVal) mpVal.textContent = `${m.mp}/${m.mpMax}`;

  const lhEl   = document.getElementById(`item-lh-${i}`);
  const rhEl   = document.getElementById(`item-rh-${i}`);
  const lhSlot = document.getElementById(`slot-lh-${i}`);
  const rhSlot = document.getElementById(`slot-rh-${i}`);

  // Check if the left-hand item is bothHands — if so, right slot shows it faded
  const lhDef       = m.leftHand && m.leftHand !== '—' ? getItemDef(m.leftHand) : null;
  const lhBothHands = lhDef?.slot === 'bothHands';

  // For single-hand items with no attackType (e.g. Shield), fade the slot to show it's passive
  const lhNoAction  = lhDef !== null && lhDef?.attackType == null && !lhBothHands;
  const rhDef       = !lhBothHands && m.rightHand && m.rightHand !== '—' ? getItemDef(m.rightHand) : null;
  const rhNoAction  = rhDef !== null && rhDef?.attackType == null;

  if (lhEl) lhEl.textContent = m.leftHand  || '—';
  if (rhEl) rhEl.textContent = lhBothHands ? m.leftHand : (m.rightHand || '—');

  if (lhSlot) {
    lhSlot.classList.toggle('slot-empty',    !m.leftHand || m.leftHand === '—');
    lhSlot.classList.toggle('slot-no-action', lhNoAction);
  }
  if (rhSlot) {
    rhSlot.classList.toggle('slot-empty',           !lhBothHands && (!m.rightHand || m.rightHand === '—'));
    rhSlot.classList.toggle('both-hands-secondary', lhBothHands);
    rhSlot.classList.toggle('slot-no-action',       !lhBothHands && rhNoAction);
  }
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
export function initParty() {
  party.forEach((member) => {
    const canvas = document.getElementById(`portrait-${member.id}`);
    if (canvas) drawPortrait(canvas, member);
    refreshMember(member);
  });
}

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
  if (hand === 'left')  m.leftHand  = itemName;
  if (hand === 'right') m.rightHand = itemName;
  refreshMember(m);
}

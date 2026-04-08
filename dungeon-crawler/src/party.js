import { getItemDef } from './items.js';
import { renderItemIcon, attachTooltipListeners, hideTooltip, rotateLoadout, clearAutoAttackTimers, clearAutoRangeAttackTimers, updateEffectiveStats } from './equipment.js';
import { addLogEntry } from './battle-log.js';
import { isInCombat, playGoldSound, playPartyHitSound } from './audio.js';
import { showMessage } from './minimap.js';
import { skillsState } from './skills-state.js';
import { SPELLS } from './spells.js';
import SKILLS_DATA from './data/skills.json';
import { STATUS_EFFECT_DEFS } from './status-effects.js';
import { asset } from './assets.js';

// ─────────────────────────────────────────────
//  PARTY DATA  — 4 members
// ─────────────────────────────────────────────
export const party = [
  { id: 0, isEmpty: true },
  { id: 1, isEmpty: true },
  { id: 2, isEmpty: true },
  { id: 3, isEmpty: true },
];

export let partyGold = 0;

export let autoAttack = true;
export function setAutoAttack(val) { autoAttack = val; }

export let autoRangeAttack = true;
export function setAutoRangeAttack(val) { autoRangeAttack = val; }

export function addGold(amount) {
  partyGold += amount;
  if (amount > 0) playGoldSound();
  updateGoldDisplay();
}

export function removeGold(amount) {
  partyGold = Math.max(0, partyGold - amount);
  if (amount > 0) playGoldSound();
  updateGoldDisplay();
}

export function setPartyGold(amount) {
  partyGold = Math.max(0, amount);
  updateGoldDisplay();
}

function updateGoldDisplay() {
  const el = document.getElementById('tactics-gold');
  if (el) el.innerHTML = `<img src="${asset('/icons/gold_coins.webp')}" class="gold-icon-click" style="width:16px; height:16px; margin-right:4px; cursor:pointer;">${partyGold}`;
}

export const lastAttackTimes = {};

// ─────────────────────────────────────────────
//  PORTRAIT RENDERER
// ─────────────────────────────────────────────
export function drawPortrait(canvas, member) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');

  // ── DEAD STATE ────────────────────────────────────────────────────────────
  if (member.isDead) {
    const cx = W * 0.5;
    const cy = H * 0.43;

    // Near-black background
    ctx.fillStyle = '#050302';
    ctx.fillRect(0, 0, W, H);

    // Blood-red ember glow rising from below
    const ember = ctx.createRadialGradient(cx, H * 1.05, 0, cx, H * 0.75, H * 0.75);
    ember.addColorStop(0, 'rgba(100, 10, 3, 0.55)');
    ember.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ember;
    ctx.fillRect(0, 0, W, H);

    ctx.save();

    // Crossbones — drawn first (behind skull), near-black so they recede
    ctx.strokeStyle = '#28180e';
    ctx.lineWidth = W * 0.052;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.10, H * 0.26); ctx.lineTo(W * 0.90, H * 0.92); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.90, H * 0.26); ctx.lineTo(W * 0.10, H * 0.92); ctx.stroke();
    ctx.fillStyle = '#28180e';
    for (const [bx, by] of [[W * 0.10, H * 0.26], [W * 0.90, H * 0.92], [W * 0.90, H * 0.26], [W * 0.10, H * 0.92]]) {
      ctx.beginPath(); ctx.arc(bx, by, W * 0.058, 0, Math.PI * 2); ctx.fill();
    }

    // Skull cranium — elongated ellipse, gradient-shaded for depth
    const skW = W * 0.34;
    const skH = H * 0.31;
    const skullGrad = ctx.createRadialGradient(
      cx - skW * 0.22, cy - skH * 0.28, 0,
      cx + skW * 0.05, cy, Math.max(skW, skH) * 1.15
    );
    skullGrad.addColorStop(0, '#8a7860');  // lit highlight
    skullGrad.addColorStop(0.42, '#62503a');  // midtone
    skullGrad.addColorStop(1, '#251808');  // shadow edge
    ctx.fillStyle = skullGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, skW, skH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lower jaw / cheek — darker, narrower
    const jawGrad = ctx.createLinearGradient(0, cy + skH * 0.15, 0, cy + skH * 0.85);
    jawGrad.addColorStop(0, '#4e3c28');
    jawGrad.addColorStop(1, '#160e06');
    ctx.fillStyle = jawGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + skH * 0.52, skW * 0.72, skH * 0.37, 0, 0, Math.PI);
    ctx.fill();

    // Eye sockets — large dark voids, slightly angled
    ctx.fillStyle = '#080402';
    ctx.beginPath();
    ctx.ellipse(cx - skW * 0.43, cy - skH * 0.07, skW * 0.26, skH * 0.31, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + skW * 0.43, cy - skH * 0.07, skW * 0.26, skH * 0.31, 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Hellfire glow inside sockets
    const eyeGlow = (ex, ey) => {
      const g = ctx.createRadialGradient(ex, ey + skH * 0.1, 0, ex, ey, skW * 0.22);
      g.addColorStop(0, 'rgba(170, 20, 5, 0.75)');
      g.addColorStop(0.5, 'rgba(70, 8, 2, 0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ex, ey - skH * 0.07, skW * 0.26, skH * 0.31, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    eyeGlow(cx - skW * 0.43, cy);
    eyeGlow(cx + skW * 0.43, cy);

    // Nose cavity — inverted teardrop
    ctx.fillStyle = '#080402';
    ctx.beginPath();
    ctx.moveTo(cx, cy + skH * 0.17);
    ctx.bezierCurveTo(cx - skW * 0.11, cy + skH * 0.27, cx - skW * 0.09, cy + skH * 0.42, cx, cy + skH * 0.44);
    ctx.bezierCurveTo(cx + skW * 0.09, cy + skH * 0.42, cx + skW * 0.11, cy + skH * 0.27, cx, cy + skH * 0.17);
    ctx.fill();

    // Grimace — tight clenched line, no grinning teeth
    ctx.strokeStyle = '#160e06';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - skW * 0.27, cy + skH * 0.64);
    ctx.bezierCurveTo(cx - skW * 0.10, cy + skH * 0.59, cx + skW * 0.10, cy + skH * 0.59, cx + skW * 0.27, cy + skH * 0.64);
    ctx.stroke();

    // Forehead crack
    ctx.strokeStyle = 'rgba(15, 8, 3, 0.65)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx + skW * 0.07, cy - skH * 0.82);
    ctx.lineTo(cx - skW * 0.04, cy - skH * 0.52);
    ctx.lineTo(cx + skW * 0.09, cy - skH * 0.28);
    ctx.stroke();

    ctx.restore();

    // Heavy vignette — skull emerges from darkness
    const vig = ctx.createRadialGradient(cx, cy - H * 0.04, H * 0.06, cx, cy, H * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.62, 'rgba(0,0,0,0.18)');
    vig.addColorStop(1, 'rgba(0,0,0,0.94)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    return;
  }

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
    img.src = asset(member.image);
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
  if (card) card.classList.toggle('member-card--dead', !!m.isDead);

  // Party buff visual states
  const now2 = performance.now();
  const hasInvincible = (m.activeDebuffs ?? []).some(d => now2 < d.expiresAt && STATUS_EFFECT_DEFS[d.effectId]?.invincible);
  const hasUnseen = (m.activeDebuffs ?? []).some(d => now2 < d.expiresAt && STATUS_EFFECT_DEFS[d.effectId]?.unseen);
  if (card) card.classList.toggle('member-card--invincible', hasInvincible && !m.isDead);
  if (card) card.classList.toggle('member-card--unseen', hasUnseen && !m.isDead);

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
  if (hpVal) hpVal.textContent = `${Math.ceil(m.hp)}/${m.hpMax}`;
  if (mpVal) mpVal.textContent = `${Math.ceil(m.mp)}/${m.mpMax}`;
  if (spVal) spVal.textContent = `${Math.ceil(m.sp ?? 100)}/${m.spMax ?? 100}`;

  const lhEl = document.getElementById(`item-lh-${i}`);
  const rhEl = document.getElementById(`item-rh-${i}`);
  const skEl = document.getElementById(`item-sk-${i}`);
  const sk2El = document.getElementById(`item-sk2-${i}`);
  const sk3El = document.getElementById(`item-sk3-${i}`);
  const sk4El = document.getElementById(`item-sk4-${i}`);
  const sk5El = document.getElementById(`item-sk5-${i}`);
  const sk6El = document.getElementById(`item-sk6-${i}`);
  const lhSlot = document.getElementById(`slot-lh-${i}`);
  const rhSlot = document.getElementById(`slot-rh-${i}`);
  const skSlot = document.getElementById(`slot-sk-${i}`);
  const sk2Slot = document.getElementById(`slot-sk2-${i}`);
  const sk3Slot = document.getElementById(`slot-sk3-${i}`);
  const sk4Slot = document.getElementById(`slot-sk4-${i}`);
  const sk5Slot = document.getElementById(`slot-sk5-${i}`);
  const sk6Slot = document.getElementById(`slot-sk6-${i}`);

  // Use m.equipment as the authoritative source when it exists (after the equipment
  // modal has initialised it), otherwise fall back to the initial hand-assignment strings.
  let lhName = m.equipment
    ? (m.equipment.leftHand?.name ?? null)
    : (m.leftHand && m.leftHand !== '—' ? m.leftHand : null);
  let rhName = m.equipment
    ? (m.equipment.rightHand?.name ?? null)
    : (m.rightHand && m.rightHand !== '—' ? m.rightHand : null);
  const skName = m.equipment
    ? (m.equipment.skill?.name ?? null)
    : null;
  const sk2Name = m.equipment?.skill2?.name ?? null;
  const sk3Name = m.equipment?.skill3?.name ?? null;
  const sk4Name = m.equipment?.skill4?.name ?? null;
  const sk5Name = m.equipment?.skill5?.name ?? null;
  const sk6Name = m.equipment?.skill6?.name ?? null;

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
  if (skEl) renderItemIcon(m.equipment?.skill ?? null, skEl);
  if (sk2El) renderItemIcon(m.equipment?.skill2 ?? null, sk2El);
  if (sk3El) renderItemIcon(m.equipment?.skill3 ?? null, sk3El);
  if (sk4El) renderItemIcon(m.equipment?.skill4 ?? null, sk4El);
  if (sk5El) renderItemIcon(m.equipment?.skill5 ?? null, sk5El);
  if (sk6El) renderItemIcon(m.equipment?.skill6 ?? null, sk6El);

  if (!m.cooldownTimers) m.cooldownTimers = {};

  if (lhSlot) {
    lhSlot.classList.toggle('slot-empty', !lhName);
    lhSlot.classList.toggle('slot-no-action', lhNoAction);

    // Check cooldown for left slot
    let lhDelaySec = (lhDef?.delay ?? 2);
    if (skillsState.whirlwind.active && skillsState.whirlwind.actorName === m.name) {
      lhDelaySec *= skillsState.whirlwind.magnitude;
    }
    if (skillsState.warDance.active) {
      lhDelaySec *= skillsState.warDance.magnitude;
    }
    lhDelaySec *= getAttackSpeedMultiplier(m);

    const lhTimeKey = (lhDef?.slot === 'spell' && lhName) ? `${i}-left-${lhName}` : `${i}-left`;
    const lastUsed = lastAttackTimes[lhTimeKey];
    const lhCanAttack = lastUsed === undefined || (performance.now() - lastUsed) >= (lhDelaySec * 1000);
    lhSlot.classList.toggle('slot-cooling-down', !lhCanAttack);
    const lhNoMp = (lhDef?.mpCost ?? 0) > 0 && m.mp < lhDef.mpCost;
    lhSlot.classList.toggle('slot-no-mp', lhNoMp);
    // Auto-refresh when cooldown expires if it's currently on cooldown
    if (!lhCanAttack && !m.cooldownTimers['left']) {
      m.cooldownTimers['left'] = setTimeout(() => {
        m.cooldownTimers['left'] = null;
        refreshMember(m);
      }, (lhDelaySec * 1000) - (performance.now() - lastUsed));
    }
  }
  if (rhSlot) {
    rhSlot.classList.toggle('slot-empty', !lhBothHands && !rhName);
    rhSlot.classList.toggle('both-hands-secondary', lhBothHands);
    rhSlot.classList.toggle('slot-no-action', !lhBothHands && rhNoAction);

    // Check cooldown for right slot
    const rhActualDef = lhBothHands ? lhDef : rhDef;
    let rhDelaySec = (rhActualDef?.delay ?? 2);
    if (skillsState.whirlwind.active && skillsState.whirlwind.actorName === m.name) {
      rhDelaySec *= skillsState.whirlwind.magnitude;
    }
    if (skillsState.warDance.active) {
      rhDelaySec *= skillsState.warDance.magnitude;
    }
    rhDelaySec *= getAttackSpeedMultiplier(m);

    const rhCurName = lhBothHands ? lhName : rhName;
    const rhCurDef = lhBothHands ? lhDef : rhDef;
    const rhTimeKey = (!lhBothHands && rhCurDef?.slot === 'spell' && rhCurName)
      ? `${i}-right-${rhCurName}` : (lhBothHands ? `${i}-left` : `${i}-right`);
    const lastUsed = lastAttackTimes[rhTimeKey];
    const rhCanAttack = lastUsed === undefined || (performance.now() - lastUsed) >= (rhDelaySec * 1000);

    rhSlot.classList.toggle('slot-cooling-down', !rhCanAttack);
    const rhNoMp = (rhActualDef?.mpCost ?? 0) > 0 && m.mp < rhActualDef.mpCost;
    rhSlot.classList.toggle('slot-no-mp', rhNoMp);
    if (!rhCanAttack && !m.cooldownTimers['right']) {
      const remaining = (rhDelaySec * 1000) - (performance.now() - lastUsed);
      m.cooldownTimers['right'] = setTimeout(() => {
        m.cooldownTimers['right'] = null;
        refreshMember(m);
      }, remaining);
    }
  }
  if (skSlot) {
    skSlot.classList.toggle('slot-empty', !skName);
    skSlot.classList.toggle('skill-runic-active', !!m.runicScholarActive);

    const skDef = skName ? getSkillOrSpellDef(skName) : null;
    const skDelaySec = skDef?.delay ?? 0;
    const lastUsed = lastAttackTimes[`${i}-skill-${skName}`];
    const skCanUse = lastUsed === undefined || (performance.now() - lastUsed) >= (skDelaySec * 1000);
    skSlot.classList.toggle('slot-cooling-down', !!skName && !skCanUse);
    const skNoMp = (skDef?.mpCost ?? 0) > 0 && m.mp < skDef.mpCost;
    skSlot.classList.toggle('slot-no-mp', !!skName && skNoMp);

    if (skName && !skCanUse && !m.cooldownTimers['skill']) {
      const remaining = (skDelaySec * 1000) - (performance.now() - lastUsed);
      m.cooldownTimers['skill'] = setTimeout(() => {
        m.cooldownTimers['skill'] = null;
        refreshMember(m);
      }, remaining);
    }
  }

  if (sk2Slot) {
    sk2Slot.classList.toggle('slot-empty', !sk2Name);
    const sk2Def = sk2Name ? getSkillOrSpellDef(sk2Name) : null;
    const sk2DelaySec = sk2Def?.delay ?? 0;
    const lastUsed2 = lastAttackTimes[`${i}-skill-${sk2Name}`];
    const sk2CanUse = lastUsed2 === undefined || (performance.now() - lastUsed2) >= (sk2DelaySec * 1000);
    sk2Slot.classList.toggle('slot-cooling-down', !!sk2Name && !sk2CanUse);
    const sk2NoMp = (sk2Def?.mpCost ?? 0) > 0 && m.mp < sk2Def.mpCost;
    sk2Slot.classList.toggle('slot-no-mp', sk2NoMp);
    if (sk2Name && !sk2CanUse && !m.cooldownTimers['skill2']) {
      const remaining = (sk2DelaySec * 1000) - (performance.now() - lastUsed2);
      m.cooldownTimers['skill2'] = setTimeout(() => {
        m.cooldownTimers['skill2'] = null;
        refreshMember(m);
      }, remaining);
    }
  }

  if (sk3Slot) {
    sk3Slot.classList.toggle('slot-empty', !sk3Name);
    const sk3Def = sk3Name ? getSkillOrSpellDef(sk3Name) : null;
    const sk3DelaySec = sk3Def?.delay ?? 0;
    const lastUsed3 = lastAttackTimes[`${i}-skill-${sk3Name}`];
    const sk3CanUse = lastUsed3 === undefined || (performance.now() - lastUsed3) >= (sk3DelaySec * 1000);
    sk3Slot.classList.toggle('slot-cooling-down', !!sk3Name && !sk3CanUse);
    const sk3NoMp = (sk3Def?.mpCost ?? 0) > 0 && m.mp < sk3Def.mpCost;
    sk3Slot.classList.toggle('slot-no-mp', sk3NoMp);
    if (sk3Name && !sk3CanUse && !m.cooldownTimers['skill3']) {
      const remaining = (sk3DelaySec * 1000) - (performance.now() - lastUsed3);
      m.cooldownTimers['skill3'] = setTimeout(() => {
        m.cooldownTimers['skill3'] = null;
        refreshMember(m);
      }, remaining);
    }
  }

  if (sk4Slot) {
    sk4Slot.classList.toggle('slot-empty', !sk4Name);
    const sk4Def = sk4Name ? getSkillOrSpellDef(sk4Name) : null;
    const sk4DelaySec = sk4Def?.delay ?? 0;
    const lastUsed4 = lastAttackTimes[`${i}-skill-${sk4Name}`];
    const sk4CanUse = lastUsed4 === undefined || (performance.now() - lastUsed4) >= (sk4DelaySec * 1000);
    sk4Slot.classList.toggle('slot-cooling-down', !!sk4Name && !sk4CanUse);
    const sk4NoMp = (sk4Def?.mpCost ?? 0) > 0 && m.mp < sk4Def.mpCost;
    sk4Slot.classList.toggle('slot-no-mp', sk4NoMp);
    if (sk4Name && !sk4CanUse && !m.cooldownTimers['skill4']) {
      const remaining = (sk4DelaySec * 1000) - (performance.now() - lastUsed4);
      m.cooldownTimers['skill4'] = setTimeout(() => {
        m.cooldownTimers['skill4'] = null;
        refreshMember(m);
      }, remaining);
    }
  }

  if (sk5Slot) {
    sk5Slot.classList.toggle('slot-empty', !sk5Name);
    const sk5Def = sk5Name ? getSkillOrSpellDef(sk5Name) : null;
    const sk5DelaySec = sk5Def?.delay ?? 0;
    const lastUsed5 = lastAttackTimes[`${i}-skill-${sk5Name}`];
    const sk5CanUse = lastUsed5 === undefined || (performance.now() - lastUsed5) >= (sk5DelaySec * 1000);
    sk5Slot.classList.toggle('slot-cooling-down', !!sk5Name && !sk5CanUse);
    const sk5NoMp = (sk5Def?.mpCost ?? 0) > 0 && m.mp < sk5Def.mpCost;
    sk5Slot.classList.toggle('slot-no-mp', sk5NoMp);
    if (sk5Name && !sk5CanUse && !m.cooldownTimers['skill5']) {
      const remaining = (sk5DelaySec * 1000) - (performance.now() - lastUsed5);
      m.cooldownTimers['skill5'] = setTimeout(() => {
        m.cooldownTimers['skill5'] = null;
        refreshMember(m);
      }, remaining);
    }
  }

  if (sk6Slot) {
    sk6Slot.classList.toggle('slot-empty', !sk6Name);
    const sk6Def = sk6Name ? getSkillOrSpellDef(sk6Name) : null;
    const sk6DelaySec = sk6Def?.delay ?? 0;
    const lastUsed6 = lastAttackTimes[`${i}-skill-${sk6Name}`];
    const sk6CanUse = lastUsed6 === undefined || (performance.now() - lastUsed6) >= (sk6DelaySec * 1000);
    sk6Slot.classList.toggle('slot-cooling-down', !!sk6Name && !sk6CanUse);
    const sk6NoMp = (sk6Def?.mpCost ?? 0) > 0 && m.mp < sk6Def.mpCost;
    sk6Slot.classList.toggle('slot-no-mp', sk6NoMp);
    if (sk6Name && !sk6CanUse && !m.cooldownTimers['skill6']) {
      const remaining = (sk6DelaySec * 1000) - (performance.now() - lastUsed6);
      m.cooldownTimers['skill6'] = setTimeout(() => {
        m.cooldownTimers['skill6'] = null;
        refreshMember(m);
      }, remaining);
    }
  }
}

// ─────────────────────────────────────────────
//  SWAP HELPERS
// ─────────────────────────────────────────────

/** Swaps two party slots (by index), keeping id fields correct, then redraws. */
function swapSlots(a, b) {
  // Cancel any pending cooldown timers so stale callbacks don't overwrite the
  // display with the old occupant's (possibly empty) equipment after the swap.
  [party[a], party[b]].forEach(m => {
    if (m.cooldownTimers) {
      Object.values(m.cooldownTimers).forEach(id => { if (id != null) clearTimeout(id); });
      m.cooldownTimers = {};
    }
  });

  // Swap lastAttackTimes entries so cooldowns follow the member to their new position.
  const aKeys = Object.keys(lastAttackTimes).filter(k => k.startsWith(`${a}-`));
  const bKeys = Object.keys(lastAttackTimes).filter(k => k.startsWith(`${b}-`));
  const aTimes = {};
  aKeys.forEach(k => { aTimes[k] = lastAttackTimes[k]; delete lastAttackTimes[k]; });
  const bTimes = {};
  bKeys.forEach(k => { bTimes[k] = lastAttackTimes[k]; delete lastAttackTimes[k]; });
  aKeys.forEach(k => { lastAttackTimes[k.replace(`${a}-`, `${b}-`)] = aTimes[k]; });
  bKeys.forEach(k => { lastAttackTimes[k.replace(`${b}-`, `${a}-`)] = bTimes[k]; });

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
        <label class="tactics-toggle" id="tactics-auto-attack-label">
          <input type="checkbox" id="tactics-auto-attack">
          Auto Attack <span class="tactics-toggle-hint">(front row attacks automatically)</span>
        </label>
        <label class="tactics-toggle" id="tactics-auto-range-attack-label">
          <input type="checkbox" id="tactics-auto-range-attack">
          Auto Range Attack <span class="tactics-toggle-hint">(bow/crossbow users attack automatically)</span>
        </label>
        <span id="tactics-gold" style="margin-top:10px; display:flex; justify-content:center; align-items:center; font-size:1.1em; color:#ffd700; text-shadow:1px 1px 0 #000;"><img src="${asset('/icons/gold_coins.webp')}" class="gold-icon-click" style="width:16px; height:16px; margin-right:4px; cursor:pointer;">${partyGold}</span>
      </div>
    </div>
  `;
  document.body.appendChild(tacticsOverlay);

  document.getElementById('tactics-close').addEventListener('click', closeTacticsModal);
  document.getElementById('tactics-auto-attack').addEventListener('change', (e) => {
    autoAttack = e.target.checked;
    if (!autoAttack) clearAutoAttackTimers();
  });
  document.getElementById('tactics-auto-range-attack').addEventListener('change', (e) => {
    autoRangeAttack = e.target.checked;
    if (!autoRangeAttack) clearAutoRangeAttackTimers();
  });
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
      canvas.width = 96;
      canvas.height = 96;
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
  const cb = document.getElementById('tactics-auto-attack');
  if (cb) cb.checked = autoAttack;
  const cbRange = document.getElementById('tactics-auto-range-attack');
  if (cbRange) cbRange.checked = autoRangeAttack;
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
  updateGoldDisplay();

  // Global listener for gold icon clicks
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && target.tagName === 'IMG') {
      const src = target.src || '';
      if (target.classList.contains('gold-icon-click') || src.includes('gold_pile.png') || src.includes('gold_coins.png')) {
        playGoldSound();
      }
    }
  });

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

    // Keys 1–4: rotate loadout for each party member, Space: rotate all
    // 1 → member 0 (top-left)  |  2 → member 1 (top-right)
    // 3 → member 2 (bottom-left)  |  4 → member 3 (bottom-right)
    const loadoutKeyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    if (!e.ctrlKey && !e.altKey && !e.metaKey && (loadoutKeyMap[e.key] !== undefined || e.key === ' ')) {
      const modalOpen = ['equip-overlay', 'tactics-overlay', 'chest-overlay',
        'armor-stand-overlay', 'merchant-overlay', 'main-menu-overlay', 'char-dev-overlay'].some(id => {
          const el = document.getElementById(id);
          return el && window.getComputedStyle(el).display !== 'none';
        });
      if (modalOpen) return;

      if (e.key === ' ') {
        e.preventDefault();
        party.forEach((m, idx) => {
          if (m && !m.isEmpty) {
            rotateLoadout(idx);
          }
        });
      } else {
        const memberIdx = loadoutKeyMap[e.key];
        const m = party[memberIdx];
        if (m && !m.isEmpty) {
          e.preventDefault();
          rotateLoadout(memberIdx);
        }
      }
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

  if (m.hp === 0 && !m.isDead) {
    m.isDead = true;
    addLogEntry({ type: 'death', target: m.name, time: Date.now() });
    const canvas = document.getElementById(`portrait-${m.id}`);
    if (canvas) drawPortrait(canvas, m);
    const deathAudio = new Audio('sounds/actions/death.mp3');
    deathAudio.volume = 1.0;
    deathAudio.play().catch(e => console.warn('Death audio play prevented:', e));

    const partyWiped = party.every(p => p.isEmpty || p.isDead);
    if (partyWiped) _showGameOver();
  }

  refreshMember(m);
}

function _showGameOver() {
  if (window._arenaMode) {
    window._arenaDefeat?.();
    return;
  }
  const el = document.getElementById('game-over');
  if (!el) return;
  el.classList.add('active');
}

export function flashPortraitHit(index) {
  const portrait = document.querySelector(`#member-${index} .portrait`);
  if (!portrait) return;
  portrait.classList.remove('portrait--hit');
  void portrait.offsetWidth;   // force reflow to restart animation
  portrait.classList.add('portrait--hit');
  setTimeout(() => portrait.classList.remove('portrait--hit'), 500);
}

export function flashPortraitCrit(index) {
  const portrait = document.querySelector(`#member-${index} .portrait`);
  if (!portrait) return;
  portrait.classList.remove('portrait--crit', 'portrait--hit');
  void portrait.offsetWidth;   // force reflow to restart animation
  portrait.classList.add('portrait--crit');
  setTimeout(() => portrait.classList.remove('portrait--crit'), 800);
}

/** Float a red damage number above the member's portrait when they are hit. */
export function showMemberDamage(memberIndex, damage, isCrit) {
  const memberTop = document.querySelector(`#member-${memberIndex} .member-main`);
  if (!memberTop) return;
  const popup = document.createElement('span');
  popup.className = 'damage-popup damage-popup--incoming' +
    (isCrit ? ' damage-popup--crit' : '');
  popup.textContent = damage;
  memberTop.appendChild(popup);
  setTimeout(() => popup.remove(), 900);
}

/** Float a green text above the member's portrait to indicate healing. */
export function showMemberHeal(memberIndex, amount) {
  const memberTop = document.querySelector(`#member-${memberIndex} .member-main`);
  if (!memberTop) return;
  const popup = document.createElement('span');
  popup.className = 'damage-popup damage-popup--heal damage-popup--incoming';
  popup.textContent = '+' + amount;
  memberTop.appendChild(popup);
  setTimeout(() => popup.remove(), 900);
}

export function setMp(index, value) {
  const m = party[index];
  if (!m) return;
  m.mp = Math.max(0, Math.min(m.mpMax, value));
  refreshMember(m);
}

export function setSp(index, value) {
  const m = party[index];
  if (!m) return;
  m.sp = Math.max(0, Math.min(m.spMax ?? 100, value));
  refreshMember(m);
}

export function setEquip(index, hand, itemName) {
  const m = party[index];
  if (!m) return;
  if (hand === 'left') m.leftHand = itemName;
  if (hand === 'right') m.rightHand = itemName;
  refreshMember(m);
}

export function resurrectAll() {
  party.forEach((m) => {
    if (m.isEmpty) return;
    m.hp = m.hpMax;
    m.isDead = false;
    const canvas = document.getElementById(`portrait-${m.id}`);
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      drawPortrait(canvas, m);
    }
    refreshMember(m);
  });

  // Hide Game Over if it was showing
  const el = document.getElementById('game-over');
  if (el) el.classList.remove('active');
}

let mpRegenTimers = {};    // out-of-combat MP regen: per-member accumulators
let battleMageTimers = {}; // in-combat MP regen (Battle Mage passive): per-member accumulators
let spRegenAccum = 0;

// ─────────────────────────────────────────────────────────────────────────────
//  STATUS EFFECT APPLICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply (or refresh) a status effect on a party member.
 * effectId must match a key in STATUS_EFFECT_DEFS.
 * If the effect is already active its duration is refreshed rather than stacked.
 * @param {number} memberId
 * @param {string} effectId
 * @param {number} [customTickValue=null] - Optional override for tick damage/heal
 */
export function applyStatusEffect(memberId, effectId, customTickValue = null, durationSecOverride = null) {
  const m = party.find(p => p.id == memberId);
  if (!m || m.isEmpty || m.isDead) return;

  const def = STATUS_EFFECT_DEFS[effectId];
  if (!def) return;

  const durationSec = durationSecOverride ?? def.duration;

  if (!m.activeDebuffs) m.activeDebuffs = [];

  const existing = m.activeDebuffs.find(d => d.effectId === effectId);
  if (existing) {
    // Refresh duration without resetting the tick accumulator
    existing.expiresAt = performance.now() + (durationSec * 1000);
    if (customTickValue !== null) existing.customTickValue = customTickValue;
  } else {
    m.activeDebuffs.push({
      effectId,
      expiresAt: performance.now() + (durationSec * 1000),
      tickAccum: 0,
      customTickValue
    });
  }

  // Refresh UI immediately
  refreshMember(m);
  updateStatusBanners();
}

export function applyRegeneration() {
  // Legacy global function — now redirected to applyStatusEffect if needed
  // but we mostly call applyStatusEffect(id, 'regeneration', value) now
}

// ─────────────────────────────────────────────────────────────────────────────
//  STATUS EFFECT QUERY HELPERS
//  These allow combat code to read effective stats / modifiers without
//  hardcoding individual effect IDs.  Adding a new effect to the JSON with
//  any of the supported properties (statModifiers, attackSpeedMultiplier,
//  defenceModifier, preventsSpRegen, preventsMpRegen, etc.) will be picked
//  up automatically.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a combined statusResistances map for a member, merging:
 *   1. Item-based resistances (from m.statusResistances, built by updateEffectiveStats)
 *   2. Resistances from active buff effects (e.g. resist-poison spell)
 * Values are additive and capped at 0.9 (90%) per effect.
 */
export function getEffectiveStatusResistances(member) {
  const combined = { ...(member.statusResistances ?? {}) };
  const now = performance.now();
  (member.activeDebuffs ?? []).forEach(d => {
    if (now >= d.expiresAt) return;
    const def = STATUS_EFFECT_DEFS[d.effectId];
    if (!def?.statusResistances) return;
    for (const [effectId, resistance] of Object.entries(def.statusResistances)) {
      combined[effectId] = Math.min(0.9, (combined[effectId] ?? 0) + resistance);
    }
  });
  return combined;
}

/** Returns a copy of member.stats with all active statModifiers applied. */
export function getEffectiveStats(member) {
  const base = { ...(member.stats ?? {}) };
  const now = performance.now();
  (member.activeDebuffs ?? []).forEach(d => {
    if (now >= d.expiresAt) return;
    const def = STATUS_EFFECT_DEFS[d.effectId];
    const mods = def?.statModifiers;
    if (!mods) return;
    for (const [stat, val] of Object.entries(mods)) {
      if (base[stat] !== undefined) base[stat] = Math.max(0, base[stat] + val);
    }
  });
  return base;
}

/** Returns the combined attack speed multiplier from active debuffs (>1 = slower). */
export function getAttackSpeedMultiplier(member) {
  let mult = 1.0;
  const now = performance.now();
  (member.activeDebuffs ?? []).forEach(d => {
    if (now >= d.expiresAt) return;
    const def = STATUS_EFFECT_DEFS[d.effectId];
    if (def?.attackSpeedMultiplier) mult *= def.attackSpeedMultiplier;
  });
  return mult;
}

/** Returns true if any active effect has the given boolean flag (e.g. 'preventsSpRegen'). */
export function hasEffectFlag(member, flagName) {
  const now = performance.now();
  return (member.activeDebuffs ?? []).some(d => {
    if (now >= d.expiresAt) return false;
    return !!STATUS_EFFECT_DEFS[d.effectId]?.[flagName];
  });
}

/** Returns true if any alive party member currently has the invincibility buff active. */
export function isPartyInvincible() {
  const now = performance.now();
  return party.some(m => {
    if (m.isEmpty || m.isDead) return false;
    return (m.activeDebuffs ?? []).some(d => now < d.expiresAt && STATUS_EFFECT_DEFS[d.effectId]?.invincible);
  });
}

/** Returns true if any alive party member currently has the unseen buff active. */
export function isPartyUnseen() {
  const now = performance.now();
  return party.some(m => {
    if (m.isEmpty || m.isDead) return false;
    return (m.activeDebuffs ?? []).some(d => now < d.expiresAt && STATUS_EFFECT_DEFS[d.effectId]?.unseen);
  });
}

/**
 * Immediately removes the unseen buff from all party members.
 * Called whenever the party takes an action other than moving.
 * @param {string} [reason] — optional message reason for the log
 */
export function breakPartyUnseen(reason = '') {
  let broken = false;
  party.forEach(m => {
    if (m.isEmpty || m.isDead || !m.activeDebuffs) return;
    const had = m.activeDebuffs.some(d => STATUS_EFFECT_DEFS[d.effectId]?.unseen);
    if (had) {
      m.activeDebuffs = m.activeDebuffs.filter(d => !STATUS_EFFECT_DEFS[d.effectId]?.unseen);
      broken = true;
      refreshMember(m);
    }
  });
  if (broken) {
    showMessage(reason || 'The cloak of shadow disperses!');
  }
}

/** Returns the sum of defenceModifier values from all active effects. */
export function getDefenceModifier(member) {
  let mod = 0;
  const now = performance.now();
  (member.activeDebuffs ?? []).forEach(d => {
    if (now >= d.expiresAt) return;
    const def = STATUS_EFFECT_DEFS[d.effectId];
    if (def?.defenceModifier) mod += def.defenceModifier;
  });
  return mod;
}

/** Builds a human-readable description string from an effect definition's properties. */
export function describeEffect(def) {
  const parts = [];
  if (def.tickDamage > 0) parts.push(`${def.tickDamage} HP / ${def.tickInterval}s`);
  if (def.tickDamage < 0) parts.push(`+${Math.abs(def.tickDamage)} HP / ${def.tickInterval}s`);
  if (def.tickManaDrain) parts.push(`-${def.tickManaDrain} MP / ${def.tickInterval}s`);
  if (def.tickSpDrain) parts.push(`-${def.tickSpDrain} SP / ${def.tickInterval}s`);
  if (def.preventsSpRegen) parts.push('No SP Regen');
  if (def.preventsMpRegen) parts.push('No MP Regen');
  if (def.statModifiers) {
    const STAT_ABBR = { strength: 'STR', dexterity: 'DEX', vitality: 'VIT', intelligence: 'INT', resilience: 'RES' };
    for (const [stat, val] of Object.entries(def.statModifiers)) {
      const label = STAT_ABBR[stat] ?? stat.toUpperCase();
      parts.push(`${label} ${val > 0 ? '+' : ''}${val}`);
    }
  }
  if (def.attackSpeedMultiplier && def.attackSpeedMultiplier !== 1) {
    parts.push(`Atk Spd x${def.attackSpeedMultiplier}`);
  }
  if (def.defenceModifier) parts.push(`DEF ${def.defenceModifier > 0 ? '+' : ''}${def.defenceModifier}`);
  parts.push(`${def.duration}s`);
  return parts.join(' \u00b7 ');
}

export function updateParty(dt) {

  // SP regenerates both in and out of combat, just at different rates:
  //   in combat:     +1 SP every 2 seconds
  //   out of combat: +5 SP every 2 seconds
  spRegenAccum += dt;
  if (spRegenAccum >= 2.0) {
    spRegenAccum -= 2.0;
    const spGain = isInCombat() ? 1 : 5;
    party.forEach((m) => {
      if (!m.isEmpty && !m.isDead && m.sp < (m.spMax ?? 100)) {
        if (!hasEffectFlag(m, 'preventsSpRegen')) {
          setSp(m.id, Math.min(m.sp + spGain, m.spMax ?? 100));
        }
      }
    });
  }

  // MP regen — out of combat (base 1 MP/s, boosted by Arcane Reservoir),
  //           in combat (Battle Mage passive only)
  if (isInCombat()) {
    mpRegenTimers = {};  // reset out-of-combat timers so they don't burst when combat ends

    // Battle Mage passive: per-member in-combat MP regen
    party.forEach(m => {
      if (m.isEmpty || m.isDead || !m.skills?.length) return;
      if (hasEffectFlag(m, 'preventsMpRegen')) return;
      const count = m.skills.filter(s => (typeof s === 'string' ? s : s.name) === 'Battle Mage').length;
      if (!count) return;
      const interval = count >= 3 ? 1.0 : count === 2 ? 2.0 : 3.0;
      battleMageTimers[m.id] = (battleMageTimers[m.id] ?? 0) + dt;
      if (battleMageTimers[m.id] >= interval) {
        battleMageTimers[m.id] -= interval;
        if (m.mp < m.mpMax) setMp(m.id, m.mp + 1);
      }
    });
  } else {
    battleMageTimers = {};  // reset in-combat timers

    // Per-member out-of-combat regen: 1 MP/s base, faster with Arcane Reservoir
    party.forEach(m => {
      if (m.isEmpty || m.isDead || m.mp >= m.mpMax) return;
      if (hasEffectFlag(m, 'preventsMpRegen')) return;
      const arCount = m.skills?.filter(s => (typeof s === 'string' ? s : s.name) === 'Arcane Reservoir').length ?? 0;
      // 1 node = 1.2× (0.833s), 2 nodes = 1.4× (0.714s), 3 nodes = 2.0× (0.5s)
      const interval = arCount >= 3 ? 0.5 : arCount === 2 ? (1.0 / 1.4) : arCount === 1 ? (1.0 / 1.2) : 1.0;
      mpRegenTimers[m.id] = (mpRegenTimers[m.id] ?? 0) + dt;
      if (mpRegenTimers[m.id] >= interval) {
        mpRegenTimers[m.id] -= interval;
        setMp(m.id, m.mp + 1);
      }
    });
  }

  // ── Process all active status effects each frame ────────────────────────
  const now = performance.now();
  party.forEach(m => {
    if (m.isEmpty || m.isDead || !m.activeDebuffs?.length) return;
    // Expire finished effects
    m.activeDebuffs = m.activeDebuffs.filter(d => now < d.expiresAt);
    // Tick-based effects
    m.activeDebuffs.forEach(d => {
      const def = STATUS_EFFECT_DEFS[d.effectId];
      if (!def?.tickInterval) return;

      d.tickAccum += dt;
      if (d.tickAccum >= def.tickInterval) {
        d.tickAccum -= def.tickInterval;
        // HP damage / heal
        const hpAmount = (d.customTickValue !== undefined && d.customTickValue !== null)
          ? d.customTickValue
          : (def.tickDamage || 0);
        if (hpAmount !== 0) {
          setHp(m.id, m.hp - hpAmount);
          // Only log damage ticks (poison, etc.); skip healing ticks (regeneration)
          // to keep the battle log clean and focused on combat actions.
          if (hpAmount > 0) {
            playPartyHitSound();
            addLogEntry({
              time: Date.now(),
              type: 'tick',
              target: m.name,
              effectId: d.effectId,
              effectName: def.name ?? d.effectId,
              amount: hpAmount, // positive = damage, negative = heal
              effectColor: def.color ?? null,
            });
          }
        }
        // MP drain
        if (def.tickManaDrain) setMp(m.id, m.mp - def.tickManaDrain);
        // SP drain
        if (def.tickSpDrain) setSp(m.id, m.sp - def.tickSpDrain);
      }
    });
  });

  updateStatusBanners();
}
function getActiveEffectsForMember(m) {
  const active = [];
  if (skillsState.sanctuary.active) active.push('Sanctuary');
  if (skillsState.warcry.active) active.push('Warcry');
  if (skillsState.warDance.active) active.push('War Dance');
  if (skillsState.arcaneLight.active) {
    const hasMiners = m.skills?.some(s => s.name === 'Miners Light');
    active.push(hasMiners ? 'Miners Light' : 'Arcane Lantern');
  }
  if (skillsState.berserk.active && skillsState.berserk.actorName === m.name) active.push('Berserk');
  if (skillsState.whirlwind.active && skillsState.whirlwind.actorName === m.name) active.push('Whirlwind');
  if (skillsState.trueShot.active && skillsState.trueShot.actorName === m.name) active.push('True Shot');
  if (skillsState.doubleAttack.active && skillsState.doubleAttack.actorName === m.name) active.push('Double Attack');
  const now = performance.now();
  if (skillsState.rampart.active && skillsState.rampart.actorName === m.name && now < skillsState.rampart.expiresAt) active.push('Rampart');
  if (m.runicScholarActive) active.push('Runic Scholar');
  // Active debuffs from monster on-hit effects
  m.activeDebuffs?.forEach(d => {
    if (now < d.expiresAt) {
      const def = STATUS_EFFECT_DEFS[d.effectId];
      if (def) active.push(def.name);
    }
  });
  return active;
}

function getSkillOrSpellDef(name) {
  // Check normal skills/spells first (they have cooldown/delay properties)
  const skillOrSpell = (SKILLS_DATA[name] || (SPELLS ? SPELLS.find(s => s.name === name) : null)) ?? null;
  if (skillOrSpell) return skillOrSpell;

  // Then check status effect debuffs if not found
  const effectDef = Object.values(STATUS_EFFECT_DEFS).find(d => d.name === name);
  if (effectDef) return effectDef;

  for (const p of party) {
    if (p.isEmpty) continue;
    const skillDef = p.skills?.find(s => s.name === name);
    if (skillDef) return skillDef;
  }

  return getItemDef(name);
}

function updateStatusBanners() {
  party.forEach(m => {
    if (m.isEmpty) return;
    const banner = document.getElementById(`status-banner-${m.id}`);
    if (!banner) return;

    if (m.isDead) {
      banner.innerHTML = '';
      banner._prevKeys = '';
      return;
    }

    const activeNames = getActiveEffectsForMember(m);
    const defs = [];
    activeNames.forEach(name => {
      const def = getSkillOrSpellDef(name);
      if (def && (def.type === 'buff' || def.type === 'debuff')) {
        defs.push(def);
      }
    });

    // Build a key string so we only rebuild the DOM when the set of effects changes
    const key = defs.map(d => d.name || d.id).join('|');
    if (banner._prevKeys === key) return;
    banner._prevKeys = key;

    banner.innerHTML = '';
    hideTooltip();
    defs.forEach(def => {
      const img = document.createElement('img');
      img.src = asset(def.icon);
      img.className = 'buff-icon';
      img.alt = def.name;
      attachTooltipListeners(img, () => ({ ...def, isStatusEffect: true }), true);
      banner.appendChild(img);
    });
  });
}

// ─────────────────────────────────────────────
//  SAVE REGISTRY
// ─────────────────────────────────────────────
import { registerSaveHandler } from './save-registry.js';

registerSaveHandler('party', {
  serialize() {
    return {
      members: party.map(m => JSON.parse(JSON.stringify(m, (k, v) =>
        k === 'cooldownTimers' ? undefined : v))),
      gold: partyGold,
      autoAttack,
      autoRangeAttack,
    };
  },
  restore(data) {
    for (let i = 0; i < 4; i++) {
      const src = data.members[i];
      const dest = party[i];
      for (const k of Object.keys(dest)) delete dest[k];
      Object.assign(dest, JSON.parse(JSON.stringify(src)));
      dest.cooldownTimers = {};
      if (!dest.isEmpty) updateEffectiveStats(dest);
    }
    setPartyGold(data.gold ?? 0);
    if (data.autoAttack !== undefined) setAutoAttack(data.autoAttack);
    if (data.autoRangeAttack !== undefined) setAutoRangeAttack(data.autoRangeAttack);
  },
});

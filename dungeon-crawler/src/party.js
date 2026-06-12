import { getItemDef } from './items.js';
import { renderItemIcon, attachTooltipListeners, hideTooltip, rotateAmmo, clearAutoAttackTimers, clearAutoRangeAttackTimers, updateEffectiveStats, refreshEquipmentModal, getMemberEncumbranceLevel, getMemberCarryWeight, getMemberMaxCarry, formatSetBonusText, _formatSkillPotency } from './equipment.js';
import SETS_DATA from './data/sets.json';
import { addLogEntry, closeBattleLogReview } from './battle-log.js';
import { closeBattleStats } from './battle-stats.js';
import { isInCombat, playGoldSound, playPartyHitSound, playActionSound } from './audio.js';
import { showMessage } from './minimap.js';
import { skillsState } from './skills-state.js';
import { SPELLS } from './spells.js';
import SKILLS_DATA from './data/skills.json';
import { STATUS_EFFECT_DEFS } from './status-effects.js';
import { asset } from './assets.js';
import STANCES from './data/stances.json';
import { getStancePortraitPath } from './stance.js';
import { getCurrentLevelThreshold } from './leveling.js';
import ELEMENTS from './data/elements.json';

// Resolve a CSS color for an ammo's damageType (used to tint the
// ammo-type indicator on the party-card weapon slot).
function _ammoIndicatorColor(damageType) {
  if (!damageType || damageType === 'normal') return '#9a9a9a';
  if (damageType === 'poison') return '#4ec24e';
  return ELEMENTS[damageType]?.color ?? '#9a9a9a';
}

// Lazily injects (and returns) a dot-element used for the ammo-type indicator
// in a party-card weapon slot. Returns null if the slot DOM is missing.
function _getAmmoIndicatorEl(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return null;
  let dot = slot.querySelector('.ammo-type-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'ammo-type-dot';
    slot.appendChild(dot);
  }
  return dot;
}

// Lazily injects (and returns) the small indicator dot used to show that a
// weapon/shield has a weapon skill (and whether it is ready or on cooldown).
// Sits in the top-left corner of the party-card hand slot.
function _getWeaponSkillIndicatorEl(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return null;
  let dot = slot.querySelector('.weapon-skill-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'weapon-skill-dot';
    slot.appendChild(dot);
  }
  return dot;
}

// Updates the weapon-skill indicator + cooldown state for one hand slot.
//   slotId  — DOM id of the slot (e.g. "slot-lh-0")
//   def     — resolved item def occupying the slot (or null)
//   cdKey   — lastAttackTimes key holding the weapon-skill cooldown timestamp
//   m       — the party member (for scheduling a refresh on cooldown expiry)
//   timerKey— m.cooldownTimers key used for the refresh timeout
function _updateWeaponSkillIndicator(slotId, def, cdKey, m, timerKey) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const ws = def?.weaponSkill ?? null;
  slot.classList.toggle('slot-has-wskill', !!ws);
  const dot = slot.querySelector('.weapon-skill-dot');
  if (!ws) {
    if (dot) dot.style.display = 'none';
    return;
  }
  const el = dot ?? _getWeaponSkillIndicatorEl(slotId);
  if (!el) return;
  el.style.display = '';
  el.title = ws.name;

  const cooldownMs = ws.cooldownMs ?? 60000;
  const lastUsed = lastAttackTimes[cdKey];
  const remaining = lastUsed === undefined ? 0 : (cooldownMs - (performance.now() - lastUsed));
  const ready = remaining <= 0;
  el.classList.toggle('is-ready', ready);
  el.classList.toggle('is-cooling', !ready);

  // Refresh the HUD once the cooldown expires so the dot flips back to ready.
  if (!ready && m.cooldownTimers && !m.cooldownTimers[timerKey]) {
    m.cooldownTimers[timerKey] = setTimeout(() => {
      m.cooldownTimers[timerKey] = null;
      refreshMember(m);
    }, remaining);
  }
}

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

function _memberCardHTML(i) {
  return `
      <div class="member-card" id="member-${i}">
        <div class="member-main">
          <div class="portrait"><canvas class="portrait-canvas" id="portrait-${i}" width="84" height="84"></canvas><div class="levelup-indicator" id="levelup-${i}" title="Level-up skill point available">⬆</div></div>
          <div class="member-info">
            <div class="status-banner" id="status-banner-${i}"></div>
            <div class="info-row">
              <div class="bars">
                <div class="bar-row">
                  <div class="bar-track">
                    <div class="bar-fill bar-hp" id="bar-hp-${i}"></div><span class="bar-value" id="val-hp-${i}"></span>
                  </div>
                </div>
                <div class="bar-row">
                  <div class="bar-track">
                    <div class="bar-fill bar-mp" id="bar-mp-${i}"></div><span class="bar-value" id="val-mp-${i}"></span>
                  </div>
                </div>
                <div class="bar-row">
                  <div class="bar-track">
                    <div class="bar-fill bar-sp" id="bar-sp-${i}"></div><span class="bar-value" id="val-sp-${i}"></span>
                  </div>
                </div>
              </div>
              <div class="slot-group slot-group--hands">
                <div class="equip-slot" id="slot-lh-${i}"><span class="slot-label">L</span><span class="slot-item" id="item-lh-${i}"></span></div>
                <div class="equip-slot" id="slot-rh-${i}"><span class="slot-label">R</span><span class="slot-item" id="item-rh-${i}"></span></div>
              </div>
            </div>
          </div>
          <div class="slot-group slot-group--actions">
            <div class="equip-slot" id="slot-sk-${i}"><span class="slot-label">A</span><span class="slot-item" id="item-sk-${i}"></span></div>
            <div class="equip-slot" id="slot-sk2-${i}"><span class="slot-label">A</span><span class="slot-item" id="item-sk2-${i}"></span></div>
            <div class="equip-slot" id="slot-sk3-${i}"><span class="slot-label">A</span><span class="slot-item" id="item-sk3-${i}"></span></div>
            <div class="equip-slot" id="slot-sk4-${i}"><span class="slot-label">A</span><span class="slot-item" id="item-sk4-${i}"></span></div>
            <div class="equip-slot" id="slot-sk5-${i}"><span class="slot-label">A</span><span class="slot-item" id="item-sk5-${i}"></span></div>
            <div class="equip-slot" id="slot-sk6-${i}"><span class="slot-label">A</span><span class="slot-item" id="item-sk6-${i}"></span></div>
          </div>
        </div>
      </div>`;
}

export function exportPartyData() {
  const exportData = {
    timestamp: new Date().toISOString(),
    partyGold: partyGold,
    party: party.filter(m => !m.isEmpty).map(m => {
      const equipmentDetails = {};
      if (m.equipment) {
        for (const [slot, item] of Object.entries(m.equipment)) {
          if (item) {
            const def = getItemDef(item.name);
            equipmentDetails[slot] = {
              name: item.name,
              hq: !!item.hq,
              slot: def?.slot || item.slot,
              weaponType: def?.weaponType || undefined,
              attackType: def?.attackType || undefined,
              baseDamage: def?.baseDamage || undefined,
              defence: def?.defence || undefined,
              delay: def?.delay || undefined,
              statBonuses: def?.statBonuses || undefined,
              elementalDamage: def?.elementalDamage || undefined,
              elementalResistances: def?.elementalResistances || undefined,
              statusResistances: def?.statusResistances || undefined,
              weaponSkill: def?.weaponSkill?.name || undefined
            };
          } else {
            equipmentDetails[slot] = null;
          }
        }
      }

      return {
        name: m.name,
        job: m.job,
        level: m.level,
        xp: m.xp,
        stats: m.stats,
        baseStats: m.baseStats,
        skills: (m.skills || []).map(s => s.name),
        spells: (m.spells || []).map(s => s.name),
        equipment: equipmentDetails
      };
    })
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'party-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function buildPartyPanel() {
  const panel = document.getElementById('party-panel');
  if (!panel) return;
  panel.innerHTML = [0, 1, 2, 3].map(_memberCardHTML).join('');
}

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
  if (el) el.innerHTML = `<img src="${asset('/icons/gold_coins.webp')}" class="gold-icon-click">${partyGold}`;
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

  // Active stance can swap the portrait art (recruits can override per-stance art).
  const portraitPath = getStancePortraitPath(member) ?? member.image;
  if (portraitPath) {
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
    img.src = asset(portraitPath);
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

  const levelupEl = document.getElementById(`levelup-${i}`);
  if (levelupEl) {
    const hasPick = !m.isDead && (m.pendingNodePicks ?? 0) > 0;
    levelupEl.classList.toggle('is-active', hasPick);
  }

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

  // Ammo-type indicator (top-right of the ranged weapon slot) + alt-ammo dot
  // Only shown on the slot that holds a 'shoot' ranged weapon.
  const ammoItem = m.equipment?.ammo ?? null;
  const ammoDef = ammoItem ? (getItemDef(ammoItem.name) ?? null) : null;
  const lhIsRanged = lhDef?.attackType === 'shoot';
  const rhIsRanged = rhDef?.attackType === 'shoot';
  const hasAltAmmo = !!(m.equipment && m.ammoB);
  for (const [slotId, isRanged] of [[`slot-lh-${i}`, lhIsRanged], [`slot-rh-${i}`, rhIsRanged]]) {
    const dot = _getAmmoIndicatorEl(slotId);
    if (!dot) continue;
    const slotEl = document.getElementById(slotId);
    if (isRanged && ammoDef) {
      dot.style.background = _ammoIndicatorColor(ammoDef.damageType);
      dot.style.display = '';
      dot.title = `Ammo: ${ammoItem.name}`;
    } else {
      dot.style.display = 'none';
    }
    if (slotEl) slotEl.classList.toggle('slot-has-alt-ammo', isRanged && hasAltAmmo);
  }

  // Trap element indicator on whichever skill slot holds Lay Trap
  const trapElement = m.trapConfig?.element;
  const hasTrapElement = !!(trapElement && trapElement !== 'none');
  for (const [slotId, skillName] of [
    [`slot-sk-${i}`, skName],
    [`slot-sk2-${i}`, sk2Name],
    [`slot-sk3-${i}`, sk3Name],
    [`slot-sk4-${i}`, sk4Name],
    [`slot-sk5-${i}`, sk5Name],
    [`slot-sk6-${i}`, sk6Name],
  ]) {
    const isLayTrap = skillName === 'Lay Trap';
    const dot = isLayTrap
      ? _getAmmoIndicatorEl(slotId)
      : document.getElementById(slotId)?.querySelector('.ammo-type-dot');
    if (!dot) continue;
    if (isLayTrap && hasTrapElement) {
      dot.style.background = _ammoIndicatorColor(trapElement);
      dot.style.display = '';
      dot.title = `Trap element: ${ELEMENTS[trapElement]?.name ?? trapElement}`;
    } else {
      dot.style.display = 'none';
    }
  }

  if (!m.cooldownTimers) m.cooldownTimers = {};

  if (lhSlot) {
    lhSlot.classList.toggle('slot-empty', !lhName);
    lhSlot.classList.toggle('slot-no-action', lhNoAction);

    // Check cooldown for left slot
    let lhDelaySec = (lhDef?.delay ?? 2);
    const nowRef = performance.now();
    if (skillsState.whirlwind.active && skillsState.whirlwind.actorName === m.name && nowRef < skillsState.whirlwind.expiresAt) {
      lhDelaySec *= skillsState.whirlwind.magnitude;
    }
    lhDelaySec *= getActionDelayMultiplier(m, lhDef);

    const lhTimeKey = (lhDef?.slot === 'spell' && lhName) ? `${i}-spell-${lhName}` : `${i}-left`;
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
    const nowRef2 = performance.now();
    if (skillsState.whirlwind.active && skillsState.whirlwind.actorName === m.name && nowRef2 < skillsState.whirlwind.expiresAt) {
      rhDelaySec *= skillsState.whirlwind.magnitude;
    }
    rhDelaySec *= getActionDelayMultiplier(m, rhActualDef);

    const rhCurName = lhBothHands ? lhName : rhName;
    const rhCurDef = lhBothHands ? lhDef : rhDef;
    const rhTimeKey = (!lhBothHands && rhCurDef?.slot === 'spell' && rhCurName)
      ? `${i}-spell-${rhCurName}` : (lhBothHands ? `${i}-left` : `${i}-right`);
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

  // Weapon-skill indicators (right-click activated special attacks). The skill
  // belongs to whichever item actually occupies the slot; bothHands weapons
  // mirror to the right slot and share the left-hand cooldown key.
  _updateWeaponSkillIndicator(`slot-lh-${i}`, lhDef, `${i}-left-wskill`, m, 'wskill-left');
  _updateWeaponSkillIndicator(
    `slot-rh-${i}`,
    lhBothHands ? lhDef : rhDef,
    lhBothHands ? `${i}-left-wskill` : `${i}-right-wskill`,
    m,
    'wskill-right',
  );

  if (skSlot) {
    skSlot.classList.toggle('slot-empty', !skName);
    skSlot.classList.toggle('skill-runic-active', !!m.runicScholarActive);

    const skDef = skName ? getSkillOrSpellDef(skName) : null;
    const skDelaySec = skDef ? (skDef.delay ?? (skDef.cooldownMs != null ? skDef.cooldownMs / 1000 : 0)) : 0;
    const lastUsed = lastAttackTimes[skDef?.slot === 'spell' ? `${i}-spell-${skName}` : `${i}-skill-${skName}`];
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
    const sk2DelaySec = sk2Def ? (sk2Def.delay ?? (sk2Def.cooldownMs != null ? sk2Def.cooldownMs / 1000 : 0)) : 0;
    const lastUsed2 = lastAttackTimes[sk2Def?.slot === 'spell' ? `${i}-spell-${sk2Name}` : `${i}-skill-${sk2Name}`];
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
    const sk3DelaySec = sk3Def ? (sk3Def.delay ?? (sk3Def.cooldownMs != null ? sk3Def.cooldownMs / 1000 : 0)) : 0;
    const lastUsed3 = lastAttackTimes[sk3Def?.slot === 'spell' ? `${i}-spell-${sk3Name}` : `${i}-skill-${sk3Name}`];
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
    const sk4DelaySec = sk4Def ? (sk4Def.delay ?? (sk4Def.cooldownMs != null ? sk4Def.cooldownMs / 1000 : 0)) : 0;
    const lastUsed4 = lastAttackTimes[sk4Def?.slot === 'spell' ? `${i}-spell-${sk4Name}` : `${i}-skill-${sk4Name}`];
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
    const sk5DelaySec = sk5Def ? (sk5Def.delay ?? (sk5Def.cooldownMs != null ? sk5Def.cooldownMs / 1000 : 0)) : 0;
    const lastUsed5 = lastAttackTimes[sk5Def?.slot === 'spell' ? `${i}-spell-${sk5Name}` : `${i}-skill-${sk5Name}`];
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

  // Mark each action slot with its allowed type so CSS can show a faded
  // type icon when the slot is empty and constrained.
  const _slotTypeMap = [
    [skSlot, 'skill'],
    [sk2Slot, 'skill2'],
    [sk3Slot, 'skill3'],
    [sk4Slot, 'skill4'],
    [sk5Slot, 'skill5'],
    [sk6Slot, 'skill6'],
  ];
  for (const [el, key] of _slotTypeMap) {
    if (!el) continue;
    const t = (m.actionSlotTypes && m.actionSlotTypes[key]) || 'any';
    el.dataset.slotType = t;
  }

  if (sk6Slot) {
    sk6Slot.classList.toggle('slot-empty', !sk6Name);
    const sk6Def = sk6Name ? getSkillOrSpellDef(sk6Name) : null;
    const sk6DelaySec = sk6Def ? (sk6Def.delay ?? (sk6Def.cooldownMs != null ? sk6Def.cooldownMs / 1000 : 0)) : 0;
    const lastUsed6 = lastAttackTimes[sk6Def?.slot === 'spell' ? `${i}-spell-${sk6Name}` : `${i}-skill-${sk6Name}`];
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

  // Attach delayed tooltips to HUD action slots (900ms so fast clicks never trigger)
  const HUD_TOOLTIP_DELAY = 900;
  if (lhSlot) {
    attachTooltipListeners(lhSlot, () => m.equipment?.leftHand ?? null, true, false, HUD_TOOLTIP_DELAY);
  }
  if (rhSlot) {
    attachTooltipListeners(rhSlot, () => {
      if (!m.equipment) return null;
      const lh = m.equipment.leftHand;
      if (lh) {
        try { if (getItemDef(lh.name)?.slot === 'bothHands') return lh; } catch (e) { /* ignore */ }
      }
      return m.equipment.rightHand ?? null;
    }, true, false, HUD_TOOLTIP_DELAY);
  }
  const getSkillTooltipData = (item) => {
    if (!item) return null;
    const skillDef = SKILLS_DATA[item.name];
    if (skillDef) {
      const potency = _formatSkillPotency(item.name, m);
      return { ...skillDef, name: item.name, isSkill: true, potency };
    }
    return item;
  };

  if (skSlot)  attachTooltipListeners(skSlot,  () => getSkillTooltipData(m.equipment?.skill  ?? null), true, false, HUD_TOOLTIP_DELAY);
  if (sk2Slot) attachTooltipListeners(sk2Slot, () => getSkillTooltipData(m.equipment?.skill2 ?? null), true, false, HUD_TOOLTIP_DELAY);
  if (sk3Slot) attachTooltipListeners(sk3Slot, () => getSkillTooltipData(m.equipment?.skill3 ?? null), true, false, HUD_TOOLTIP_DELAY);
  if (sk4Slot) attachTooltipListeners(sk4Slot, () => getSkillTooltipData(m.equipment?.skill4 ?? null), true, false, HUD_TOOLTIP_DELAY);
  if (sk5Slot) attachTooltipListeners(sk5Slot, () => getSkillTooltipData(m.equipment?.skill5 ?? null), true, false, HUD_TOOLTIP_DELAY);
  if (sk6Slot) attachTooltipListeners(sk6Slot, () => getSkillTooltipData(m.equipment?.skill6 ?? null), true, false, HUD_TOOLTIP_DELAY);
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
  // Sync status-effect banners on every full refresh so skill buffs like
  // Sanctuary appear immediately when cast (and clear when they expire),
  // not only on the next status-tick. updateStatusBanners has a key-based
  // early-exit so calling it here is cheap when nothing has changed.
  updateStatusBanners();
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
        <div id="tactics-slots-grid"></div>
        <div id="tactics-controls">
          <div class="tactics-toggles-row">
            <label class="tactics-toggle">
              <input type="checkbox" id="tactics-auto-attack">
              <span>Auto Attack</span>
            </label>
            <label class="tactics-toggle">
              <input type="checkbox" id="tactics-auto-range-attack">
              <span>Auto Range</span>
            </label>
          </div>
          <div class="tactics-gold-row">
            <div id="tactics-gold-wrap">
              <span id="tactics-gold"></span>
            </div>
            <button id="tactics-export-btn" title="Export Party State for AI Analysis">📤</button>
          </div>
        </div>
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
  const exportBtn = document.getElementById('tactics-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportPartyData);
  }
}

function renderTacticsSlots() {
  const gridEl = document.getElementById('tactics-slots-grid');
  if (!gridEl) return;
  gridEl.innerHTML = '';

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
      canvas.width = 76;
      canvas.height = 76;
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
    }

    cell.addEventListener('click', () => handleTacticsSlotClick(i));
    gridEl.appendChild(cell);
  });
}

function handleTacticsSlotClick(index) {
  if (tacticsSel === null) {
    if (party[index].isEmpty) return; // can't select an empty slot as the source
    tacticsSel = index;
    renderTacticsSlots();
  } else if (tacticsSel === index) {
    tacticsSel = null;
    renderTacticsSlots();
  } else {
    // Swaps selected slot with target (works even if target is empty)
    swapSlots(tacticsSel, index);
    tacticsSel = null;
    renderTacticsSlots();
  }
}

export function openTacticsModal() {
  tacticsSel = null;
  renderTacticsSlots();
  updateGoldDisplay();
  const cb = document.getElementById('tactics-auto-attack');
  if (cb) cb.checked = autoAttack;
  const cbRange = document.getElementById('tactics-auto-range-attack');
  if (cbRange) cbRange.checked = autoRangeAttack;
  tacticsOverlay.style.display = 'block';
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

    // Keys 1–4: swap active ammo with the alternate (B) ammo for each party member.
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
        const panel = document.getElementById('party-panel');
        if (panel) {
          panel.classList.toggle('party-panel--hidden');
        }
      } else {
        const memberIdx = loadoutKeyMap[e.key];
        const m = party[memberIdx];
        if (m && !m.isEmpty) {
          e.preventDefault();
          rotateAmmo(memberIdx);
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
export function setHp(index, value, killer = null) {
  const m = party[index];
  if (!m) return;
  const prevHp = m.hp;
  m.hp = Math.max(0, Math.min(m.hpMax, value));

  if (m.hp === 0 && !m.isDead) {
    m.isDead = true;
    addLogEntry({ type: 'death', target: m.name, killer: killer || null, damage: prevHp, time: Date.now() });
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
  if (window.arenaState?.active) {
    window._arenaDefeat?.();
    return;
  }
  const el = document.getElementById('game-over');
  if (!el) return;
  el.classList.add('active');
  // Raise the battle log / stats panels (and the stats icon) above the death
  // overlay so the player can open them via B / ⚔ to see how the party died.
  document.body.classList.add('game-over-active');
  import('./save.js').then(({ renderSavesList }) => {
    renderSavesList('#game-over-saves', { requireConfirmOnLoad: false });
  });
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
export function showMemberDamage(memberIndex, damage, isCrit, element = null, isHeal = false) {
  const memberTop = document.querySelector(`#member-${memberIndex} .member-main`);
  if (!memberTop) return;
  const popup = document.createElement('span');
  popup.className = 'damage-popup damage-popup--incoming' +
    (isCrit ? ' damage-popup--crit' : '') +
    (isHeal ? ' damage-popup--absorb' : '');
  const elemDef = element ? ELEMENTS[element] : null;
  const sign = isHeal ? '+' : '';
  if (elemDef) {
    popup.style.color = elemDef.color;
    popup.textContent = `${elemDef.symbol ?? ''} ${sign}${damage}`.trim();
  } else {
    popup.textContent = `${sign}${damage}`;
  }
  memberTop.appendChild(popup);
  setTimeout(() => popup.remove(), 900);
}

/** Float a green text above the member's portrait to indicate HP healing. */
export function showMemberHeal(memberIndex, amount) {
  const memberTop = document.querySelector(`#member-${memberIndex} .member-main`);
  if (!memberTop) return;
  const popup = document.createElement('span');
  popup.className = 'damage-popup damage-popup--heal damage-popup--incoming';
  popup.textContent = '+' + amount;
  memberTop.appendChild(popup);
  setTimeout(() => popup.remove(), 3000);
}

/** Float a teal text above the member's portrait to indicate SP restoration. */
export function showMemberSpHeal(memberIndex, amount) {
  const memberTop = document.querySelector(`#member-${memberIndex} .member-main`);
  if (!memberTop) return;
  const popup = document.createElement('span');
  popup.className = 'damage-popup damage-popup--sp-heal damage-popup--incoming';
  popup.textContent = '+' + amount;
  memberTop.appendChild(popup);
  setTimeout(() => popup.remove(), 1800);
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
  document.body.classList.remove('game-over-active');
  closeBattleLogReview();
  closeBattleStats();
}

let mpRegenTimers = {};    // out-of-combat MP regen: per-member accumulators
let battleMageTimers = {}; // in-combat MP regen (Battle Mage passive): per-member accumulators
let spRegenAccum = 0;
let relicHpRegenTimers = {}; // relic-driven HP regen: per-member accumulators

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
  refreshEquipmentModal();
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
 * Returns a combined elementalResistances map for a member, merging:
 *   1. Equipment + skill-node grants (m.elementalResistances, built by updateEffectiveStats)
 *   2. Active buff/debuff status effects with elementalResistances on the def
 *   3. The current stance's elementalResistances effect
 * Unified -100..+200 scale (see elements.js); summed, uncapped. Negatives =
 * vulnerability, values > 100 = absorption (element heals the member).
 */
export function getEffectiveElementalResistances(member) {
  const combined = { ...(member.elementalResistances ?? {}) };
  const add = (elem, val) => {
    combined[elem] = (combined[elem] ?? 0) + val;
  };
  const now = performance.now();
  (member.activeDebuffs ?? []).forEach(d => {
    if (now >= d.expiresAt) return;
    const def = STATUS_EFFECT_DEFS[d.effectId] ?? d.inlineDef;
    if (!def?.elementalResistances) return;
    for (const [elem, resistance] of Object.entries(def.elementalResistances)) {
      add(elem, resistance);
    }
  });
  const stanceRes = member.stance ? STANCES[member.stance]?.effects?.elementalResistances : null;
  if (stanceRes) {
    for (const [elem, resistance] of Object.entries(stanceRes)) {
      add(elem, resistance);
    }
  }
  if (skillsState.combust?.active && skillsState.combust?.actorName === member.name && now < skillsState.combust.expiresAt) {
    add('fire', 50);
  }
  return combined;
}

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
  // Merge active stance resistances (supports "all" blanket key — applied in calcOnHitChance).
  const stanceRes = member.stance ? STANCES[member.stance]?.effects?.statusResistances : null;
  if (stanceRes) {
    for (const [effectId, resistance] of Object.entries(stanceRes)) {
      combined[effectId] = Math.min(0.9, (combined[effectId] ?? 0) + resistance);
    }
  }
  return combined;
}

/** Returns a copy of member.stats with all active statModifiers applied. */
export function getEffectiveStats(member) {
  const base = { ...(member.stats ?? {}) };
  const now = performance.now();
  (member.activeDebuffs ?? []).forEach(d => {
    if (now >= d.expiresAt) return;
    const def = STATUS_EFFECT_DEFS[d.effectId] ?? d.inlineDef;
    const mods = def?.statModifiers;
    if (!mods) return;
    for (const [stat, val] of Object.entries(mods)) {
      if (base[stat] !== undefined) base[stat] = Math.max(0, base[stat] + val);
    }
  });
  return base;
}

/**
 * Global attack-pace knob. Multiplies every party attack delay, so values > 1
 * make all party members attack SLOWER. Default 2 (half-speed swings) keeps
 * combat readable and leaves headroom for haste skills/magic to feel impactful.
 * Live-tweakable from the browser console: window.PARTY_ATTACK_DELAY_SCALE = 1.5
 */
export function getPartyAttackDelayScale() {
  return (typeof window !== 'undefined' && window.PARTY_ATTACK_DELAY_SCALE) || 2.0;
}

/**
 * Per-swing stamina-cost multiplier (used in equipment.js). Kept SEPARATE from
 * the attack-delay scale on purpose: at 1.5 against the 2x slowdown, SP drains
 * at ~0.75x the original per-second rate — gentler than a full rate-restore,
 * which felt too punishing once fights also run longer. Values > 1 drain more.
 * Live-tweakable from the browser console: window.PARTY_STAMINA_DRAIN_SCALE = 1.5
 */
export function getPartyStaminaDrainScale() {
  return (typeof window !== 'undefined' && window.PARTY_STAMINA_DRAIN_SCALE) || 1.5;
}

/**
 * Combined attack-speed multiplier from active debuffs + stance (>1 = slower).
 * NOTE: this does NOT include the global attack-pace scale — that is applied
 * per-action by getActionDelayMultiplier so it can be limited to weapon swings.
 */
export function getAttackSpeedMultiplier(member) {
  let mult = 1.0;
  const now = performance.now();
  (member.activeDebuffs ?? []).forEach(d => {
    if (now >= d.expiresAt) return;
    const def = STATUS_EFFECT_DEFS[d.effectId];
    if (def?.attackSpeedMultiplier) mult *= def.attackSpeedMultiplier;
  });

  if (member.stance) {
    const stance = STANCES[member.stance];
    if (stance?.effects?.attackSpeedMultiplier) {
      mult *= stance.effects.attackSpeedMultiplier;
    }
  }

  return mult;
}

/**
 * Full per-action delay multiplier for a hand slot's swing/cast cooldown.
 * Combines debuff/stance effects with the global attack-pace scale — but the
 * global scale applies to WEAPON attacks only. Spells (slot === 'spell') keep
 * their own cadence and are exempt, so slowing weapon swings for readability
 * never drags spell cooldowns along with it.
 */
export function getActionDelayMultiplier(member, def) {
  let mult = getAttackSpeedMultiplier(member);
  if (def?.slot !== 'spell') mult *= getPartyAttackDelayScale();
  return mult;
}

/** Returns true if any active effect has the given boolean flag (e.g. 'preventsSpRegen').
 *  Checks both active debuffs/buffs AND the member's active stance effects. */
export function hasEffectFlag(member, flagName) {
  const now = performance.now();
  const fromDebuff = (member.activeDebuffs ?? []).some(d => {
    if (now >= d.expiresAt) return false;
    return !!STATUS_EFFECT_DEFS[d.effectId]?.[flagName];
  });
  if (fromDebuff) return true;
  return !!(member.stance && STANCES[member.stance]?.effects?.[flagName]);
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
  if (def.statusResistances) {
    for (const [effectId, resistance] of Object.entries(def.statusResistances)) {
      const name = effectId.charAt(0).toUpperCase() + effectId.slice(1).replace('-', ' ');
      parts.push(`Resist ${name} +${Math.round(resistance * 100)}%`);
    }
  }
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

  // ── Relic-driven HP regen (e.g. Testament of Faith) ──────────────────────
  party.forEach(m => {
    if (m.isEmpty || m.isDead) { delete relicHpRegenTimers[m.id]; return; }
    const relic = m.equipment?.relic;
    const relicDef = relic ? getItemDef(relic.name) : null;
    const regen = relicDef?.hpRegen;
    if (!regen?.interval || !regen?.amount) { delete relicHpRegenTimers[m.id]; return; }
    if (m.hp >= m.hpMax) { relicHpRegenTimers[m.id] = 0; return; }
    relicHpRegenTimers[m.id] = (relicHpRegenTimers[m.id] ?? 0) + dt;
    while (relicHpRegenTimers[m.id] >= regen.interval) {
      relicHpRegenTimers[m.id] -= regen.interval;
      setHp(m.id, Math.min(m.hp + regen.amount, m.hpMax));
    }
  });

  // ── Process all active status effects each frame ────────────────────────
  const now = performance.now();
  party.forEach(m => {
    if (m.isEmpty || m.isDead || !m.activeDebuffs?.length) return;
    // Expire finished effects — detect if a visual border buff (unseen / invincible)
    // just expired so we can refresh the card and remove the CSS border class.
    const hadVisualBuff = m.activeDebuffs.some(
      d => now >= d.expiresAt && (STATUS_EFFECT_DEFS[d.effectId]?.unseen || STATUS_EFFECT_DEFS[d.effectId]?.invincible)
    );
    const hadStatBoostBuff = m.activeDebuffs.some(
      d => now >= d.expiresAt && d.inlineDef?.statModifiers
    );
    m.activeDebuffs = m.activeDebuffs.filter(d => now < d.expiresAt);
    if (hadStatBoostBuff) updateEffectiveStats(m);
    if (hadVisualBuff || hadStatBoostBuff) refreshMember(m);
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
          setHp(m.id, m.hp - hpAmount, hpAmount > 0 ? (def.name ?? d.effectId) : null);
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
  refreshEquipmentModal();
}
function getActiveEffectsForMember(m) {
  const active = [];
  const now = performance.now();
  if (skillsState.sanctuary.active && now < skillsState.sanctuary.expiresAt) active.push('Sanctuary');
  if (skillsState.warcry.active && now < skillsState.warcry.expiresAt) active.push('Warcry');
  if (skillsState.warDance.active && now < skillsState.warDance.expiresAt) active.push('War Dance');
  if (skillsState.arcaneLight.active && now < skillsState.arcaneLight.expiresAt) {
    const hasMiners = m.skills?.some(s => s.name === 'Miners Light');
    active.push(hasMiners ? 'Miners Light' : 'Arcane Lantern');
  }
  if (skillsState.berserk.active && skillsState.berserk.actorName === m.name && now < skillsState.berserk.expiresAt) active.push('Berserk');
  if (skillsState.combust.active && skillsState.combust.actorName === m.name && now < skillsState.combust.expiresAt) active.push('Combust');
  if (skillsState.whirlwind.active && skillsState.whirlwind.actorName === m.name && now < skillsState.whirlwind.expiresAt) active.push('Whirlwind');
  if (skillsState.trueShot.active && skillsState.trueShot.actorName === m.name && now < skillsState.trueShot.expiresAt) active.push('True Shot');
  if (skillsState.doubleAttack.active && skillsState.doubleAttack.actorName === m.name && now < skillsState.doubleAttack.expiresAt) active.push('Double Attack');
  if (skillsState.rampart.active && skillsState.rampart.actorName === m.name && now < skillsState.rampart.expiresAt) active.push('Rampart');
  if (m.runicScholarActive) active.push('Runic Scholar');
  // Active debuffs from monster on-hit effects, plus inline stat-boost entries
  m.activeDebuffs?.forEach(d => {
    if (now < d.expiresAt) {
      const def = STATUS_EFFECT_DEFS[d.effectId] ?? d.inlineDef;
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

// Severity-ordered: only fires a toast/sound when a member crosses to a *worse*
// encumbrance level (not when items are dropped to relieve it). On a member's
// first frame after init we silently sync the prev level so a save loaded with
// a member already encumbered doesn't spam the player.
const ENC_SEVERITY = { none: 0, heavy: 1, overloaded: 2 };
function notifyEncumbranceTransition(m, encLevel) {
  const prev = m._prevEncLevel;
  m._prevEncLevel = encLevel;
  if (prev === undefined) return;
  if (encLevel === prev) return;
  const carry = getMemberCarryWeight(m);
  const max = getMemberMaxCarry(m);
  if (ENC_SEVERITY[encLevel] > ENC_SEVERITY[prev]) {
    // Got worse — toast, sound, and battle-log entry.
    if (encLevel === 'heavy') {
      showMessage(`<span style="color:#e0c040">${m.name} is encumbered — party movement halved.</span>`, 3000);
      playActionSound('encumbered');
    } else if (encLevel === 'overloaded') {
      showMessage(`<span style="color:#ff5050">${m.name} is overloaded — party cannot move!</span>`, 3500);
      playActionSound('overloaded');
    }
    addLogEntry({
      type: 'encumbrance',
      subtype: 'applied',
      target: m.name,
      level: encLevel,
      carry,
      max,
      effectColor: encLevel === 'overloaded' ? '#ff5050' : '#e0c040',
      time: Date.now(),
    });
  } else if (encLevel === 'none') {
    // Fully cleared — log only (no toast/sound).
    addLogEntry({
      type: 'encumbrance',
      subtype: 'cleared',
      target: m.name,
      level: encLevel,
      carry,
      max,
      effectColor: '#80c080',
      time: Date.now(),
    });
  }
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
    // Build entries preserving the display name and the tooltip shape to use.
    // STATUS_EFFECT_DEFS entries (poison, regeneration, etc.) use the status-effect
    // tooltip path (shows duration).  Skill/spell buffs use the inventory skill
    // tooltip path (shows cooldown + description) — the same tooltip the player
    // sees when hovering the skill slot in the inventory modal.
    const entries = [];
    const bannerNow = performance.now();
    activeNames.forEach(name => {
      const statusDef = Object.values(STATUS_EFFECT_DEFS).find(d => d.name === name);
      const inlineDef = !statusDef
        ? m.activeDebuffs?.find(d => d.inlineDef?.name === name && bannerNow < d.expiresAt)?.inlineDef
        : null;
      const def = statusDef ?? inlineDef ?? getSkillOrSpellDef(name);
      if (def && (def.type === 'buff' || def.type === 'debuff')) {
        entries.push({ name, def, fromStatusEffects: !!(statusDef || inlineDef) });
      }
    });

    // Encumbrance is a derived passive state (not a timed debuff). Append its
    // icon as an additional banner entry and fold its level into the cache key
    // so the banner re-renders when carry weight crosses a threshold.
    const encLevel = getMemberEncumbranceLevel(m);
    notifyEncumbranceTransition(m, encLevel);
    const encDef = encLevel === 'heavy'
      ? STATUS_EFFECT_DEFS.encumbered
      : encLevel === 'overloaded'
        ? STATUS_EFFECT_DEFS.overloaded
        : null;
    if (encDef) {
      entries.push({ name: encDef.name, def: encDef, fromStatusEffects: true });
    }

    // Set bonuses are derived passive state (like encumbrance). For each active
    // set, synthesize a status-effect-shaped def with a per-set name and a
    // description summarising the bonus payload, so the tooltip is useful.
    const activeSets = m.activeSets ?? [];
    const setBonusBase = STATUS_EFFECT_DEFS.set_bonus;
    if (setBonusBase) {
      activeSets.forEach(setId => {
        const setDef = SETS_DATA[setId];
        if (!setDef) return;
        const synthName = `${setDef.name} Set Bonus`;
        const synthDef = {
          ...setBonusBase,
          name: synthName,
          description: formatSetBonusText(setDef),
          setDef: setDef
        };
        entries.push({ name: synthName, def: synthDef, fromStatusEffects: true });
      });
    }

    const key = activeNames.join('|') + '|enc:' + encLevel + '|sets:' + activeSets.join(',');
    if (banner._prevKeys === key) return;
    banner._prevKeys = key;

    banner.innerHTML = '';
    hideTooltip();
    entries.forEach(({ name, def, fromStatusEffects }) => {
      const img = document.createElement('img');
      img.src = asset(def.icon);
      img.className = 'buff-icon';
      img.alt = name;
      // Match the tooltip shape used in the inventory:
      //   status effects  → isStatusEffect (shows duration)
      //   skills / spells → isSkill        (shows cooldown + description)
      const tooltipData = fromStatusEffects
        ? { ...def, isStatusEffect: true }
        : { ...def, name, isSkill: true };
      attachTooltipListeners(img, () => tooltipData, true);
      banner.appendChild(img);
    });
  });
}

// ─────────────────────────────────────────────
//  SAVE / RESTORE
// ─────────────────────────────────────────────
export function capturePartyState() {
  // `activeDebuffs` carry an `expiresAt` measured against `performance.now()`,
  // which resets to 0 on the page reload that loading performs. Persisting them
  // leaves stale future timestamps that never expire (regen/poison/etc. appear
  // stuck on). Transient status effects are intentionally dropped on save.
  return {
    members: party.map(m => JSON.parse(JSON.stringify(m, (k, v) =>
      (k === 'cooldownTimers' || k === 'activeDebuffs') ? undefined : v))),
    gold: partyGold,
    autoAttack,
    autoRangeAttack,
  };
}

export function restorePartyState(data) {
  if (!data) return;
  for (let i = 0; i < 4; i++) {
    const src = data.members[i];
    const dest = party[i];
    for (const k of Object.keys(dest)) delete dest[k];
    Object.assign(dest, JSON.parse(JSON.stringify(src)));
    dest.cooldownTimers = {};
    if (!dest.isEmpty) {
      if (dest.spells && SPELLS) {
        dest.spells = dest.spells.map(spellObj => {
          const def = SPELLS.find(s => s.name === spellObj.name);
          if (def) {
            return {
              ...spellObj,
              icon: def.icon,
              type: def.type,
              description: def.description
            };
          }
          return spellObj;
        });
      }
      updateEffectiveStats(dest);
    }
  }
  setPartyGold(data.gold ?? 0);
  if (data.autoAttack !== undefined) setAutoAttack(data.autoAttack);
  if (data.autoRangeAttack !== undefined) setAutoRangeAttack(data.autoRangeAttack);
}

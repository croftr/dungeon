// ─────────────────────────────────────────────────────────────────────────────
//  THE ESSENTIARY — Monster Bestiary & Arena UI
// ─────────────────────────────────────────────────────────────────────────────
import MONSTERS_DATA from './data/monsters.json';
import MONSTER_FAMILIES from './data/monster-families.json';
import STATUS_EFFECTS from './data/status-effects.json';
import { asset } from './assets.js';
import { getSeenEssences } from './objects.js';

const _EFFECT_CHIP_CLASS = {
  fear:   'effect-chip-fear',
  poison: 'effect-chip-poison',
  slow:   'effect-chip-slow',
  rot:    'effect-chip-rot',
  frozen: 'effect-chip-frozen',
  stun:   'effect-chip-stun',
};

// ── Arena tier progression ────────────────────────────────────────────────────
// Tracks how many times the player has beaten each monster in the Essentiary.
// Tier starts at 1 and increments by 1 on each victory; defeats leave it unchanged.

let _arenaMonsterTiers = {};  // { [monsterId]: number }

export function getMonsterTier(monsterId) {
  return _arenaMonsterTiers[monsterId] ?? 1;
}

export function recordArenaVictory(monsterId, tierDefeated) {
  const currentMax = getMonsterTier(monsterId);
  if (tierDefeated === undefined || tierDefeated >= currentMax) {
    _arenaMonsterTiers[monsterId] = currentMax + 1;
  }
}

/**
 * Returns a new def object with stats/hp/defence scaled for the given tier.
 * Tier 1 = no scaling. Each additional tier adds 20% to base values.
 * The original def object is never mutated.
 */
export function applyTierScaling(def, tier) {
  if (tier <= 1) return def;
  const m = 1 + (tier - 1) * 0.2;
  return {
    ...def,
    hp:      Math.round(def.hp      * m),
    defence: Math.round(def.defence * m),
    xp:      Math.round(def.xp      * m),
    stats: def.stats ? {
      strength:    Math.round((def.stats.strength    ?? 0) * m),
      dexterity:   Math.round((def.stats.dexterity   ?? 0) * m),
      vitality:    Math.round((def.stats.vitality    ?? 0) * m),
      intelligence:Math.round((def.stats.intelligence ?? 0) * m),
      resilience:  Math.round((def.stats.resilience  ?? 0) * m),
    } : def.stats,
  };
}

function _renderSpecialAttack(atk) {
  const badges = [];
  if (atk.aoe) badges.push(`<span class="essentiary-special-badge essentiary-badge-aoe">AoE</span>`);
  if (atk.triggerCondition === 'half_hp') badges.push(`<span class="essentiary-special-badge essentiary-badge-trigger">&#9760; Triggers at 50% HP</span>`);

  const footer = [];
  if (atk.hits > 1 && atk.damageMultiplier != null) {
    footer.push(`<span class="essentiary-dmg-badge">${atk.hits} hits &times; ${atk.damageMultiplier}&times;</span>`);
  } else if (atk.damageMultiplier != null && atk.damageMultiplier !== 1) {
    footer.push(`<span class="essentiary-dmg-badge">${atk.damageMultiplier}&times; damage</span>`);
  }
  if (atk.onHitEffects?.length) {
    atk.onHitEffects.forEach(e => {
      const cls = _EFFECT_CHIP_CLASS[e.effectId] ?? '';
      const effectDef = STATUS_EFFECTS[e.effectId];
      const name = effectDef?.name ?? e.effectId;
      const icon = effectDef?.icon ? `<img src="${asset(effectDef.icon)}" class="essentiary-effect-icon" alt="">` : '';
      const pct = Math.round(e.chance * 100);
      const dur = e.durationSec ? ` &middot; ${e.durationSec}s` : '';
      footer.push(`<span class="essentiary-effect-chip ${cls}">${icon}${name} ${pct}%${dur}</span>`);
    });
  }
  if (atk.summons?.length) {
    atk.summons.forEach(s => {
      const label = s.monsterType.charAt(0).toUpperCase() + s.monsterType.slice(1);
      footer.push(`<span class="essentiary-summon-badge">&#8853; Summons ${s.count} ${label}</span>`);
    });
  }

  return `
    <div class="essentiary-special-attack">
      <div class="essentiary-special-header">
        <span class="essentiary-special-name">${atk.displayName}</span>
        ${badges.join('')}
      </div>
      <div class="essentiary-special-desc">${atk.description}</div>
      ${footer.length ? `<div class="essentiary-special-footer">${footer.join('')}</div>` : ''}
    </div>
  `;
}

/** Return the boss essence name from a monster def's drops, or null. */
function _getEssenceName(def) {
  if (!def.drops) return null;
  for (const d of def.drops) {
    const itemName = typeof d.item === 'string' ? d.item : d.item?.name;
    if (itemName && itemName.endsWith(' Essence') && itemName !== 'Life Essence') return itemName;
  }
  return null;
}

let _currentMonsterKey = null;
let _listResizeObserver = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initEssentiary() {
  const closeBtn = document.getElementById('essentiary-close');
  if (closeBtn) closeBtn.addEventListener('click', closeEssentiary);

  const backBtn = document.getElementById('essentiary-back');
  if (backBtn) backBtn.addEventListener('click', _showListScreen);

  const challengeBtn = document.getElementById('essentiary-challenge');
  if (challengeBtn) {
    challengeBtn.addEventListener('click', () => {
      if (_currentMonsterKey) {
        const key = _currentMonsterKey; // capture before closeEssentiary resets it
        const select = document.getElementById('essentiary-tier-select');
        const selectedTier = select ? parseInt(select.value, 10) : getMonsterTier(key);
        closeEssentiary();
        window._arenaEnter?.(key, selectedTier);
      }
    });
  }

  const tierSelect = document.getElementById('essentiary-tier-select');
  if (tierSelect) {
    tierSelect.addEventListener('change', () => {
      if (_currentMonsterKey) {
        _renderStats(MONSTERS_DATA[_currentMonsterKey], parseInt(tierSelect.value, 10));
      }
    });
  }

  // Expose on window for easy access from objects.js
  window.openEssentiary = (opts) => openEssentiary(opts);
}

let _unlockAll = false;

export function openEssentiary(opts) {
  _unlockAll = !!(opts && opts.unlockAll);
  const overlay = document.getElementById('essentiary-overlay');
  if (!overlay) return;
  _renderList();
  _showListScreen();
  overlay.classList.remove('essentiary-hidden');
}

export function closeEssentiary() {
  const overlay = document.getElementById('essentiary-overlay');
  if (overlay) overlay.classList.add('essentiary-hidden');
  _currentMonsterKey = null;
  if (_listResizeObserver) {
    _listResizeObserver.disconnect();
    _listResizeObserver = null;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _renderStats(baseDef, tier) {
  const def = applyTierScaling(baseDef, tier);
  const statsEl = document.getElementById('essentiary-detail-stats');
  if (!statsEl) return;
  statsEl.innerHTML = `
    <table class="essentiary-stats-table">
      <tbody>
        <tr><td class="stat-label">HP</td><td class="stat-val">${def.hp}</td></tr>
        <tr><td class="stat-label">Defence</td><td class="stat-val">${def.defence}</td></tr>
        <tr><td class="stat-label">XP</td><td class="stat-val">${def.xp}</td></tr>
        <tr><td class="stat-label">Atk Speed</td><td class="stat-val">${def.attackSpeed}×</td></tr>
        <tr><td class="stat-label">Strength</td><td class="stat-val">${def.stats?.strength ?? '—'}</td></tr>
        <tr><td class="stat-label">Dexterity</td><td class="stat-val">${def.stats?.dexterity ?? '—'}</td></tr>
        <tr><td class="stat-label">Vitality</td><td class="stat-val">${def.stats?.vitality ?? '—'}</td></tr>
        <tr><td class="stat-label">Intelligence</td><td class="stat-val">${def.stats?.intelligence ?? '—'}</td></tr>
        <tr><td class="stat-label">Resilience</td><td class="stat-val">${def.stats?.resilience ?? '—'}</td></tr>
      </tbody>
    </table>
  `;
}

function _showListScreen() {
  document.getElementById('essentiary-list').style.display = '';
  document.getElementById('essentiary-detail').style.display = 'none';
  const nav = document.getElementById('essentiary-nav');
  if (nav) nav.style.display = 'none';
}

function _showDetailScreen() {
  document.getElementById('essentiary-list').style.display = 'none';
  document.getElementById('essentiary-detail').style.display = '';
  const nav = document.getElementById('essentiary-nav');
  if (nav) nav.style.display = '';
}

// Giant and aqua_man images fill the frame edge-to-edge — treat the same as
// every other monster in the detail view (no upscale needed or desired).
const UPSCALE_MONSTERS = new Set(['minotaur']);

// On the list cards, aqua_man and giant fill the frame edge-to-edge after
// being re-cropped, so scale them down slightly for breathing room.
// Minotaur still benefits from the upscale.
const LIST_IMG_CLASS = {
  giant:    'img-shrink',
  aqua_man: 'img-shrink',
  minotaur: 'img-upscale',
};

function _makeSkeleton() {
  const card = document.createElement('div');
  card.className = 'essentiary-card essentiary-card-skeleton';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML = `
    <div class="essentiary-card-img-wrap skel-block"></div>
    <div class="essentiary-card-info">
      <div class="skel-line skel-name"></div>
      <div class="skel-line skel-family"></div>
      <div class="skel-line skel-desc1"></div>
      <div class="skel-line skel-desc2"></div>
    </div>
  `;
  return card;
}

function _fillSkeletons(grid, list, realCount) {
  // Remove previous skeletons
  grid.querySelectorAll('.essentiary-card-skeleton').forEach(el => el.remove());

  const listH = list.clientHeight;
  const gridW = grid.clientWidth;
  if (!listH || !gridW) return;

  // Match CSS: repeat(auto-fill, minmax(340px, 1fr)) gap 20px
  const colMinW = 340;
  const gap = 20;
  const cols = Math.max(1, Math.floor((gridW + gap) / (colMinW + gap)));

  // Use first real card height if available, else estimate
  const firstCard = grid.querySelector('.essentiary-card:not(.essentiary-card-skeleton)');
  const cardH = firstCard ? firstCard.offsetHeight : 120;
  const rowH = cardH + gap;

  const rows = Math.ceil(listH / rowH);
  const totalSlots = cols * rows;
  const skeletonCount = Math.max(0, totalSlots - realCount);

  for (let i = 0; i < skeletonCount; i++) {
    grid.appendChild(_makeSkeleton());
  }
}

function _renderList() {
  const grid = document.getElementById('essentiary-grid');
  const list = document.getElementById('essentiary-list');
  if (!grid || !list) return;
  grid.innerHTML = '';

  // Only monsters with a valid image field
  const entries = Object.entries(MONSTERS_DATA).filter(([, def]) => def.image);
  const seen = getSeenEssences();

  entries.forEach(([key, def]) => {
    const essenceName = _getEssenceName(def);
    const locked = !_unlockAll && essenceName && !seen.has(essenceName);

    const card = document.createElement('div');
    card.className = 'essentiary-card' + (locked ? ' essentiary-card-locked' : '');
    const imgExtra = LIST_IMG_CLASS[key] ? ` ${LIST_IMG_CLASS[key]}` : '';
    const tier = locked ? 1 : getMonsterTier(key);
    const tierBadge = !locked
      ? `<div class="essentiary-card-tier">Tier ${tier}</div>`
      : '';
    card.innerHTML = `
      <div class="essentiary-card-img-wrap">
        <img src="${asset(def.image)}" alt="${locked ? '???' : def.name}" class="essentiary-card-img${imgExtra}" loading="lazy">
      </div>
      <div class="essentiary-card-info">
        <div class="essentiary-card-name">${locked ? '???' : def.name}</div>
        <div class="essentiary-card-family">${locked ? '' : (MONSTER_FAMILIES[def.family]?.name ?? def.family)}</div>
        <div class="essentiary-card-desc">${locked ? 'Present its essence to Barnaby to unlock.' : (def.description ?? '')}</div>
        ${tierBadge}
      </div>
    `;
    if (!locked) card.addEventListener('click', () => _openDetail(key));
    grid.appendChild(card);
  });

  const realCount = entries.length;

  // Disconnect previous observer if any
  if (_listResizeObserver) {
    _listResizeObserver.disconnect();
    _listResizeObserver = null;
  }

  _listResizeObserver = new ResizeObserver(() => {
    _fillSkeletons(grid, list, realCount);
  });
  _listResizeObserver.observe(list);
}

function _openDetail(key) {
  const def = MONSTERS_DATA[key];
  if (!def) return;
  _currentMonsterKey = key;

  // Update breadcrumb
  const navMonster = document.getElementById('essentiary-nav-monster');
  if (navMonster) navMonster.textContent = def.name;

  // Populate detail
  const img = document.getElementById('essentiary-detail-img');
  img.src = asset(def.image ?? '');
  img.alt = def.name;
  img.classList.toggle('img-upscale', UPSCALE_MONSTERS.has(key));

  document.getElementById('essentiary-detail-name').textContent = def.name;
  
  // Family lookup
  const familyDef = MONSTER_FAMILIES[def.family];
  const familyName = familyDef?.name ?? def.family;
  const familyIcon = familyDef?.icon ? `<img src="${asset(familyDef.icon)}" class="essentiary-family-icon" alt="">` : '';
  
  const familyEl = document.getElementById('essentiary-detail-family');
  familyEl.innerHTML = `${familyIcon}${familyName}`;
  familyEl.title = familyDef?.description ?? '';

  const tier = getMonsterTier(key);
  const victories = tier - 1;
  const tierEl = document.getElementById('essentiary-detail-tier');
  if (tierEl) {
    const victoryStr = victories === 0
      ? 'not yet defeated'
      : victories === 1 ? '1 victory' : `${victories} victories`;
    tierEl.textContent = `Tier ${tier}  ·  ${victoryStr}`;
    tierEl.style.display = '';
  }

  document.getElementById('essentiary-detail-desc').textContent = def.description ?? '';

  // Stats
  _renderStats(def, tier);

  // Update tier dropdown
  const selectWrap = document.getElementById('essentiary-tier-select-wrap');
  const select = document.getElementById('essentiary-tier-select');
  if (selectWrap && select) {
    select.innerHTML = '';
    for (let i = 1; i <= tier; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `Tier ${i}`;
      if (i === tier) option.selected = true;
      select.appendChild(option);
    }
    // Only show dropdown if they have unlocked at least tier 1 victory (so max tier > 1)
    if (tier > 1) {
      selectWrap.style.display = 'flex';
    } else {
      selectWrap.style.display = 'none';
    }
  }

  // Column 3 — on-hit effects + special attacks
  const abilitiesCol = document.getElementById('essentiary-col-abilities');
  if (abilitiesCol) {
    abilitiesCol.innerHTML = ''; // clear previous monster's content

    // On-hit effects (passive status applied on normal attacks)
    if (def.onHitEffects?.length) {
      const effectsHtml = def.onHitEffects.map(e => {
        const effectDef = STATUS_EFFECTS[e.effectId];
        const name = effectDef?.name ?? e.effectId;
        const icon = effectDef?.icon ? `<img src="${asset(effectDef.icon)}" class="essentiary-effect-icon" alt="">` : '';
        return `<span class="essentiary-effect-tag">${icon}${name} (${Math.round(e.chance * 100)}%)</span>`;
      }).join('');
      const effectsSection = document.createElement('div');
      effectsSection.className = 'essentiary-special-section';
      effectsSection.innerHTML = `
        <div class="essentiary-section-header">
          <span class="essentiary-section-icon">&#9763;</span>
          <span class="essentiary-section-title">On-Hit Effects</span>
          <div class="essentiary-section-line"></div>
        </div>
        <div class="essentiary-effects-row">${effectsHtml}</div>
      `;
      abilitiesCol.appendChild(effectsSection);
    }

    // Special attacks
    if (def.specialAttacks?.length) {
      const section = document.createElement('div');
      section.id = 'essentiary-detail-special';
      section.className = 'essentiary-special-section';
      section.innerHTML = `
        <div class="essentiary-section-header">
          <span class="essentiary-section-icon">&#9876;</span>
          <span class="essentiary-section-title">Special Abilities</span>
          <div class="essentiary-section-line"></div>
        </div>
        ${def.specialAttacks.map(_renderSpecialAttack).join('')}
      `;
      abilitiesCol.appendChild(section);
    }

    if (!def.onHitEffects?.length && !def.specialAttacks?.length) {
      abilitiesCol.innerHTML = '<p class="essentiary-no-abilities">No special abilities</p>';
    }
  }

  _showDetailScreen();
}

// ── Save / restore ────────────────────────────────────────────────────────────
export function captureEssentiary() {
  return { arenaMonsterTiers: { ..._arenaMonsterTiers } };
}

export function restoreEssentiary(data) {
  if (!data) return;
  _arenaMonsterTiers = data.arenaMonsterTiers ?? {};
}

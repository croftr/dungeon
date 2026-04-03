// ─────────────────────────────────────────────────────────────────────────────
//  THE ESSENTIARY — Monster Bestiary & Arena UI
// ─────────────────────────────────────────────────────────────────────────────
import MONSTERS_DATA from './data/monsters.json';

const _EFFECT_CHIP_CLASS = {
  fear:   'effect-chip-fear',
  poison: 'effect-chip-poison',
  slow:   'effect-chip-slow',
  rot:    'effect-chip-rot',
  frozen: 'effect-chip-frozen',
  stun:   'effect-chip-stun',
};

const _EFFECT_DISPLAY = {
  fear:   'Fear',
  poison: 'Poison',
  slow:   'Slow',
  rot:    'Rot',
  frozen: 'Frozen',
  stun:   'Stun',
};

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
      const name = _EFFECT_DISPLAY[e.effectId] ?? e.effectId;
      const pct = Math.round(e.chance * 100);
      const dur = e.durationSec ? ` &middot; ${e.durationSec}s` : '';
      footer.push(`<span class="essentiary-effect-chip ${cls}">${name} ${pct}%${dur}</span>`);
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

let _currentMonsterKey = null;

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
        closeEssentiary();
        window._arenaEnter?.(key);
      }
    });
  }

  // Expose on window for easy access from objects.js
  window.openEssentiary = openEssentiary;
}

export function openEssentiary() {
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
}

// ── Internal ──────────────────────────────────────────────────────────────────

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

const UPSCALE_MONSTERS = new Set(['giant', 'minotaur', 'aqua_man']);

// On the list cards, aqua_man and giant fill the frame edge-to-edge after
// being re-cropped, so scale them down slightly for breathing room.
// Minotaur still benefits from the upscale.
const LIST_IMG_CLASS = {
  giant:    'img-shrink',
  aqua_man: 'img-shrink',
  minotaur: 'img-upscale',
};

function _renderList() {
  const grid = document.getElementById('essentiary-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Only monsters with a valid image field
  const entries = Object.entries(MONSTERS_DATA).filter(([, def]) => def.image);

  entries.forEach(([key, def]) => {
    const card = document.createElement('div');
    card.className = 'essentiary-card';
    const imgExtra = LIST_IMG_CLASS[key] ? ` ${LIST_IMG_CLASS[key]}` : '';
    card.innerHTML = `
      <div class="essentiary-card-img-wrap">
        <img src="${def.image}" alt="${def.name}" class="essentiary-card-img${imgExtra}" loading="lazy">
      </div>
      <div class="essentiary-card-info">
        <div class="essentiary-card-name">${def.name}</div>
        <div class="essentiary-card-family">${def.family}</div>
        <div class="essentiary-card-desc">${def.description ?? ''}</div>
      </div>
    `;
    card.addEventListener('click', () => _openDetail(key));
    grid.appendChild(card);
  });
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
  img.src = def.image ?? '';
  img.alt = def.name;
  img.classList.toggle('img-upscale', UPSCALE_MONSTERS.has(key));

  document.getElementById('essentiary-detail-name').textContent = def.name;
  document.getElementById('essentiary-detail-family').textContent = def.family;
  document.getElementById('essentiary-detail-desc').textContent = def.description ?? '';

  // Stats
  const statsEl = document.getElementById('essentiary-detail-stats');
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

  // On-hit effects badge
  if (def.onHitEffects?.length) {
    const effects = def.onHitEffects.map(e =>
      `<span class="essentiary-effect-tag">${e.effectId} (${Math.round(e.chance * 100)}%)</span>`
    ).join('');
    statsEl.innerHTML += `<div class="essentiary-effects-row">${effects}</div>`;
  }

  // Special attacks section — remove any previous before re-rendering
  document.getElementById('essentiary-detail-special')?.remove();
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
    statsEl.after(section);
  }

  _showDetailScreen();
}

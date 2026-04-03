// ─────────────────────────────────────────────────────────────────────────────
//  THE ESSENTIARY — Monster Bestiary & Arena UI
// ─────────────────────────────────────────────────────────────────────────────
import MONSTERS_DATA from './data/monsters.json';

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

  _showDetailScreen();
}

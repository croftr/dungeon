// ─────────────────────────────────────────────
//  LEVELING SYSTEM
//
//  Handles XP distribution and level-up detection.
//  Skill choice and stat allocation happen in the
//  character development screen (player-driven).
// ─────────────────────────────────────────────

import LEVELING from './data/leveling.json';
import SKILLS_DATA from './data/skills.json';
import { party, refreshPartyCards } from './party.js';
import { playLevelUpSound } from './audio.js';
import { addLogEntry } from './battle-log.js';

const { xpThresholds, maxLevel } = LEVELING;

/**
 * Award XP from a monster kill to all living party members.
 * XP is split evenly among living members.
 * @param {number} totalXP - total XP the monster is worth
 */
export function awardXP(totalXP) {
  if (!totalXP || totalXP <= 0) return;

  const livingMembers = party.filter(m => !m.isEmpty && !m.isDead);
  if (livingMembers.length === 0) return;

  const share = Math.floor(totalXP / livingMembers.length);
  if (share <= 0) return;

  const allEvents = [];
  for (const m of livingMembers) {
    m.xp = (m.xp ?? 0) + share;
    allEvents.push(...checkLevelUp(m));
  }

  if (allEvents.length > 0) {
    playLevelUpSound();
    // Group by member name and take the highest level reached per member
    const highestLevel = {}; // member.id -> { member, level }
    for (const ev of allEvents) {
      if (!highestLevel[ev.member.id] || ev.level > highestLevel[ev.member.id].level) {
        highestLevel[ev.member.id] = { member: ev.member, level: ev.level };
      }
    }
    showDramaticLevelUp(Object.values(highestLevel));
  }

  refreshPartyCards();
}

/**
 * Display a dramatic level up overlay for one or more party members.
 */
function showDramaticLevelUp(levelUps) {
  let overlay = document.getElementById('dramatic-levelup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dramatic-levelup-overlay';
    document.body.appendChild(overlay);
  }

  const container = document.createElement('div');
  container.className = 'dramatic-levelup-group';

  const cardsRow = document.createElement('div');
  cardsRow.className = 'dramatic-levelup-cards-row';
  container.appendChild(cardsRow);

  for (const { member, level } of levelUps) {
    const card = document.createElement('div');
    card.className = 'dramatic-levelup-card';

    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    canvas.className = 'dramatic-levelup-portrait';

    // We must import drawPortrait from party.js to draw the face
    import('./party.js').then(({ drawPortrait }) => {
      drawPortrait(canvas, member);
    });

    const text = document.createElement('div');
    text.className = 'dramatic-levelup-text';
    text.innerHTML = `<span class="dl-name">${member.name}</span><br/>has attained<br/><span class="dl-level">Level ${level}!</span>`;

    card.appendChild(canvas);
    card.appendChild(text);
    cardsRow.appendChild(card);
  }

  function makeCloseBtn() {
    const btn = document.createElement('button');
    btn.className = 'dramatic-levelup-close';
    btn.textContent = 'Dismiss';
    return btn;
  }

  const closeBtnTop = makeCloseBtn();
  const closeBtnBottom = makeCloseBtn();
  container.insertBefore(closeBtnTop, cardsRow);
  container.appendChild(closeBtnBottom);

  overlay.appendChild(container);

  function dismiss() {
    container.classList.remove('dl-show');
    clearTimeout(autoTimer);
    setTimeout(() => container.remove(), 600);
  }

  closeBtnTop.addEventListener('click', dismiss);
  closeBtnBottom.addEventListener('click', dismiss);

  // Trigger animation
  requestAnimationFrame(() => {
    container.classList.add('dl-show');
  });

  // Remove after a few seconds
  const autoTimer = setTimeout(dismiss, 10000);
}

/**
 * Check if a party member has enough XP to level up.
 * Sets m.pendingLevelUp = true so the inventory screen shows a
 * "Level Up!" button — the player then opens the dev screen to
 * choose a skill and allocate stat points, then confirms.
 * Returns an array of { name, level } events for each level gained.
 */
export function checkLevelUp(m) {
  const events = [];
  while (m.level < maxLevel) {
    const threshold = xpThresholds[m.level];
    if (threshold === undefined || m.xp < threshold) break;

    m.level++;
    m.pendingNodePicks = (m.pendingNodePicks ?? 0) + 1;
    m.pendingLevelUp = true;

    events.push({ member: m, level: m.level });
    addLogEntry({ type: 'levelup', target: m.name, level: m.level, time: Date.now() });
  }
  return events;
}

/**
 * Get XP needed for the next level, or null if at max level.
 */
export function getNextLevelXP(member) {
  if (member.level >= maxLevel) return null;
  return xpThresholds[member.level] ?? null;
}

/**
 * Hydrate a skill name string into a full skill object,
 * matching the format used by recruits.js.
 */
export function hydrateSkill(skillName) {
  const def = SKILLS_DATA[skillName];
  if (!def) {
    console.warn(`[leveling] Skill "${skillName}" not found in skills.json`);
    return { name: skillName };
  }
  return {
    name: skillName,
    type: def.type,
    delay: (def.cooldownMs || 0) / 1000,
    description: def.description,
    icon: def.icon,
    ...(def.attackType ? { attackType: def.attackType } : {}),
  };
}

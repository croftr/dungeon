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
import { showMessage } from './minimap.js';
import { playLevelUpSound } from './audio.js';
import { addLogEntry } from './battle-log.js';

const { xpThresholds, statPointsPerLevel, maxLevel } = LEVELING;

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

  for (const m of livingMembers) {
    m.xp = (m.xp ?? 0) + share;
    checkLevelUp(m);
  }

  refreshPartyCards();
}

/**
 * Check if a party member has enough XP to level up.
 * Sets m.pendingLevelUp = true so the inventory screen shows a
 * "Level Up!" button — the player then opens the dev screen to
 * choose a skill and allocate stat points, then confirms.
 */
function checkLevelUp(m) {
  while (m.level < maxLevel) {
    const threshold = xpThresholds[m.level];
    if (threshold === undefined || m.xp < threshold) break;

    m.level++;
    m.unspentStatPoints = (m.unspentStatPoints ?? 0) + statPointsPerLevel;
    m.pendingLevelUp = true;

    playLevelUpSound();
    showMessage(
      `<b>${m.name}</b> has reached <b>Level ${m.level}</b>!`,
      3500
    );

    addLogEntry({ type: 'levelup', target: m.name, level: m.level, time: Date.now() });
  }
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

// ─────────────────────────────────────────────
//  LEVELING SYSTEM
//
//  Handles XP distribution, level-up detection,
//  skill progression, and level-up UI queue.
// ─────────────────────────────────────────────

import LEVELING from './data/leveling.json';
import SKILLS_DATA from './data/skills.json';
import { party, refreshPartyCards } from './party.js';
import { openCharDevModal } from './equipment.js';
import { showMessage } from './minimap.js';
import { playLevelUpSound } from './audio.js';
import { addLogEntry } from './battle-log.js';

const { xpThresholds, statPointsPerLevel, maxLevel } = LEVELING;

// Queue of party indices that have levelled up and need the dev modal opened
const levelUpQueue = [];
let isProcessingQueue = false;

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

  // Process any queued level-ups after a short delay (let death animation finish)
  if (levelUpQueue.length > 0 && !isProcessingQueue) {
    setTimeout(() => processLevelUpQueue(), 800);
  }
}

/**
 * Check if a party member has enough XP to level up.
 * May trigger multiple level-ups if enough XP accumulated.
 */
function checkLevelUp(m) {
  while (m.level < maxLevel) {
    const threshold = xpThresholds[m.level];
    if (threshold === undefined || m.xp < threshold) break;

    m.level++;
    m.unspentStatPoints = (m.unspentStatPoints ?? 0) + statPointsPerLevel;

    // Auto-learn next skill from progression (fixed order)
    const skillIndex = m.level - 1; // level 1 → skillProgression[0]
    if (m.skillProgression && skillIndex < m.skillProgression.length) {
      const newSkill = m.skillProgression[skillIndex];
      // newSkill is already a hydrated skill object
      m.skills.push(newSkill);
      m.newlyLearnedSkill = newSkill.name;

      // Auto-equip in the skill slot if it's empty and this is an active skill
      const skillDef = SKILLS_DATA[newSkill.name];
      if (m.equipment && !m.equipment.skill && skillDef && !skillDef.isPassive) {
        m.equipment.skill = { name: newSkill.name, slot: 'skill', icon: newSkill.icon ?? null };
      }
    }

    // Queue this member for the level-up UI
    if (!levelUpQueue.includes(m.id)) {
      levelUpQueue.push(m.id);
    }

    addLogEntry({
      type: 'levelup',
      target: m.name,
      level: m.level,
      time: Date.now(),
    });
  }
}

/**
 * Process the level-up queue — opens the dev modal for each
 * member who levelled up, one at a time.
 */
function processLevelUpQueue() {
  if (levelUpQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const memberId = levelUpQueue.shift();
  const memberIndex = party.findIndex(m => m.id === memberId);
  const m = party[memberIndex];

  if (!m || m.isEmpty) {
    // Skip invalid, try next
    processLevelUpQueue();
    return;
  }

  // Play fanfare
  playLevelUpSound();

  // Show level-up message
  const skillMsg = m.newlyLearnedSkill
    ? `<br><small style="color:#a0d8ff;">Learned: ${m.newlyLearnedSkill}</small>`
    : '';
  showMessage(
    `<span style="color:#c8a84a; font-size:18px;">LEVEL UP!</span><br>` +
    `<b>${m.name}</b> reached <b>Level ${m.level}</b>!` +
    skillMsg,
    4000
  );

  // Open dev modal after a short delay so the message is visible
  setTimeout(() => {
    openCharDevModal(memberIndex);
  }, 1500);
}

/**
 * Called when the dev modal is closed — continues processing
 * any remaining level-ups in the queue.
 */
export function onCharDevClosed() {
  if (levelUpQueue.length > 0) {
    setTimeout(() => processLevelUpQueue(), 500);
  } else {
    isProcessingQueue = false;
  }
}

/**
 * Get XP needed for the next level, or null if at max.
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

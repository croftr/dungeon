import { party, refreshPartyCards, lastAttackTimes, setHp, setMp, setSp, drawPortrait, applyStatusEffect, addGold, getAttackSpeedMultiplier, hasEffectFlag, breakPartyUnseen } from './party.js';
import { showInlineHelp } from './help.js';
import { getItemDef } from './items.js';
import { SPELLS } from './spells.js';
import { STATUS_EFFECT_DEFS } from './status-effects.js';
import { ACTIONS } from './items.js';
import POTIONS from './data/items/potions.json';
import FORGE from './data/forge.json';
import WEAPONS from './data/items/weapons.json';
import SKILLS_DATA from './data/skills.json';
import { asset } from './assets.js';
import { playAction } from './actions.js';
import { attackMonster, monsters, getInRangeMonster, setHuntersEyeTarget, getHuntersEyeTargetId, applyMonsterStatusEffect } from './monster.js';
import { showMessage } from './minimap.js';
import RECRUITS_DATA from './data/recruits.json';
import SPELL_TYPE_ICONS from './data/spell-type-icons.json';
import { isInFrontOfPlayer, player } from './player.js';
import { isAlchemyModalOpen, addItemToAlchemy } from './objects.js';
import { canMelee, resolveSkillMagnitude, resolveSpellMagnitude, calcOnHitChance } from './combat-rules.js';
import { playCritSound, playSkillSound, playItemSound, playLevelUpConfirmSound, playInventorySortSound } from './audio.js';
import { addLogEntry } from './battle-log.js';
import { skillsState } from './skills-state.js';
import { getNextLevelXP, getCurrentLevelThreshold, hydrateSkill } from './leveling.js';
import { getSkillTree, applyNodeBenefit, renderSkillTree } from './skill-tree.js';
import {
  triggerSanctuaryEffect,
  triggerHolyRadianceEffect,
  triggerHuntersEyeEffect,
  triggerEntangleEffect,
  triggerSunderArmorEffect,
  triggerBerserkEffect,
  triggerWarcryEffect,
  triggerArcaneLanternEffect,
  triggerRunicScholarEffect,
  triggerManaTapEffect,
  triggerFireballEffect,
  triggerRegenerationEffect,
  triggerCurePoisonEffect,
  triggerWhirlwindEffect,
  triggerWarDanceEffect,
  triggerTrueShotEffect,
  triggerDoubleAttackEffect,
  triggerRampartEffect,
  triggerDefaultSpellEffect,
  triggerDefaultSkillEffect,
  triggerSleepEffect,
  triggerBanishmentEffect,
  triggerIncinerateEffect,
} from './quarks-intro.js';

// Maps spell attackType → VFX + sound. Add new entries here as spells grow.
function _dispatchSpellVFX(attackType, target = null) {
  switch (attackType) {
    case 'fireball': {
      const dist = target
        ? Math.abs(target.gridRow - player.gridRow) + Math.abs(target.gridCol - player.gridCol)
        : 2;
      triggerFireballEffect(dist);
      // fireball audio already handled by playActionSound inside playAction
      break;
    }
    case 'banishment': {
      const dist = target
        ? Math.abs(target.gridRow - player.gridRow) + Math.abs(target.gridCol - player.gridCol)
        : 2;
      triggerBanishmentEffect(dist);
      // audio already handled
      break;
    }
    case 'incinerate':
      triggerIncinerateEffect();
      break;
    case 'regenerate':
      playSkillSound('cure');
      triggerRegenerationEffect();
      break;
    case 'cure-poison':
    case 'resist-poison':
      playSkillSound('cure');
      triggerCurePoisonEffect();
      break;
    case 'heal':
      playSkillSound('heal');
      triggerHolyRadianceEffect();
      break;
    case 'sleep':
      playSkillSound('sleep');
      triggerSleepEffect();
      break;
    default:
      playSkillSound('magic');
      triggerDefaultSpellEffect();
      break;
  }
}

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

// Derived max stat formulas — single source of truth
// HP scales with vitality, MP with intelligence, SP with resilience.
const HP_PER_VIT = 8;
const MP_PER_INT = 4;
const SP_PER_RES = 10;

/**
 * Calculate hpMax, mpMax, spMax from a stats object.
 * Items that boost vitality/intelligence/resilience automatically cascade here.
 */
export function calcDerivedMaxStats(stats) {
  return {
    hpMax: (stats.vitality ?? 0) * HP_PER_VIT,
    mpMax: (stats.intelligence ?? 0) * MP_PER_INT,
    spMax: (stats.resilience ?? 0) * SP_PER_RES,
  };
}

const SLOT_KEYS = [
  'head', 'cloak', 'neck', 'chest',
  'leftHand', 'rightHand',
  'belt', 'hands',
  'ring1', 'ring2',
  'legs', 'feet', 'ammo', 'skill', 'skill2', 'skill3', 'skill4', 'skill5', 'skill6',
];

// Item types that can be placed in quick-use slots.
// Add new type strings here when new quickslottable item categories are introduced.
const QUICKSLOT_TYPES = ['potion'];

const INVENTORY_SIZE = 20; // 4 cols × 5 rows

// Human-readable slot labels for the detail panel
const SLOT_LABELS = {
  head: 'Head',
  cloak: 'Cloak',
  neck: 'Neck',
  chest: 'Chest',
  leftHand: 'Left Hand',
  rightHand: 'Right Hand',
  bothHands: 'Both Hands',
  belt: 'Belt',
  hands: 'Gauntlets',
  ring1: 'Ring',
  ring2: 'Ring',
  legs: 'Legs',
  feet: 'Feet',
  ammo: 'Ammunition',
  skill: 'Skill',
};

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let activeCharIndex = null;
let activeCharDevIndex = null;
let _equipSkillTab = 'action';
let _ctxInvIndex = null;   // inventory slot most recently right-clicked
let _skillSwMenuCtx = null; // { memberIndex, mode: 'skill'|'spell' } when skill-switch menu is open

// ─────────────────────────────────────────────
//  DATA SETUP  — extends party member objects
// ─────────────────────────────────────────────

export function updateEffectiveStats(m) {
  if (!m.baseStats) {
    if (!m.stats) return; // safeguard
    m.baseStats = { ...m.stats };
  }
  const newStats = { ...m.baseStats };

  // Apply level-up stat bonuses before equipment
  if (m.statBonuses) {
    for (const [stat, bonus] of Object.entries(m.statBonuses)) {
      if (newStats[stat] !== undefined) newStats[stat] += bonus;
    }
  }

  // skillBonuses accumulates flat additions to formula-resolved skill magnitudes.
  // Keys: "all" (every skill), or a skill type string e.g. "healing", "buff", "debuff".
  const newSkillBonuses = {};
  const newStatusResistances = {};
  let newSkillDurationBonusMs = 0;
  let directHpBonus = 0, directMpBonus = 0, directSpBonus = 0;
  const countedItems = new Set();

  Object.values(m.equipment || {}).forEach(item => {
    if (item && !countedItems.has(item)) {
      countedItems.add(item);
      const def = getItemDef(item.name);
      if (!def) return;

      // Preferred: structured statBonuses object  { vitality: 1, intelligence: 2, … }
      // This is the general-purpose data-driven approach — add a statBonuses entry to
      // any item definition and it will be applied automatically when equipped.
      // hp/mp/sp keys directly boost the max pool (bypassing stat scaling).
      if (def.statBonuses) {
        Object.entries(def.statBonuses).forEach(([stat, delta]) => {
          if (stat === 'hp') directHpBonus += delta;
          else if (stat === 'mp') directMpBonus += delta;
          else if (stat === 'sp') directSpBonus += delta;
          else if (newStats[stat] !== undefined) {
            newStats[stat] += delta;
          }
        });
      }

      // skillBonuses: flat additions to formula-resolved skill magnitudes.
      // Add a skillBonuses entry to any item definition to boost skill potency.
      if (def.skillBonuses) {
        Object.entries(def.skillBonuses).forEach(([key, delta]) => {
          newSkillBonuses[key] = (newSkillBonuses[key] ?? 0) + delta;
        });
      }

      // skillDurationBonusMs: adds milliseconds to the active duration of all timed skills.
      if (def.skillDurationBonusMs) {
        newSkillDurationBonusMs += def.skillDurationBonusMs;
      }

      // statusResistances: reduce the chance of specific on-hit effects landing.
      // Values are additive across items, capped at 0.9 (90%) per effect.
      // e.g. { "poison": 0.5 } halves the chance that poison takes hold.
      if (def.statusResistances) {
        Object.entries(def.statusResistances).forEach(([effectId, resistance]) => {
          newStatusResistances[effectId] = Math.min(0.9, (newStatusResistances[effectId] ?? 0) + resistance);
        });
      }
    }
  });

  m.stats = newStats;
  m.skillBonuses = newSkillBonuses;
  m.statusResistances = newStatusResistances;
  m.skillDurationBonusMs = newSkillDurationBonusMs;

  // Recalculate hpMax/mpMax/spMax from the (now equipment-boosted) stats,
  // then add any direct pool bonuses from item statBonuses (hp/mp/sp keys).
  const derived = calcDerivedMaxStats(newStats);
  m.hpMax = derived.hpMax + directHpBonus;
  m.mpMax = derived.mpMax + directMpBonus;
  m.spMax = derived.spMax + directSpBonus;

  // Initialise current values on first equip; otherwise clamp to new maxes
  if (m.hp === undefined) m.hp = m.hpMax;
  if (m.mp === undefined) m.mp = m.mpMax;
  if (m.sp === undefined) m.sp = m.spMax;
  m.hp = Math.min(m.hp, m.hpMax);
  m.mp = Math.min(m.mp, m.mpMax);
  m.sp = Math.min(m.sp, m.spMax);
}

export function extendPartyData() {
  party.forEach((m) => {
    if (m.isEmpty) return;
    if (m.isDead === undefined) m.isDead = false;

    if (!m.baseStats && m.stats) {
      m.baseStats = { ...m.stats };
    }

    // Initialize leveling fields if missing
    if (m.level === undefined) m.level = 0;
    if (m.xp === undefined) m.xp = 0;
    if (!m.statBonuses) m.statBonuses = { strength: 0, dexterity: 0, vitality: 0, intelligence: 0, resilience: 0 };
    if (m.pendingLevelUp === undefined) m.pendingLevelUp = false;
    if (!m.quickslots) m.quickslots = [null, null, null];
    else while (m.quickslots.length < 3) m.quickslots.push(null);
    if (!m.loadoutB) m.loadoutB = { leftHand: null, rightHand: null, skill: null };
    else {
      // Migrate old potion fields out of loadoutB (potions now live in action slots)
      delete m.loadoutB.potion;
      delete m.loadoutB.potion2;
      delete m.loadoutB.potion3;
    }
    // Skill tree fields
    if (!m.acquiredNodes) m.acquiredNodes = ['start'];
    if (m.pendingNodeChoice === undefined) m.pendingNodeChoice = null;
    if (m.pendingNodePicks === undefined) m.pendingNodePicks = 0;
    if (!m.skillTreeId) {
      const r = RECRUITS_DATA.find(x => x.name === m.name);
      if (r?.skillTree) m.skillTreeId = r.skillTree;
    }

    if (m.equipment) {
      if (m.equipment.skill2 === undefined) m.equipment.skill2 = null;
      if (m.equipment.skill3 === undefined) m.equipment.skill3 = null;
      if (m.equipment.skill4 === undefined) m.equipment.skill4 = null;
      if (m.equipment.skill5 === undefined) m.equipment.skill5 = null;
      if (m.equipment.skill6 === undefined) m.equipment.skill6 = null;
      // Migrate old quickslots[0..2] → skill4/5/6 (one-time migration)
      if (m.quickslots) {
        if (!m.equipment.skill4 && m.quickslots[0]) { m.equipment.skill4 = m.quickslots[0]; m.quickslots[0] = null; }
        if (!m.equipment.skill5 && m.quickslots[1]) { m.equipment.skill5 = m.quickslots[1]; m.quickslots[1] = null; }
        if (!m.equipment.skill6 && m.quickslots[2]) { m.equipment.skill6 = m.quickslots[2]; m.quickslots[2] = null; }
      }
      updateEffectiveStats(m);
      return; // Already initialized
    }

    // All slots empty by default
    m.equipment = Object.fromEntries(SLOT_KEYS.map((k) => [k, null]));
    // Seed left/right hand from party card data (skip '—' placeholder)
    // For bothHands items, fill both slots with the same item object reference

    // Update legacy starting items to new names if needed
    if (m.leftHand === 'Shield') m.leftHand = 'Bronze Shield';
    if (m.leftHand === 'Bow') m.leftHand = 'Short Bow';
    if (m.leftHand === 'Staff') m.leftHand = 'Oak Staff';
    if (m.rightHand === 'Shield') m.rightHand = 'Bronze Shield';
    if (m.rightHand === 'Bow') m.rightHand = 'Short Bow';
    if (m.rightHand === 'Staff') m.rightHand = 'Oak Staff';

    if (m.leftHand && m.leftHand !== '—') {
      const def = getItemDef(m.leftHand);
      const slot = def?.slot ?? 'hand';
      if (slot === 'bothHands') {
        const item = { name: m.leftHand, slot: 'bothHands' };
        m.equipment.leftHand = item;
        m.equipment.rightHand = item;
      } else {
        m.equipment.leftHand = { name: m.leftHand, slot: slot };
      }
    }
    if (m.rightHand && m.rightHand !== '—') {
      const def = getItemDef(m.rightHand);
      const slot = def?.slot ?? 'hand';
      // Only seed rightHand if not already filled by a bothHands item
      if (slot === 'bothHands') {
        if (!m.equipment.leftHand) {
          const item = { name: m.rightHand, slot: 'bothHands' };
          m.equipment.leftHand = item;
          m.equipment.rightHand = item;
        }
      } else {
        m.equipment.rightHand = { name: m.rightHand, slot: slot };
      }
    }

    // Auto-equip first learned skill if available (no startingSkill at level 0)
    if (m.skills && m.skills.length > 0) {
      const firstActive = m.skills.find(s => {
        const def = SKILLS_DATA[s.name];
        return def && !def.isPassive;
      });
      if (firstActive) {
        m.equipment.skill = { name: firstActive.name, slot: 'skill', icon: firstActive.icon ?? null };
      }
    }

    if (m.ammo) {
      m.equipment.ammo = { name: m.ammo, slot: 'ammo' };
    }

    m.spells = m.spells || [];
    // Move any items from 'skills' that are actually in 'SPELLS' into the 'spells' array
    if (m.skills) {
      for (let i = m.skills.length - 1; i >= 0; i--) {
        const s = m.skills[i];
        if (SPELLS.some(sp => sp.name === s.name)) {
          m.spells.push(m.skills.splice(i, 1)[0]);
        }
      }
    }

    // Spellbook is now in the ammo slot; spells go directly into hand slots.

    // 20-slot inventory, all empty (or with starting items)
    m.inventory = Array(INVENTORY_SIZE).fill(null);
    if (m.startingInventory) {
      const itemsToSeed = [...m.startingInventory];
      // Clear it before seeding so we don't re-seed if equipment modal is opened/closed
      delete m.startingInventory;
      itemsToSeed.forEach((itemName) => {
        addItemToInventory(party.indexOf(m), itemName);
      });
    }
    updateEffectiveStats(m);
  });
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
export function renderItemIcon(item, containerEl) {
  if (!item) {
    containerEl.innerHTML = '';
    return;
  }
  const def = getItemDef(item.name);
  // Prefer the item definition icon, then fall back to an icon stored directly
  // on the item object (used by skills such as Hunter's Eye).
  const iconSrc = def?.icon || item.icon || null;
  if (iconSrc) {
    containerEl.innerHTML = `<img src="${asset(iconSrc)}" draggable="false" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;" />`;
  } else {
    containerEl.innerHTML = `<span>${item.name}</span>`;
  }
}

function renderModal(memberIndex) {
  const m = party[memberIndex];

  // Header name + level/XP
  document.getElementById('equip-char-name').textContent = m.name;
  const levelEl = document.getElementById('equip-char-level');
  if (levelEl) {
    const nextXP = getNextLevelXP(m);
    const currXPThreshold = getCurrentLevelThreshold(m);
    if (nextXP !== null) {
      const currentProgress = (m.xp ?? 0) - currXPThreshold;
      const neededForNext = nextXP - currXPThreshold;
      levelEl.textContent = `Lv.${m.level ?? 0}  ·  ${currentProgress} / ${neededForNext} XP`;
    } else {
      levelEl.textContent = `Lv.${m.level ?? 0}  ·  MAX`;
    }
  }

  // ── Dead banner ──
  const modal = document.getElementById('equip-modal');
  let deadBanner = document.getElementById('equip-dead-banner');
  if (m.isDead) {
    if (!deadBanner) {
      deadBanner = document.createElement('div');
      deadBanner.id = 'equip-dead-banner';
      deadBanner.textContent = '☠ Fallen — Revive this character to manage their equipment';
      modal.insertBefore(deadBanner, modal.firstChild);
    }
    modal.classList.add('equip-modal--dead');
  } else {
    if (deadBanner) deadBanner.remove();
    modal.classList.remove('equip-modal--dead');
  }

  // ── Development / Level Up! button ──
  const devBtn = document.getElementById('equip-char-dev');
  if (devBtn) {
    if (m.isDead) {
      devBtn.textContent = 'Development';
      devBtn.classList.remove('level-up-pending');
      devBtn.disabled = true;
    } else if (m.pendingLevelUp) {
      devBtn.textContent = '⬆ Level Up!';
      devBtn.classList.add('level-up-pending');
      devBtn.disabled = false;
    } else {
      devBtn.textContent = 'Development';
      devBtn.classList.remove('level-up-pending');
      devBtn.disabled = false;
    }
  }

  // ── Paperdoll slots ──
  // For bothHands items the same object sits in both leftHand and rightHand.
  // We show the name in full on the primary (leftHand) slot and faded on rightHand.
  SLOT_KEYS.forEach((key) => {
    const el = document.getElementById(`pd-${key}`);
    if (!el) return;
    const item = m.equipment[key];
    const isBothHands = item?.slot === 'bothHands';
    const isSecondary = isBothHands && key === 'rightHand';
    el.classList.toggle('occupied', item !== null);
    el.classList.toggle('both-hands-secondary', isSecondary);
    const pdItemEl = el.querySelector('.pd-item') || el;
    renderItemIcon(item, pdItemEl);
  });

  // ── Loadout B slots ──
  if (!m.loadoutB) m.loadoutB = { leftHand: null, rightHand: null, skill: null };
  const lhbEl = document.getElementById('pd-lhB');
  const rhbEl = document.getElementById('pd-rhB');
  const skbEl = document.getElementById('pd-skB');
  if (lhbEl) {
    lhbEl.classList.toggle('occupied', !!m.loadoutB.leftHand);
    renderItemIcon(m.loadoutB.leftHand, lhbEl.querySelector('.pd-item') || lhbEl);
  }
  if (rhbEl) {
    const lhbIsBothHands = m.loadoutB.leftHand?.slot === 'bothHands';
    rhbEl.classList.toggle('occupied', lhbIsBothHands || !!m.loadoutB.rightHand);
    rhbEl.classList.toggle('both-hands-secondary', lhbIsBothHands);
    renderItemIcon(lhbIsBothHands ? m.loadoutB.leftHand : m.loadoutB.rightHand,
      rhbEl.querySelector('.pd-item') || rhbEl);
  }
  if (skbEl) {
    skbEl.classList.toggle('occupied', !!m.loadoutB.skill);
    renderItemIcon(m.loadoutB.skill, skbEl.querySelector('.pd-item') || skbEl);
  }

  // ── Inventory cells ──
  const cells = document.querySelectorAll('.inv-cell');
  cells.forEach((cell, i) => {
    const item = m.inventory[i];
    cell.classList.toggle('occupied', item !== null);
    renderItemIcon(item, cell);

    // Set up dragging if occupied
    if (item) {
      cell.setAttribute('draggable', 'true');
      cell.ondragstart = (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
          fromChar: memberIndex,
          invIndex: i
        }));
        // Optional: show ghost image or styling
        cell.style.opacity = '0.4';
      };
      cell.ondragend = () => {
        cell.style.opacity = '1';
      };
    } else {
      cell.removeAttribute('draggable');
      cell.ondragstart = null;
    }
  });

  // ── Character stats ──
  const stats = m.stats ?? {};
  ['strength', 'dexterity', 'vitality', 'intelligence', 'resilience'].forEach((key) => {
    const el = document.getElementById(`stat-${key}`);
    if (el) el.textContent = stats[key] ?? '—';
  });

  // ── Total Defence ──
  let totalDef = 0;
  // Use a Set to avoid double-counting bothHands items which are in both slots
  const countedItems = new Set();
  let hasShieldForDef = false;
  Object.values(m.equipment).forEach(item => {
    if (item && !countedItems.has(item)) {
      countedItems.add(item);
      const def = getItemDef(item.name);
      if (def?.defence) {
        totalDef += def.defence;
      }
      if (def?.weaponType === 'shield') hasShieldForDef = true;
    }
  });
  // Shield Master passive: +defenceBonus per instance when a shield is equipped
  if (hasShieldForDef && m.skills?.length) {
    m.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && skillDef.effectType === 'shieldMasterBonus') {
        totalDef += skillDef.defenceBonus ?? 0;
      }
    });
  }
  // Apply Rampart doubling if active for this member
  const rampart = skillsState.rampart;
  if (rampart.active && rampart.actorName === m.name && performance.now() < rampart.expiresAt) {
    totalDef = Math.round(totalDef * (rampart.magnitude || 2));
  }
  const defEl = document.getElementById('stat-total-defence');
  if (defEl) defEl.textContent = totalDef;

  // ── Stat bars (HP/MP/SP) ──
  const pctHelper = (val, max) => Math.max(0, Math.min(100, (val / max) * 100)).toFixed(1) + '%';

  const hpFill = document.getElementById('equip-bar-hp');
  const mpFill = document.getElementById('equip-bar-mp');
  const spFill = document.getElementById('equip-bar-sp');
  const hpVal = document.getElementById('equip-val-hp');
  const mpVal = document.getElementById('equip-val-mp');
  const spVal = document.getElementById('equip-val-sp');

  if (hpFill) hpFill.style.width = pctHelper(m.hp, m.hpMax);
  if (mpFill) mpFill.style.width = pctHelper(m.mp, m.mpMax);
  if (spFill) spFill.style.width = pctHelper(m.sp ?? 100, m.spMax ?? 100);
  if (hpVal) hpVal.textContent = `${m.hp}/${m.hpMax}`;
  if (mpVal) mpVal.textContent = `${m.mp}/${m.mpMax}`;
  if (spVal) spVal.textContent = `${m.sp ?? 100}/${m.spMax ?? 100}`;

  // ── Skills ──
  const skillsEl = document.getElementById('char-skills');
  if (skillsEl) {
    skillsEl.innerHTML = '';
    const skills = m.skills ?? [];

    const filteredSkills = skills.filter((skill) => {
      const def = getItemDef(skill.name) || (typeof SKILLS_DATA !== 'undefined' ? SKILLS_DATA[skill.name] : null);
      return _equipSkillTab === 'passive' ? (def?.isPassive === true) : (def?.isPassive !== true);
    });

    if (filteredSkills.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'skill-empty';
      empty.textContent = `No ${_equipSkillTab} skills learned.`;
      skillsEl.appendChild(empty);
    } else {
      filteredSkills.forEach((skill) => {
        const card = document.createElement('div');
        card.className = 'skill-card';
        const isEquipped = m.equipment?.skill?.name === skill.name;
        if (isEquipped) card.classList.add('skill-card--equipped');

        // Render skill icon
        renderItemIcon({ icon: skill.icon }, card);

        // Tooltip
        attachTooltipListeners(card, () => {
          const potency = _formatSkillPotency(skill.name, m);
          return {
            ...skill,
            isSkill: true,
            potency: potency
          };
        });

        // Click to equip — clicking the already-equipped skill unequips it
        card.addEventListener('click', () => {
          if (m.isDead) return;
          m.equipment.skill = isEquipped ? null : { name: skill.name, slot: 'skill', icon: skill.icon ?? null };
          renderModal(memberIndex);
          refreshPartyCards();
        });
        skillsEl.appendChild(card);
      });
    }
  }

  // Remove the spells container if it exists (from previous turn)
  const spellsContainer = document.getElementById('char-spells-container');
  if (spellsContainer) spellsContainer.remove();

  updatePartyBar(memberIndex);
}

function updatePartyBar(activeIndex) {
  const bar = document.getElementById('equip-party-bar');
  if (!bar) return;
  bar.innerHTML = '';

  // ── Portrait cluster (left) ──
  const portraits = document.createElement('div');
  portraits.id = 'equip-party-portraits';
  party.forEach((m, i) => {
    const memEl = document.createElement('div');
    memEl.className = 'equip-party-member';
    if (m.isEmpty) memEl.classList.add('empty');
    if (i === activeIndex) memEl.classList.add('active');
    memEl.title = m.isEmpty ? 'Empty Slot' : m.name;

    if (!m.isEmpty) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      drawPortrait(canvas, m);
      memEl.appendChild(canvas);

      memEl.onclick = () => {
        if (i !== activeIndex) openModal(i);
      };

      memEl.addEventListener('dragover', (e) => {
        if (i === activeIndex) return;
        e.preventDefault();
        memEl.classList.add('transfer-target');
      });
      memEl.addEventListener('dragleave', () => {
        memEl.classList.remove('transfer-target');
      });
      memEl.addEventListener('drop', (e) => {
        e.preventDefault();
        memEl.classList.remove('transfer-target');
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.fromChar === i) return;
        transferItem(data.fromChar, i, data.invIndex);
      });
    }

    portraits.appendChild(memEl);
  });
  bar.appendChild(portraits);

  // ── XP bar (right) ──
  const m = party[activeIndex];
  if (m && !m.isEmpty) {
    const xpWrap = document.createElement('div');
    xpWrap.id = 'equip-xp-wrap';

    const labelRow = document.createElement('div');
    labelRow.id = 'equip-xp-label-row';

    const nameLevel = document.createElement('span');
    nameLevel.id = 'equip-xp-name';
    const nextXP = getNextLevelXP(m);
    const currXPThreshold = getCurrentLevelThreshold(m);
    nameLevel.textContent = `${m.name}  ·  Lv.${m.level ?? 0}`;

    const xpText = document.createElement('span');
    xpText.id = 'equip-xp-text';
    if (nextXP !== null) {
      const currentProgress = (m.xp ?? 0) - currXPThreshold;
      const neededForNext = nextXP - currXPThreshold;
      xpText.textContent = `${currentProgress} / ${neededForNext} XP`;
    } else {
      xpText.textContent = `${m.xp ?? 0} XP  ·  MAX LEVEL`;
    }

    labelRow.appendChild(nameLevel);
    labelRow.appendChild(xpText);

    const track = document.createElement('div');
    track.id = 'equip-xp-bar-track';

    const fill = document.createElement('div');
    fill.id = 'equip-xp-bar-fill';
    const pct = nextXP ? Math.min(100, (((m.xp ?? 0) - currXPThreshold) / (nextXP - currXPThreshold)) * 100) : 100;
    fill.style.width = pct + '%';

    track.appendChild(fill);
    xpWrap.appendChild(labelRow);
    xpWrap.appendChild(track);
    bar.appendChild(xpWrap);
  }
}


/**
 * Moves an item from one character's inventory to another's.
 */
function transferItem(fromIdx, toIdx, invIndex) {
  const from = party[fromIdx];
  const to = party[toIdx];
  if (!from || !to || to.isEmpty) return;

  const item = from.inventory[invIndex];
  if (!item) return;

  const freePos = to.inventory.indexOf(null);
  if (freePos === -1) {
    showMessage(`${to.name}'s inventory is full!`);
    return;
  }

  // Move the item
  from.inventory[invIndex] = null;
  to.inventory[freePos] = item;

  showMessage(`${from.name} gives ${item.name} to ${to.name}.`);

  // Refresh the current view
  renderModal(activeCharIndex);
  refreshPartyCards();
}

// ─────────────────────────────────────────────
//  SKILL POTENCY FORMATTER
// ─────────────────────────────────────────────

/**
 * Returns a short, human-readable string describing the effective potency of a
 * skill for a given party member, factoring in their current stats and equipment.
 * Returns null for skills that have no meaningful magnitude (e.g. utility skills).
 */
function _formatSkillPotency(skillName, member) {
  const skillDef = SKILLS_DATA[skillName];
  if (!skillDef || (!skillDef.magnitude && !skillDef.magnitudeFormula)) return null;
  const mag = resolveSkillMagnitude(skillName, skillDef, member);
  switch (skillDef.effectType) {
    case 'partyHeal':
    case 'singleHeal':
      return `Heals ${Math.round(mag)} HP`;
    case 'damageReduction':
      return `Reduces damage by ${Math.min(Math.round(mag), 100)}%`;
    case 'damageMultiplier':
      return `+${Math.round((mag - 1) * 100)}% damage`;
    case 'spellDamageMultiplier':
      return `×${mag.toFixed(1)} spell damage`;
    case 'attackSpeedMultiplier':
      if (skillDef.effectTarget === 'monster') return `Monster attack delay ×${mag.toFixed(1)}`;
      return `Attack delay ×${mag.toFixed(2)}`;
    case 'defenceMultiplier':
      if (skillDef.effectTarget === 'self') return `+${Math.round((mag - 1) * 100)}% defence`;
      return `-${Math.round((1 - mag) * 100)}% monster defence`;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────
//  ITEM TOOLTIP
// ─────────────────────────────────────────────
const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = 14;

function positionTooltip(mouseX, mouseY, preferAbove = false) {
  const panel = document.getElementById('item-detail-panel');
  const pw = panel.offsetWidth || 190;
  const ph = panel.offsetHeight || 120;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default: place to the right of cursor
  let x = mouseX + TOOLTIP_OFFSET_X;

  // Decide vertical position based on preference or screen position
  let y;
  if (preferAbove) {
    y = mouseY - ph - TOOLTIP_OFFSET_Y;
    // If it would overflow the top, flip down
    if (y < 8) y = mouseY + TOOLTIP_OFFSET_Y;
  } else {
    y = mouseY + TOOLTIP_OFFSET_Y;
    // If it would overflow the bottom, flip up
    if (y + ph > vh - 8) y = mouseY - ph - TOOLTIP_OFFSET_Y;
  }

  // Flip left if it would overflow the right edge
  if (x + pw > vw - 8) x = mouseX - pw - TOOLTIP_OFFSET_X;

  panel.style.left = x + 'px';
  panel.style.top = y + 'px';
}

function populateTooltip(obj, showBuyPrice = false) {
  if (!obj) return;
  const isSkill = !!obj.isSkill;
  const isCustom = !!obj.isCustom;
  const isStatusEffect = !!obj.isStatusEffect;
  const nameEl = document.getElementById('item-detail-name');
  const slotEl = document.getElementById('item-detail-slot');
  const actionEl = document.getElementById('item-detail-action');
  const descEl = document.getElementById('item-detail-desc');
  const statsEl = document.getElementById('item-detail-stats');

  // Reset any inline colour override on slotEl from previous calls
  slotEl.style.color = '';

  if (obj.name === 'Gold Coins' && obj.quantity) {
    nameEl.textContent = `${obj.quantity} ${obj.name}`;
  } else {
    nameEl.textContent = obj.name;
  }

  if (isStatusEffect) {
    const isDebuff = obj.type === 'debuff';
    slotEl.textContent = isDebuff ? 'Debuff' : 'Buff';
    slotEl.style.color = isDebuff ? '#c06060' : '#60c060';
    actionEl.textContent = obj.duration ? `Duration: ${obj.duration}s` : '';
    descEl.textContent = obj.description ?? '';
    statsEl.style.display = 'none';
    return;
  }

  if (isSkill) {
    slotEl.textContent = 'Skill type: ' + (obj.type || 'Generic');
    actionEl.textContent = obj.cooldownMs ? `Cooldown: ${obj.cooldownMs / 1000}s` : '';
    descEl.textContent = obj.description;
    statsEl.style.display = obj.potency ? 'flex' : 'none';

    // Clear and show potency if applicable
    if (obj.potency) {
      statsEl.innerHTML = `
                <div class="detail-stat-row">
                    <span>Current Power</span>
                    <span style="color:#c0a0f8">${obj.potency}</span>
                </div>
            `;
    }
    return;
  }

  // ── Spells ──
  if (obj.slot === 'spell') {
    const spellDef = SPELLS.find(s => s.name === obj.name);
    const spellType = spellDef?.type ?? obj.type ?? '';
    const typeIcon = SPELL_TYPE_ICONS[spellType];
    slotEl.innerHTML = typeIcon
      ? `<span style="color:${typeIcon.color};margin-right:5px;font-size:13px">${typeIcon.symbol}</span>${spellType}`
      : spellType;
    actionEl.textContent = 'Target: ' + (spellDef?.target ?? '');
    descEl.textContent = spellDef?.description ?? obj.description ?? '';
    const rows = [];
    if (spellDef?.magnitudeFormula) rows.push(`<div class="detail-stat-row"><span>Magnitude</span><span>${spellDef.magnitudeFormula}${spellDef.magnitudeScale != null ? ' × ' + spellDef.magnitudeScale : ''}</span></div>`);
    rows.push(`<div class="detail-stat-row"><span>MP Cost</span><span>${spellDef?.mpCost ?? '?'}</span></div>`);
    statsEl.innerHTML = rows.join('');
    statsEl.style.display = 'flex';
    statsEl.style.flexDirection = 'column';
    return;
  }

  // Reset statsEl for items (since skills might have changed its innerHTML)
  statsEl.innerHTML = `
        <div class="detail-stat-row" id="detail-row-damage">
            <span>Attack Power</span>
            <span id="item-detail-damage">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-defence">
            <span>Defence</span>
            <span id="item-detail-defence">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-block">
            <span>Block</span>
            <span id="item-detail-block">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-statchange">
            <span>Stat Change</span>
            <span id="item-detail-statchange">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-scaling">
            <span>Stat Scaling</span>
            <span id="item-detail-scaling">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-ammo-mod">
            <span>Dmg Multiplier</span>
            <span id="item-detail-ammo-mod">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-ammo-type">
            <span>Damage Type</span>
            <span id="item-detail-ammo-type">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-weight">
            <span>Weight</span>
            <span id="item-detail-weight">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-value">
            <span>${showBuyPrice ? 'Buy Price' : 'Sell Value'}</span>
            <span id="item-detail-value">—</span>
        </div>
        <div id="detail-row-skillbonus" class="detail-skillbonus-list"></div>
        <div id="detail-row-onhit" class="detail-onhit-list"></div>
        <div id="detail-row-familybonus" class="detail-familybonus-list"></div>
    `;

  if (isCustom) {
    slotEl.textContent = '';
    actionEl.textContent = '';
    descEl.textContent = obj.description;
    statsEl.style.display = 'none';
    return;
  }

  statsEl.style.display = 'flex';
  const def = getItemDef(obj.name);

  // ── Potions & loot: simplified tooltip (description + value + weight only) ──
  const isConsumable = def?.type === 'potion' || def?.slot === 'loot';
  if (isConsumable) {
    slotEl.textContent = '';
    actionEl.textContent = '';
    // Show description with live effect value substituted in for potions
    let descText = def.description ?? '';
    if (def.type === 'potion' && def.effect?.value) {
      descText = descText.replace(/\d+/, def.effect.value);
    }
    descEl.textContent = descText;
    statsEl.innerHTML = `
      <div class="detail-stat-row" id="detail-row-weight">
          <span>Weight</span>
          <span id="item-detail-weight">${def.weight} kg</span>
      </div>
      <div class="detail-stat-row" id="detail-row-value">
          <span>${showBuyPrice ? 'Buy Price' : 'Sell Value'}</span>
          <span id="item-detail-value">${showBuyPrice ? def.value : Math.max(1, Math.ceil(def.value / 10))} gp</span>
      </div>
    `;
    return;
  }

  const isMainSpellbook = def?.isSpellBook === true;
  const isAmmo = (def?.slot === 'ammo') && !isMainSpellbook;
  const isSpellbook = (def?.type === 'spellbook');
  const hasDefence = !isAmmo && !isMainSpellbook && def?.defence != null && def.defence > 0;
  const hasBlock = !isAmmo && !isMainSpellbook && def?.blockChance != null && def.blockChance > 0;
  const hasScaling = !isAmmo && !isMainSpellbook && def?.statWeights != null && def?.attackType != null;
  const hasStatChange = isSpellbook && def?.requiredInt;
  const hasStatBonus = !isSpellbook && def?.statBonuses && Object.values(def.statBonuses).some(v => v !== 0);
  const hasSkillBonus = def?.skillBonuses && Object.keys(def.skillBonuses).length > 0;
  const hasSkillDurationBonus = def?.skillDurationBonusMs != null && def.skillDurationBonusMs !== 0;
  const hasTrapDisarmBonus = def?.trapDisarmBonus != null && def.trapDisarmBonus !== 0;
  const hasOnHitEffects = def?.onHitEffects && def.onHitEffects.length > 0;
  const hasFamilyBonus = def?.familyBonus && (Array.isArray(def.familyBonus) ? def.familyBonus.length > 0 : Object.keys(def.familyBonus).length > 0);
  const hasBonusList = hasStatBonus || hasSkillBonus || hasSkillDurationBonus || hasTrapDisarmBonus;

  // Hide/show rows based on item type and available stats
  document.getElementById('detail-row-damage').style.display = (isAmmo || isSpellbook || isMainSpellbook) ? 'none' : 'flex';
  document.getElementById('detail-row-defence').style.display = hasDefence ? 'flex' : 'none';
  document.getElementById('detail-row-block').style.display = hasBlock ? 'flex' : 'none';
  document.getElementById('detail-row-value').style.display = isMainSpellbook ? 'none' : 'flex';
  document.getElementById('detail-row-weight').style.display = isMainSpellbook ? 'none' : 'flex';
  document.getElementById('detail-row-statchange').style.display = hasStatChange ? 'flex' : 'none';
  document.getElementById('detail-row-skillbonus').style.display = hasBonusList ? 'flex' : 'none';
  document.getElementById('detail-row-onhit').style.display = hasOnHitEffects ? 'flex' : 'none';
  document.getElementById('detail-row-familybonus').style.display = hasFamilyBonus ? 'flex' : 'none';
  document.getElementById('detail-row-scaling').style.display = hasScaling ? 'flex' : 'none';
  document.getElementById('detail-row-ammo-mod').style.display = isAmmo ? 'flex' : 'none';
  document.getElementById('detail-row-ammo-type').style.display = isAmmo ? 'flex' : 'none';

  const slotLabelEl = document.getElementById('detail-row-statchange').querySelector('span:first-child');
  slotLabelEl.textContent = isSpellbook ? 'Requires' : 'Stat Change';

  if (def?.partyPotion) {
    slotEl.textContent = 'Party Potion';
    slotEl.style.color = '#ffd700';
  } else {
    slotEl.textContent = (isSpellbook || isMainSpellbook) ? 'Type: Spellbook' : ('Slot: ' + (SLOT_LABELS[def?.slot ?? obj.slot] ?? obj.slot));
  }

  if (isSpellbook) {
    actionEl.textContent = 'Learns: ' + (def.spellName || 'None');
  } else if (isMainSpellbook) {
    actionEl.textContent = 'Right-click to select a spell for your hands';
  } else {
    actionEl.textContent = def?.attackType ? 'Attack: ' + def.attackType.charAt(0).toUpperCase() + def.attackType.slice(1) : '';
  }

  descEl.textContent = '';

  document.getElementById('item-detail-value').textContent =
    def != null ? (showBuyPrice ? def.value : Math.max(1, Math.ceil(def.value / 10))) + ' gp' : '—';
  document.getElementById('item-detail-weight').textContent =
    def != null ? def.weight + ' kg' : '—';

  if (isAmmo) {
    document.getElementById('item-detail-ammo-mod').textContent = '×' + (def?.damageModifier ?? 1.0);
    document.getElementById('item-detail-ammo-type').textContent = (def?.damageType ?? 'normal').toUpperCase();
  } else {
    document.getElementById('item-detail-damage').textContent =
      def?.baseDamage != null ? def.baseDamage : '—';
    if (hasDefence) {
      document.getElementById('item-detail-defence').textContent = def.defence;
    }
    if (hasBlock) {
      document.getElementById('item-detail-block').textContent = def.blockChance + '%';
    }
    if (isSpellbook) {
      document.getElementById('item-detail-statchange').textContent = def.requiredInt + ' Intelligence';
      document.getElementById('item-detail-statchange').style.color = '#ff8080';
    }

    if (hasBonusList) {
      const BONUS_LABELS = { all: 'All Skills', healing: 'Healing', buff: 'Buff', debuff: 'Debuff', fire: 'Fire Magic' };
      const listEl = document.getElementById('detail-row-skillbonus');
      let html = '';

      // Stat bonuses first (green/red)
      if (hasStatBonus) {
        html += Object.entries(def.statBonuses)
          .filter(([, v]) => v !== 0)
          .map(([stat, v]) => {
            const labelMap = { hp: 'Max HP', mp: 'Max MP', sp: 'Max SP' };
            const label = labelMap[stat] ?? (stat.charAt(0).toUpperCase() + stat.slice(1));
            const color = v > 0 ? '#70c870' : '#c87070';
            const sign = v > 0 ? '+' : '';
            return `<div class="detail-skillbonus-item" style="--sb-color:${color}"><span>${label}</span><span>${sign}${v}</span></div>`;
          }).join('');
      }

      // Skill bonuses after
      if (hasSkillBonus) {
        html += Object.entries(def.skillBonuses).map(([key, val]) => {
          const label = BONUS_LABELS[key] ?? key;
          return `<div class="detail-skillbonus-item"><span>${label}</span><span>+${val}</span></div>`;
        }).join('');
      }

      // Skill duration bonus
      if (hasSkillDurationBonus) {
        const secs = def.skillDurationBonusMs / 1000;
        html += `<div class="detail-skillbonus-item"><span>Skill Duration</span><span>+${secs}s</span></div>`;
      }

      // Trap disarm bonus
      if (hasTrapDisarmBonus) {
        html += `<div class="detail-skillbonus-item"><span>Disarm Trap</span><span>+${Math.round(def.trapDisarmBonus * 100)}%</span></div>`;
      }

      listEl.innerHTML = html;
    }

    if (hasScaling) {
      const weights = def.statWeights;
      const parts = [];
      if (weights.str > 0) parts.push(`STR ${Math.round(weights.str * 100)}%`);
      if (weights.dex > 0) parts.push(`DEX ${Math.round(weights.dex * 100)}%`);
      if (weights.intelligence > 0) parts.push(`INT ${Math.round(weights.intelligence * 100)}%`);
      if (weights.vitality > 0) parts.push(`VIT ${Math.round(weights.vitality * 100)}%`);
      if (weights.resilience > 0) parts.push(`RES ${Math.round(weights.resilience * 100)}%`);
      document.getElementById('item-detail-scaling').textContent = parts.join(' · ');
    }
  }

  // Family bonus — extra damage vs a specific monster family
  if (hasFamilyBonus) {
    const listEl = document.getElementById('detail-row-familybonus');
    const entries = Array.isArray(def.familyBonus)
      ? def.familyBonus
      : Object.entries(def.familyBonus).map(([family, bonus]) => ({ family, bonus }));

    listEl.innerHTML = entries.map(({ family, bonus }) => {
      const label = family.charAt(0).toUpperCase() + family.slice(1) + 's';
      const sign = bonus >= 0 ? '+' : '';
      return `<div class="detail-familybonus-item">
        <span>vs. ${label}</span>
        <span>${sign}${bonus} dmg</span>
      </div>`;
    }).join('');
  }

  // On-hit effects apply to both weapons AND ammo
  if (hasOnHitEffects) {
    const ONHIT_OVERRIDES = {
      lifesteal: { name: 'Lifesteal', color: '#c03040' }
    };
    const listEl = document.getElementById('detail-row-onhit');
    listEl.innerHTML = def.onHitEffects.map(({ effectId, chance, amount }) => {
      const override = ONHIT_OVERRIDES[effectId];
      const effectDef = STATUS_EFFECT_DEFS[effectId];
      const name = override?.name ?? effectDef?.name ?? effectId;
      const color = override?.color ?? effectDef?.color ?? '#c8b080';
      const pct = chance != null ? Math.round(chance * 100) + '%' : '100%';
      const suffix = amount != null ? ` (${amount})` : '';
      return `<div class="detail-onhit-item" style="--onhit-color:${color}">
        <span>${name}${suffix}</span>
        <span>${pct} chance</span>
      </div>`;
    }).join('');
  }
}

export function showTooltip(item, mouseX, mouseY, preferAbove = false, showBuyPrice = false) {
  if (!item) { hideTooltip(); return; }
  populateTooltip(item, showBuyPrice);
  const panel = document.getElementById('item-detail-panel');
  panel.classList.remove('detail-hidden');
  positionTooltip(mouseX, mouseY, preferAbove);
}

export function hideTooltip() {
  document.getElementById('item-detail-panel').classList.add('detail-hidden');
}

/** Attach hover tooltip listeners to any hoverable item element.
 *  getItem() is called each time to get the current item (may change). */
export function attachTooltipListeners(el, getItem, preferAbove = false, showBuyPrice = false) {
  // Remove any existing listeners first
  if (el._tooltipCleanup) {
    el._tooltipCleanup();
    delete el._tooltipCleanup;
  }

  const onEnter = (e) => {
    const item = getItem();
    if (item) showTooltip(item, e.clientX, e.clientY, preferAbove, showBuyPrice);
  };

  const onMove = (e) => {
    const item = getItem();
    if (item) {
      // Keep tooltip populated and repositioned as cursor moves
      populateTooltip(item, showBuyPrice);
      const panel = document.getElementById('item-detail-panel');
      panel.classList.remove('detail-hidden');
      positionTooltip(e.clientX, e.clientY, preferAbove);
    } else {
      hideTooltip();
    }
  };

  const onLeave = () => hideTooltip();

  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', onLeave);

  // Store cleanup function
  el._tooltipCleanup = () => {
    el.removeEventListener('mouseenter', onEnter);
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseleave', onLeave);
  };
}

// ─────────────────────────────────────────────
//  CLICK HANDLERS
// ─────────────────────────────────────────────

/**
 * Core equip logic — moves item at invIndex from inventory into the
 * appropriate equipment slot (handles bothHands and regular slots).
 * Shared by left-click and the context menu.
 */
function _equipItem(memberIndex, invIndex) {
  const m = party[memberIndex];
  if (hasEffectFlag(m, 'preventsAction')) {
    showMessage(`${m.name} cannot change equipment!`);
    return;
  }
  let item = m.inventory[invIndex];
  if (!item) return;

  m.inventory[invIndex] = null;

  if (item.slot === 'bothHands') {
    // Spells in hands are not real inventory items — exclude from displaced count
    const displaced = [m.equipment.leftHand, m.equipment.rightHand]
      .filter((d) => d !== null && d.slot !== 'spell')
      .filter((d, idx, arr) => arr.indexOf(d) === idx);

    const freeSlots = m.inventory.filter(i => i === null).length;
    if (displaced.length > freeSlots) {
      const cell = document.querySelector(`.inv-cell[data-index="${invIndex}"]`);
      if (cell) {
        cell.style.borderColor = '#c04040';
        setTimeout(() => { cell.style.borderColor = ''; }, 400);
      }
      m.inventory[invIndex] = item;
      return;
    }

    m.equipment.leftHand = item;
    m.equipment.rightHand = item;

    displaced.forEach((d) => {
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
    });
  } else if (item.slot === 'hand') {
    // ── Either-hand items: prefer right hand, fall back to left ─────────
    const rhItem = m.equipment.rightHand;
    const lhItem = m.equipment.leftHand;
    const rightOnly = getItemDef(item.name)?.rightHandOnly ?? false;
    const leftOnly = getItemDef(item.name)?.leftHandOnly ?? false;

    let targetSlot;
    if (leftOnly) {
      targetSlot = 'leftHand';
    } else if (rightOnly) {
      targetSlot = 'rightHand';
    } else if (!rhItem || rhItem.slot === 'spell') {
      targetSlot = 'rightHand';
    } else if (!lhItem || lhItem.slot === 'spell') {
      targetSlot = 'leftHand';
    } else {
      // Both hands occupied — displace right hand
      targetSlot = 'rightHand';
    }

    const displaced = [];
    const currentlyWorn = m.equipment[targetSlot];

    // If the target slot holds a bothHands weapon, clear both slots
    if (currentlyWorn?.slot === 'bothHands') {
      displaced.push(currentlyWorn);
      const otherSlot = targetSlot === 'rightHand' ? 'leftHand' : 'rightHand';
      m.equipment[otherSlot] = null;
    } else if (currentlyWorn && currentlyWorn.slot !== 'spell') {
      displaced.push(currentlyWorn);
    }

    const freeSlots = m.inventory.filter(i => i === null).length;
    if (displaced.length > freeSlots) {
      const cell = document.querySelector(`.inv-cell[data-index="${invIndex}"]`);
      if (cell) {
        cell.style.borderColor = '#c04040';
        setTimeout(() => { cell.style.borderColor = ''; }, 400);
      }
      m.inventory[invIndex] = item;
      return;
    }

    m.equipment[targetSlot] = item;

    displaced.forEach((d) => {
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
    });
  } else if (SLOT_KEYS.includes(item.slot)) {
    // ── Smart ring-slot assignment ──────────────────────────────────────────
    // If the item targets a ring slot but that slot is already occupied and the
    // other ring slot is empty, automatically redirect to the free slot instead.
    // This lets the player fill both ring slots without needing to know slot names.
    const RING_PAIRS = { ring1: 'ring2', ring2: 'ring1' };
    if (item.slot in RING_PAIRS && m.equipment[item.slot] !== null && m.equipment[RING_PAIRS[item.slot]] === null) {
      item = { ...item, slot: RING_PAIRS[item.slot] };
    }

    const displaced = [];
    const currentlyWorn = m.equipment[item.slot];

    // Spells in hands are not real inventory items — just clear them silently.
    // Physical items that were worn go back to inventory.
    if (currentlyWorn && currentlyWorn.slot !== 'spell') {
      displaced.push(currentlyWorn);
    }

    const freeSlots = m.inventory.filter(i => i === null).length;
    if (displaced.length > freeSlots) {
      const cell = document.querySelector(`.inv-cell[data-index="${invIndex}"]`);
      if (cell) {
        cell.style.borderColor = '#c04040';
        setTimeout(() => { cell.style.borderColor = ''; }, 400);
      }
      m.inventory[invIndex] = item;
      return;
    }

    m.equipment[item.slot] = item;

    displaced.forEach((d) => {
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
    });
  } else {
    // This item is not equippable (e.g. loot, potion, or unrecognized slot).
    // Restore it to the inventory so it doesn't disappear.
    m.inventory[invIndex] = item;
    return;
  }

  updateEffectiveStats(m);
  renderModal(memberIndex);
  refreshPartyCards();
}

function _learnSpell(memberIndex, invIndex) {
  const m = party[memberIndex];
  const item = m.inventory[invIndex];
  if (!item) return;

  const def = getItemDef(item.name);
  if (!def || def.type !== 'spellbook' || !def.spellName) return;

  // Check INT requirement against effective stats
  const currentInt = m.stats?.intelligence ?? 0;
  if (currentInt < def.requiredInt) {
    showMessage(
      `${m.name} lacks the arcane intellect to decipher this scroll. ` +
      `(Requires ${def.requiredInt} Intelligence — current: ${currentInt})`
    );
    return;
  }

  // Check if the spell is already known
  m.spells = m.spells || [];
  if (m.spells.some(s => s.name === def.spellName)) {
    showMessage(`${m.name} already knows ${def.spellName}!`);
    return;
  }

  // Find the spell definition
  const spellDef = SPELLS.find(s => s.name === def.spellName);
  if (!spellDef) return;

  // Grant the spell
  m.spells.push({ name: spellDef.name, type: spellDef.type, description: spellDef.description, icon: spellDef.icon });

  // If the wizard has a Spellbook in the ammo slot and a hand is free, auto-equip the spell
  const hasSpellbook = m.equipment?.ammo && getItemDef(m.equipment.ammo.name)?.isSpellBook;
  if (hasSpellbook) {
    if (!m.equipment.rightHand) {
      m.equipment.rightHand = { name: spellDef.name, slot: 'spell' };
    } else if (!m.equipment.leftHand) {
      m.equipment.leftHand = { name: spellDef.name, slot: 'spell' };
    }
  }

  // Consume the scroll
  m.inventory[invIndex] = null;

  playSkillSound('magic');
  showMessage(`${m.name} learns ${def.spellName}!`);

  renderModal(memberIndex);
  refreshPartyCards();

  showInlineHelp('first-spell-learned', {
    text: 'Right click your character\'s <strong>Spellbook</strong> in the equipment panel to manage equipped spells.'
  });
}

/**
 * Moves the item in inventory slot `invIndex` into the member's quickslot `slotIdx`.
 * If the slot is already occupied, the old item is returned to the first free inventory slot.
 */
function _assignQuickslot(memberIndex, slotIdx, invIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;
  const item = m.inventory[invIndex];
  if (!item) return;
  if (!m.quickslots) m.quickslots = [null];
  const displaced = m.quickslots[slotIdx];
  m.quickslots[slotIdx] = item;
  m.inventory[invIndex] = displaced;
  showMessage(`${item.name} assigned to Quick Slot ${slotIdx + 1}.`);
  renderModal(memberIndex);
  refreshPartyCards();
}

/**
 * Uses the potion (or other consumable) assigned to a party member's quickslot.
 * Searches the member's inventory for the first matching item, applies its effect
 * and removes it. If none found the quickslot is cleared and the player is notified.
 */
export function useQuickslotPotion(memberIndex, slotIdx) {
  const m = party[memberIndex];
  if (!m || m.isEmpty || m.isDead) return;
  if (hasEffectFlag(m, 'preventsAction')) {
    showMessage(`${m.name} cannot use items!`);
    return;
  }
  if (!m.quickslots) m.quickslots = [null];
  const item = m.quickslots[slotIdx];
  if (!item) return;

  const itemDef = getItemDef(item.name);
  // Using a non-party potion is an action — breaks Unseen
  if (!itemDef?.partyPotion) {
    breakPartyUnseen(`${m.name} uses an item — the cloak of shadow disperses!`);
  }
  if (_applyPotionEffect(m, item)) {
    m.quickslots[slotIdx] = null;
  }
  refreshPartyCards();
}

// ─────────────────────────────────────────────
//  LOADOUT ROTATE
// ─────────────────────────────────────────────

/**
 * Rotates all four loadout slots simultaneously (left hand, right hand, potion, skill).
 * Active ↔ Loadout B. All four swap together — you cannot rotate just one slot.
 */
export function rotateLoadout(memberIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty || m.isDead) return;
  if (!m.loadoutB) m.loadoutB = { leftHand: null, rightHand: null, skill: null };

  const activeLeft = m.equipment.leftHand;
  const isActiveBothHands = activeLeft?.slot === 'bothHands';
  // For bothHands, rightHand is just a mirror — don't save it separately into loadoutB
  const activeRight = isActiveBothHands ? null : m.equipment.rightHand;
  const activeSkill = m.equipment.skill ?? null;

  const newLeft = m.loadoutB.leftHand ?? null;
  const newRight = m.loadoutB.rightHand ?? null;
  const newSkill = m.loadoutB.skill ?? null;

  // Apply new active loadout
  m.equipment.leftHand = newLeft;
  if (newLeft?.slot === 'bothHands') {
    m.equipment.rightHand = newLeft; // mirror both-hands weapon
  } else {
    m.equipment.rightHand = newRight;
  }
  m.equipment.skill = newSkill;

  // Store old active into loadout B
  m.loadoutB.leftHand = activeLeft ?? null;
  m.loadoutB.rightHand = activeRight ?? null;
  m.loadoutB.skill = activeSkill;

  updateEffectiveStats(m);
  refreshPartyCards();
}

/**
 * Assigns the item at invIndex directly to the loadout B left hand slot.
 */
function _assignLoadoutBLeft(memberIndex, invIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;
  if (!m.loadoutB) m.loadoutB = { leftHand: null, rightHand: null, skill: null };
  const item = m.inventory[invIndex];
  if (!item) return;
  const def = getItemDef(item.name);
  const slot = def?.slot ?? 'hand';
  if ((slot === 'hand' && !def?.rightHandOnly) || slot === 'bothHands') {
    const displaced = m.loadoutB.leftHand;
    const itemObj = { name: item.name, slot };
    // For bothHands items also clear B rightHand since mirror will be set on rotate
    if (slot === 'bothHands') {
      m.loadoutB.rightHand = null;
    }
    m.loadoutB.leftHand = itemObj;
    m.inventory[invIndex] = displaced;
    showMessage(`${item.name} assigned to Loadout B left hand.`);
    renderModal(memberIndex);
    refreshPartyCards();
  }
}

/**
 * Assigns the item at invIndex directly to the loadout B right hand slot.
 */
function _assignLoadoutBRight(memberIndex, invIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;
  if (!m.loadoutB) m.loadoutB = { leftHand: null, rightHand: null, skill: null };
  const item = m.inventory[invIndex];
  if (!item) return;
  const def = getItemDef(item.name);
  const slot = def?.slot ?? 'hand';
  if (slot === 'hand' && !def?.leftHandOnly) {
    const displaced = m.loadoutB.rightHand;
    m.loadoutB.rightHand = { name: item.name, slot };
    m.inventory[invIndex] = displaced;
    showMessage(`${item.name} assigned to Loadout B right hand.`);
    renderModal(memberIndex);
    refreshPartyCards();
  }
}

/**
 * Assigns the potion at invIndex to the loadout B potion slot.
 */
function _assignLoadoutBPotion(memberIndex, invIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;
  if (!m.loadoutB) m.loadoutB = { leftHand: null, rightHand: null, skill: null };
  const item = m.inventory[invIndex];
  if (!item) return;
  const displaced = m.loadoutB.potion;
  m.loadoutB.potion = { name: item.name, slot: 'quickslot' };
  m.inventory[invIndex] = displaced;
  showMessage(`${item.name} assigned to Loadout B potion slot.`);
  renderModal(memberIndex);
  refreshPartyCards();
}

/**
 * Assigns the skill at invIndex to the loadout B skill slot.
 */
function _assignLoadoutBSkill(memberIndex, invIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;
  if (!m.loadoutB) m.loadoutB = { leftHand: null, rightHand: null, skill: null };
  const item = m.inventory[invIndex];
  if (!item) return;
  const def = getItemDef(item.name);
  if (def?.slot !== 'skill') return;
  const displaced = m.loadoutB.skill;
  m.loadoutB.skill = { name: item.name, slot: 'skill', type: def.type, delay: (def.cooldownMs ?? 0) / 1000 };
  m.inventory[invIndex] = displaced;
  showMessage(`${item.name} assigned to Loadout B skill slot.`);
  renderModal(memberIndex);
  refreshPartyCards();
}

function _applyPotionEffect(m, item) {
  const def = getItemDef(item.name);
  if (!def || def.type !== 'potion') return false;

  // ── Party potions affect all members, not just the user ──────────────────
  if (def.partyPotion) {
    return _applyPartyPotionEffect(m, item, def);
  }

  const effects = [];
  if (def.effect) effects.push(def.effect);
  if (def.effect2) effects.push(def.effect2);
  if (def.effect3) effects.push(def.effect3);

  if (effects.length === 0) return false;

  const results = [];
  let mainSound = 'heal';

  effects.forEach(eff => {
    const { type, value } = eff;
    switch (type) {
      case 'heal':
      case 'restore-hp': {
        const oldHp = m.hp;
        const newHp = Math.min(m.hpMax, m.hp + (value || 0));
        setHp(m.id, newHp);
        results.push(`${newHp - oldHp} HP`);
        mainSound = 'heal';
        break;
      }
      case 'restore-mp': {
        const oldMp = m.mp;
        const newMp = Math.min(m.mpMax, m.mp + (value || 0));
        setMp(m.id, newMp);
        results.push(`${newMp - oldMp} MP`);
        mainSound = 'magic';
        break;
      }
      case 'restore-sp': {
        const oldSp = m.sp;
        const newSp = Math.min(m.spMax ?? 100, m.sp + (value || 0));
        setSp(m.id, newSp);
        results.push(`${newSp - oldSp} SP`);
        mainSound = 'magic';
        break;
      }
      case 'cure-poison': {
        const hadPoison = (m.activeDebuffs || []).some(d => d.effectId === 'poison');
        m.activeDebuffs = (m.activeDebuffs || []).filter(d => d.effectId !== 'poison');
        results.push(hadPoison ? 'is cured of poison' : 'feels refreshed');
        mainSound = 'cure';
        break;
      }
    }
  });

  if (results.length === 0) return false;

  const msg = results.some(r => r.includes('HP') || r.includes('MP') || r.includes('SP'))
    ? `restores ${results.join(' and ')}`
    : results.join(' and ');

  showMessage(`${m.name} drinks ${item.name} and ${msg}.`);
  addLogEntry({
    time: Date.now(),
    type: 'potion',
    actor: m.name,
    itemName: item.name,
    description: msg,
  });
  playItemSound(item.name, 'potion');
  return true;
}

/**
 * Applies a party-wide potion effect (e.g. Invincibility, Unseen).
 * Applies the status effect to every alive party member simultaneously.
 */
function _applyPartyPotionEffect(m, item, def) {
  const eff = def.effect;
  if (!eff) return false;

  const effectType = eff.type; // 'invincibility' | 'unseen'
  const duration = eff.duration ?? 60;

  // Apply the status effect to all alive party members
  party.forEach(member => {
    if (member.isEmpty || member.isDead) return;
    applyStatusEffect(member.id, effectType, null, duration);
  });

  let message = '';
  if (effectType === 'invincibility') {
    message = `${m.name} raises the <b>${item.name}</b> — the entire party glows with golden light! No damage for ${duration}s!`;
  } else if (effectType === 'unseen') {
    message = `${m.name} uncorks the <b>${item.name}</b> — shadows swallow the party! Unseen for ${duration}s (broken by action)!`;
  } else {
    message = `${m.name} uses ${item.name} for the party!`;
  }

  showMessage(message);
  addLogEntry({
    time: Date.now(),
    type: 'potion',
    actor: m.name,
    itemName: item.name,
    description: effectType,
  });
  playItemSound(item.name, 'potion');
  return true;
}

function _usePotion(memberIndex, invIndex) {
  const m = party[memberIndex];
  if (m.isDead) return;
  if (hasEffectFlag(m, 'preventsAction')) {
    showMessage(`${m.name} cannot use items!`);
    return;
  }
  const item = m.inventory[invIndex];
  if (!item) return;
  if (!_applyPotionEffect(m, item)) return;

  // Consume the potion
  m.inventory[invIndex] = null;

  renderModal(memberIndex);
  refreshPartyCards();
}

/**
 * Left-click: equip immediately.
 * Shift+click: quick-give to the next party member.
 * Right-click: handled separately by onInventoryCellContextMenu.
 */
function onInventoryCellClick(e) {
  if (activeCharIndex === null) return;
  const invIndex = Number(e.currentTarget.dataset.index);
  const m = party[activeCharIndex];
  if (m.isDead) return;
  const item = m.inventory[invIndex];
  if (!item) return;

  // If the Alchemy Workshop is open, clicking a loot item sends it there immediately.
  if (isAlchemyModalOpen()) {
    const def = getItemDef(item.name);
    if (def?.slot === 'loot') {
      if (addItemToAlchemy(item.name)) {
        m.inventory[invIndex] = null;
        renderModal(activeCharIndex);
      }
      return;
    }
  }

  // Shift + Click = Quick Giving to next member (original shortcut kept)
  if (e.shiftKey) {
    let nextIdx = (activeCharIndex + 1) % 4;
    let attempts = 0;
    while (party[nextIdx].isEmpty && attempts < 4) {
      nextIdx = (nextIdx + 1) % 4;
      attempts++;
    }
    if (nextIdx !== activeCharIndex) {
      transferItem(activeCharIndex, nextIdx, invIndex);
    }
    return;
  }

  const def = getItemDef(item.name);

  if (def?.type && QUICKSLOT_TYPES.includes(def.type)) {
    // Potions stay in inventory — equip them via an action slot (left-click an empty slot on the party panel).
    showMessage(`${item.name} — equip via an action slot on the party panel.`);
    return;
  }

  if (item.name === 'Gold Coins') {
    const goldVal = def?.value ?? 0;
    addGold(goldVal);
    showMessage(`Collected ${goldVal} Gold Coins.`);
    m.inventory[invIndex] = null;
    renderModal(activeCharIndex);
    return;
  }

  _equipItem(activeCharIndex, invIndex);
}

/** Right-click on an inventory cell → open the context menu. */
function onInventoryCellContextMenu(e) {
  if (activeCharIndex === null) return;
  const invIndex = Number(e.currentTarget.dataset.index);
  const m = party[activeCharIndex];
  if (m.isDead) return;
  if (!m.inventory[invIndex]) return;   // empty cell — no menu

  e.preventDefault();
  hideTooltip();
  _showContextMenu(e.clientX, e.clientY, invIndex);
}

// ─────────────────────────────────────────────
//  CONTEXT MENU
// ─────────────────────────────────────────────

function _showContextMenu(cursorX, cursorY, invIndex) {
  _ctxInvIndex = invIndex;

  const menu = document.getElementById('inv-context-menu');
  const giveList = document.getElementById('inv-ctx-give-list');
  const giveLabel = document.getElementById('inv-ctx-give-label');

  // ── Equip button ──
  const useBtn = document.getElementById('inv-ctx-use');
  const equipBtn = document.getElementById('inv-ctx-equip');
  const learnBtn = document.getElementById('inv-ctx-learn');
  const readBtn = document.getElementById('inv-ctx-read');
  const m = party[activeCharIndex];
  const item = m.inventory[invIndex];
  const def = item ? getItemDef(item.name) : null;

  // ── Drop button (all inventory items) ──
  const dropBtn = document.getElementById('inv-ctx-drop');
  const alchemyBtn = document.getElementById('inv-ctx-alchemy'); // We need to add this to the HTML

  // Reset all buttons
  if (useBtn) useBtn.style.display = 'none';
  equipBtn.style.display = 'none';
  learnBtn.style.display = 'none';
  if (readBtn) readBtn.style.display = 'none';
  if (dropBtn) dropBtn.style.display = 'none';

  // ── Loadout B equip buttons ──
  const lbLeftBtn = document.getElementById('inv-ctx-equip-lb-left');
  const lbRightBtn = document.getElementById('inv-ctx-equip-lb-right');
  const lbSkillBtn = document.getElementById('inv-ctx-skill-b');
  if (lbLeftBtn) lbLeftBtn.style.display = 'none';
  if (lbRightBtn) lbRightBtn.style.display = 'none';
  if (lbSkillBtn) lbSkillBtn.style.display = 'none';



  // ── Drop button — available for all inventory items ──
  if (dropBtn && item) {
    dropBtn.style.display = 'block';
    dropBtn.onclick = () => {
      _showDropConfirm(activeCharIndex, _ctxInvIndex, item.name);
      _hideContextMenu();
    };
  }

  if (def?.type === 'potion') {
    if (useBtn) {
      useBtn.style.display = 'block';
      useBtn.onclick = () => {
        _usePotion(activeCharIndex, _ctxInvIndex);
        _hideContextMenu();
      };
    }
  } else if (def?.type === 'parchment') {
    if (readBtn) {
      readBtn.style.display = 'block';
      readBtn.onclick = () => {
        _readParchment(activeCharIndex, _ctxInvIndex, def);
        _hideContextMenu();
      };
    }
  } else if (def?.type === 'spellbook') {
    learnBtn.style.display = 'block';
    learnBtn.onclick = () => {
      _learnSpell(activeCharIndex, _ctxInvIndex);
      _hideContextMenu();
    };
  } else if (def?.slot === 'skill') {
    equipBtn.style.display = 'block';
    equipBtn.onclick = () => {
      _equipItem(activeCharIndex, _ctxInvIndex);
      _hideContextMenu();
    };
    if (lbSkillBtn) {
      lbSkillBtn.style.display = 'block';
      lbSkillBtn.onclick = () => {
        _assignLoadoutBSkill(activeCharIndex, _ctxInvIndex);
        _hideContextMenu();
      };
    }
  } else if (def?.slot && def.slot !== 'loot' && def.slot !== 'skill' && def.slot !== 'spell' && def.type !== 'spellbook') {
    equipBtn.style.display = 'block';
    equipBtn.onclick = () => {
      _equipItem(activeCharIndex, _ctxInvIndex);
      _hideContextMenu();
    };
    // Show B-slot options for hand items
    const handSlots = ['hand', 'bothHands'];
    if (handSlots.includes(def.slot)) {
      if (lbLeftBtn && !def.rightHandOnly && !def.leftHandOnly) {
        lbLeftBtn.style.display = 'block';
        lbLeftBtn.onclick = () => {
          _assignLoadoutBLeft(activeCharIndex, _ctxInvIndex);
          _hideContextMenu();
        };
      }
      if (lbRightBtn && def.slot !== 'bothHands' && !def.leftHandOnly) {
        lbRightBtn.style.display = 'block';
        lbRightBtn.onclick = () => {
          _assignLoadoutBRight(activeCharIndex, _ctxInvIndex);
          _hideContextMenu();
        };
      }
    }
  } else {
    equipBtn.style.display = 'block';
    equipBtn.onclick = () => {
      _equipItem(activeCharIndex, _ctxInvIndex);
      _hideContextMenu();
    };
  }

  // ── Alchemy Workshop button ──
  if (alchemyBtn) {
    if (isAlchemyModalOpen() && def?.slot === 'loot') {
      alchemyBtn.style.display = 'block';
      alchemyBtn.onclick = () => {
        const m = party[activeCharIndex];
        const item = m.inventory[_ctxInvIndex];
        if (item) {
          if (addItemToAlchemy(item.name)) {
            m.inventory[_ctxInvIndex] = null;
            renderModal(activeCharIndex);
          }
        }
        _hideContextMenu();
      };
    } else {
      alchemyBtn.style.display = 'none';
    }
  }

  // ── Give-to list ──
  giveList.innerHTML = '';
  const targets = party.filter((p, i) => i !== activeCharIndex && !p.isEmpty);

  if (targets.length === 0) {
    giveLabel.style.display = 'none';
    const none = document.createElement('div');
    none.className = 'inv-ctx-no-targets';
    none.textContent = 'No other party members';
    giveList.appendChild(none);
  } else {
    giveLabel.style.display = '';
    targets.forEach((target) => {
      const targetIdx = party.indexOf(target);
      const row = document.createElement('div');
      row.className = 'inv-ctx-give-item';

      // Small portrait
      const canvas = document.createElement('canvas');
      canvas.width = 26;
      canvas.height = 26;
      drawPortrait(canvas, target);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = target.name;

      row.appendChild(canvas);
      row.appendChild(nameSpan);
      row.addEventListener('click', () => {
        transferItem(activeCharIndex, targetIdx, _ctxInvIndex);
        _hideContextMenu();
      });
      giveList.appendChild(row);
    });
  }

  // ── Position near cursor, flip if near viewport edges ──
  menu.classList.remove('inv-ctx-hidden');
  const mw = menu.offsetWidth || 180;
  const mh = menu.offsetHeight || 130;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = cursorX + 6;
  let y = cursorY + 4;
  if (x + mw > vw - 8) x = cursorX - mw - 6;
  if (y + mh > vh - 8) y = cursorY - mh - 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function _hideContextMenu() {
  document.getElementById('inv-context-menu').classList.add('inv-ctx-hidden');
  _ctxInvIndex = null;
}

// ─────────────────────────────────────────────
//  SKILL / SPELL SWITCH MENU
// ─────────────────────────────────────────────

function _showSkillSwitchMenu(x, y, memberIndex, mode, hand = null) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;

  let items;
  if (mode === 'unified') {
    // Combined list: non-passive skills + all spells
    const skills = (m.skills || []).filter(s => !SKILLS_DATA[s.name]?.isPassive);
    const spells = m.spells || [];
    items = [...skills, ...spells];
  } else if (mode === 'skill') {
    items = (m.skills || []).filter(s => !SKILLS_DATA[s.name]?.isPassive);
  } else {
    items = m.spells || [];
  }

  const targetSlot = hand ?? 'skill';
  const occupied = hand ? !!m.equipment?.[targetSlot] : false;
  // Show menu only if there are items to switch to, or if slot is occupied (for Clear Slot)
  if (!items.length && !occupied) return;

  _skillSwMenuCtx = { memberIndex, mode, hand };

  const menu = document.getElementById('skill-switch-menu');
  menu.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'skill-sw-header';
  header.textContent = mode === 'unified' ? 'Equip Skill / Spell' : (mode === 'skill' ? 'Switch Skill' : 'Switch Spell');
  menu.appendChild(header);

  // Clear Slot option — shown when the slot has something in it
  if (occupied) {
    const clearRow = document.createElement('div');
    clearRow.className = 'skill-sw-item skill-sw-clear';
    const clearSpan = document.createElement('span');
    clearSpan.textContent = '✕  Clear Slot';
    clearRow.appendChild(clearSpan);
    clearRow.addEventListener('click', () => {
      const ctx = _skillSwMenuCtx;
      if (!ctx) return;
      const member = party[ctx.memberIndex];
      if (!member) return;
      const slot = ctx.hand ?? 'skill';
      const existing = member.equipment[slot];
      if (existing) {
        // If it's a potion, return to inventory
        if (getItemDef(existing.name)?.type === 'potion') {
          const freeSlot = member.inventory.indexOf(null);
          if (freeSlot !== -1) {
            member.inventory[freeSlot] = existing;
            showMessage(`${existing.name} returned to inventory.`);
          } else {
            showMessage('Inventory full — cannot clear slot!');
            _hideSkillSwitchMenu();
            return;
          }
        }
        member.equipment[slot] = null;
        refreshPartyCards();
      }
      _hideSkillSwitchMenu();
    });
    menu.appendChild(clearRow);
    if (items.length) {
      const div = document.createElement('div');
      div.className = 'skill-sw-divider';
      menu.appendChild(div);
    }
  }

  const currentName = (mode === 'unified' || mode === 'skill')
    ? m.equipment?.[targetSlot]?.name
    : (hand ? m.equipment?.[hand]?.name : null);

  items.forEach(item => {
    const isActive = item.name === currentName;
    const row = document.createElement('div');
    row.className = 'skill-sw-item' + (isActive ? ' skill-sw-active' : '');

    if (item.icon) {
      const img = document.createElement('img');
      img.src = asset(item.icon);
      img.alt = item.name;
      row.appendChild(img);
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.name;
    row.appendChild(nameSpan);

    if (isActive) {
      const check = document.createElement('span');
      check.className = 'skill-sw-check';
      check.textContent = '✓';
      row.appendChild(check);
    }

    row.addEventListener('click', () => {
      if (mode === 'unified') {
        const isSpell = m.spells?.some(s => s.name === item.name);
        const slot = _skillSwMenuCtx.hand ?? 'skill';
        // If replacing a potion, return it to inventory first
        const prev = m.equipment[slot];
        if (prev && getItemDef(prev.name)?.type === 'potion') {
          const freeSlot = m.inventory.indexOf(null);
          if (freeSlot !== -1) m.inventory[freeSlot] = prev;
        }
        m.equipment[slot] = isSpell
          ? { name: item.name, slot: 'spell' }
          : { name: item.name, slot: 'skill', icon: item.icon };
        if (isSpell) playItemSound('spell-assigned');
      } else if (mode === 'skill') {
        const slot = _skillSwMenuCtx.hand ?? 'skill';
        m.equipment[slot] = { name: item.name, slot: 'skill', icon: item.icon };
      } else {
        // Equip the selected spell directly into the hand that was right-clicked
        const targetHand = _skillSwMenuCtx.hand;
        if (targetHand && m.equipment) {
          m.equipment[targetHand] = { name: item.name, slot: 'spell' };
          playItemSound('spell-assigned');
        }
      }
      refreshPartyCards();
      _hideSkillSwitchMenu();
    });

    menu.appendChild(row);
  });

  // Show then position (needs to be visible to measure size)
  menu.classList.remove('skill-sw-hidden');
  const menuRect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 8;
  if (top + menuRect.height > window.innerHeight) top = window.innerHeight - menuRect.height - 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function _hideSkillSwitchMenu() {
  document.getElementById('skill-switch-menu').classList.add('skill-sw-hidden');
  _skillSwMenuCtx = null;
}

// Clicking a body slot with an item → move it to first free inventory cell
// For bothHands items, both hand slots are cleared with one inventory entry.
function onPaperdollSlotClick(e) {
  if (activeCharIndex === null) return;
  const key = e.currentTarget.dataset.slot;
  const m = party[activeCharIndex];
  if (m.isDead) return;
  const item = m.equipment[key];
  if (!item) return; // empty slot — nothing to do

  // Spells are learned abilities placed in hands — clear the slot without returning to inventory
  if (item.slot === 'spell') {
    m.equipment[key] = null;
    updateEffectiveStats(m);
    renderModal(activeCharIndex);
    return;
  }

  // Skills are learned abilities, not carried items — just clear the slot
  if (key === 'skill') {
    m.equipment.skill = null;
    renderModal(activeCharIndex);
    refreshPartyCards();
    return;
  }

  const displaced = [item];
  let otherSlotCleared = null;

  if (item.slot === 'bothHands') {
    otherSlotCleared = key === 'leftHand' ? 'rightHand' : 'leftHand';
  }

  const freeSlots = m.inventory.filter(i => i === null).length;
  if (displaced.length > freeSlots) {
    e.currentTarget.style.borderColor = '#c04040';
    setTimeout(() => { e.currentTarget.style.borderColor = ''; }, 400);
    return;
  }

  if (otherSlotCleared) m.equipment[otherSlotCleared] = null;
  m.equipment[key] = null;

  displaced.forEach(d => {
    const fi = m.inventory.indexOf(null);
    if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
  });

  updateEffectiveStats(m);
  renderModal(activeCharIndex);
}

function onPaperdollSlotContextMenu(e) {
  if (activeCharIndex === null) return;
  const key = e.currentTarget.dataset.slot;
  const m = party[activeCharIndex];
  const item = m.equipment[key];
  if (!item) return;

  const def = getItemDef(item.name);
  if (key === 'ammo' && def?.isSpellBook) {
    e.preventDefault();
    hideTooltip();
    _openSpellSelectionModal(activeCharIndex);
  }
}

// ─────────────────────────────────────────────
//  OPEN / CLOSE
// ─────────────────────────────────────────────
function openModal(memberIndex) {
  // Close char-dev if it's open — never show both modals simultaneously
  if (activeCharDevIndex !== null) closeCharDevModal();
  activeCharIndex = memberIndex;
  hideTooltip();
  document.getElementById('equip-overlay').classList.remove('equip-hidden');
  renderModal(memberIndex);

  showInlineHelp('first-inventory-open', {
    text: '<strong>Left click</strong> items to equip or unequip them. <strong>Right click</strong> items for further actions such as drink or learn.'
  });
}

function closeModal() {
  hideTooltip();
  document.getElementById('equip-overlay').classList.add('equip-hidden');
  document.getElementById('spell-selection-overlay').classList.add('spell-sel-hidden');
  activeCharIndex = null;
  // Sync party card HUD to reflect any equipment changes (weapons, torch, etc.)
  refreshPartyCards();

}

// ─────────────────────────────────────────────
//  DROP CONFIRMATION
// ─────────────────────────────────────────────
let _dropPendingCharIndex = null;
let _dropPendingInvIndex = null;

function _showDropConfirm(charIndex, invIndex, itemName) {
  _dropPendingCharIndex = charIndex;
  _dropPendingInvIndex = invIndex;
  document.getElementById('drop-confirm-item-name').textContent = itemName;
  document.getElementById('drop-confirm-overlay').classList.remove('chest-hidden');
}

function _hideDropConfirm() {
  document.getElementById('drop-confirm-overlay').classList.add('chest-hidden');
  _dropPendingCharIndex = null;
  _dropPendingInvIndex = null;
}

function _confirmDrop() {
  if (_dropPendingCharIndex === null || _dropPendingInvIndex === null) return;
  const dropItem = party[_dropPendingCharIndex]?.inventory[_dropPendingInvIndex];
  if (dropItem) {
    party[_dropPendingCharIndex].inventory[_dropPendingInvIndex] = null;
    addLogEntry({ type: 'item', subtype: 'drop', itemName: dropItem.name, time: Date.now() });
    showMessage(`Dropped ${dropItem.name}.`);
    renderModal(_dropPendingCharIndex);
  }
  _hideDropConfirm();
}

// ─────────────────────────────────────────────
//  CHARACTER DEVELOPMENT MODAL
// ─────────────────────────────────────────────
export function openCharDevModal(memberIndex) {
  // Close inventory if it's open — never show both modals simultaneously
  if (activeCharIndex !== null) closeModal();
  activeCharDevIndex = memberIndex;
  hideTooltip();
  document.getElementById('char-dev-overlay').classList.remove('char-dev-hidden');
  renderCharDevModal(memberIndex);
}

export function closeCharDevModal() {
  hideTooltip();
  document.getElementById('char-dev-overlay').classList.add('char-dev-hidden');
  activeCharDevIndex = null;
  refreshPartyCards();
}

function renderCharDevModal(memberIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;

  // Reset detail panel to blank state when switching members
  const detailName = document.getElementById('cd-detail-name');
  const detailAction = document.getElementById('cd-detail-action');
  const detailDesc = document.getElementById('cd-detail-desc');
  const detailPotency = document.getElementById('cd-detail-potency');
  if (detailName) detailName.textContent = 'Select a node';
  if (detailAction) detailAction.textContent = '';
  if (detailDesc) detailDesc.textContent = '';
  if (detailPotency) detailPotency.textContent = '';
  _setDetailIcon(null);

  // Portrait in the identity card
  const portraitCanvas = document.getElementById('cd-char-portrait');
  if (portraitCanvas) drawPortrait(portraitCanvas, m);


  const nameEl = document.getElementById('char-dev-char-name');
  if (nameEl) nameEl.textContent = m.name;

  // ── Prev/Next button state — disable if only one party member ──
  const nonEmpty = party.filter(p => !p.isEmpty).length;
  const prevBtn = document.getElementById('char-dev-prev');
  const nextBtn = document.getElementById('char-dev-next');
  if (prevBtn) prevBtn.disabled = nonEmpty <= 1;
  if (nextBtn) nextBtn.disabled = nonEmpty <= 1;

  // ── Level label (left panel identity card) ──
  const levelLabel = document.getElementById('cd-level-label');
  if (levelLabel) levelLabel.textContent = `Level ${m.level ?? 0}`;


  const pending = (m.pendingNodePicks ?? 0) > 0;

  // ── Pending node picks indicator ──
  const pointsRow = document.getElementById('cd-stat-points-row');
  if (pointsRow) {
    pointsRow.style.display = pending ? '' : 'none';
    const pointsEl = document.getElementById('cd-stat-points-remaining');
    if (pointsEl) {
      const picks = m.pendingNodePicks ?? 0;
      pointsEl.textContent = picks === 1 ? '1 node pick available' : `${picks} node picks available`;
    }
  }

  // ── Render Stat values (read-only) ──
  const base = m.baseStats ?? m.stats ?? {};
  const bonuses = m.statBonuses ?? {};
  ['strength', 'dexterity', 'vitality', 'intelligence', 'resilience'].forEach(key => {
    const valEl = document.getElementById(`cd-stat-${key}`);
    const totalVal = (base[key] ?? 0) + (bonuses[key] ?? 0);
    if (valEl) valEl.textContent = totalVal;
  });

  // ── Render Learned Skills (all skills, single row, newest on left) ──
  const cdSkillsEl = document.getElementById('cd-char-skills');
  if (cdSkillsEl) {
    cdSkillsEl.innerHTML = '';
    const skills = m.skills ?? [];

    if (skills.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'skill-empty';
      empty.textContent = 'No skills learned yet.';
      cdSkillsEl.appendChild(empty);
    } else {
      skills.forEach(skill => {
        const card = document.createElement('div');
        card.className = 'skill-card skill-card--learned';
        renderItemIcon(skill, card);
        attachTooltipListeners(card, () => {
          const potency = _formatSkillPotency(skill.name, m);
          return { ...skill, isSkill: true, potency };
        }, true);
        card.addEventListener('click', () => _showSkillDetail(skill, m, card));
        cdSkillsEl.appendChild(card);
      });
    }
  }

  // ── Skill Tree ──
  const treeContainer = document.getElementById('cd-skill-tree-container');
  if (treeContainer) {
    renderSkillTree(m, treeContainer, (node) => {
      _showNodeDetail(node, m);
      // Update confirm button state
      const confirmBtn = document.getElementById('char-dev-confirm');
      if (confirmBtn && pending) {
        confirmBtn.disabled = !m.pendingNodeChoice;
        confirmBtn.title = m.pendingNodeChoice ? '' : 'Select a node first';
      }
    });
  }

  // ── Confirm footer: visible only in level-up mode ──
  const footer = document.getElementById('char-dev-footer');
  const confirmBtn = document.getElementById('char-dev-confirm');
  if (footer) footer.style.display = pending ? 'flex' : 'none';
  if (confirmBtn && pending) {
    confirmBtn.disabled = !m.pendingNodeChoice;
    confirmBtn.title = m.pendingNodeChoice ? '' : 'Select a node first';
  }
}

function _setDetailIcon(iconPath, textFallback = '') {
  const el = document.getElementById('cd-detail-icon');
  if (!el) return;
  el.innerHTML = '';
  if (iconPath) {
    const img = document.createElement('img');
    img.src = asset(iconPath);
    img.alt = '';
    el.appendChild(img);
    el.classList.add('has-icon');
  } else if (textFallback) {
    el.textContent = textFallback;
    el.classList.add('has-icon');
  } else {
    el.classList.remove('has-icon');
  }
  // Show/hide the separator based on whether there will be body text
  // (caller updates desc/potency after this, so just ensure sep is visible when icon shown)
  const sep = document.getElementById('cd-detail-sep');
  if (sep) sep.classList.toggle('hidden', !iconPath && !textFallback);
}

function _showSkillDetail(skill, m, cardEl = null) {
  document.getElementById('cd-detail-name').textContent = skill.name;
  const def = getItemDef(skill.name) || SKILLS_DATA[skill.name];
  document.getElementById('cd-detail-action').textContent = (def?.isPassive ? 'Passive' : 'Action') + ' Skill';
  document.getElementById('cd-detail-desc').textContent = def?.description || '';

  const pot = _formatSkillPotency(skill.name, m);
  document.getElementById('cd-detail-potency').innerHTML = pot ? (Array.isArray(pot) ? pot.join('<br>') : pot) : '';

  _setDetailIcon(def?.icon ?? null);

  document.querySelectorAll('#cd-char-skills .skill-card, #cd-available-skills .skill-card').forEach(c => c.classList.remove('skill-card--detail-selected'));
  if (cardEl) cardEl.classList.add('skill-card--detail-selected');
}

function _showNodeDetail(node, m) {
  document.getElementById('cd-detail-name').textContent = node.label;
  if (node.type === 'start') {
    document.getElementById('cd-detail-action').textContent = 'Starting Node';
    document.getElementById('cd-detail-desc').textContent = 'Your journey begins here.';
    document.getElementById('cd-detail-potency').textContent = '';
    _setDetailIcon(null, '★');
  } else if (node.type === 'stat') {
    document.getElementById('cd-detail-action').textContent = 'Stat Bonus';
    const desc = Object.entries(node.benefit)
      .map(([stat, val]) => `+${val} ${stat.charAt(0).toUpperCase() + stat.slice(1)}`)
      .join(', ');
    document.getElementById('cd-detail-desc').textContent = desc;
    document.getElementById('cd-detail-potency').textContent = '';
    // Icon: use explicit node.icon, or derive from benefit stats
    const statKeys = Object.keys(node.benefit);
    const derivedIcon = node.icon
      ?? (statKeys.length > 1
        ? '/skills/stats-increase/mixed_stat_increase.webp'
        : `/skills/stats-increase/${statKeys[0]}_increase.webp`);
    _setDetailIcon(derivedIcon);
  } else if (node.type === 'skill') {
    const skillName = node.benefit.skill;
    const def = SKILLS_DATA[skillName];
    document.getElementById('cd-detail-action').textContent = (def?.isPassive ? 'Passive' : 'Action') + ' Skill';
    document.getElementById('cd-detail-desc').textContent = def?.description || '';
    const pot = _formatSkillPotency(skillName, m);
    document.getElementById('cd-detail-potency').innerHTML = pot ? (Array.isArray(pot) ? pot.join('<br>') : pot) : '';
    _setDetailIcon(node.icon ?? def?.icon ?? null);
  }
}

// ─────────────────────────────────────────────
//  SPELLBOOK MODAL
// ─────────────────────────────────────────────

const _SB_SPELL_SLOTS = ['leftHand', 'rightHand', 'skill', 'skill2', 'skill3', 'skill4', 'skill5', 'skill6'];

const _SB_SLOT_LABELS = {
  leftHand: 'Left Hand', rightHand: 'Right Hand',
  skill: 'Slot I', skill2: 'Slot II', skill3: 'Slot III',
  skill4: 'Slot IV', skill5: 'Slot V', skill6: 'Slot VI',
};

const _SB_TYPE_LABELS = {
  'direct-damage': 'Direct Damage', 'healing': 'Healing',
  'buff': 'Buff', 'debuff-cure': 'Cure', 'aoe-debuff': 'AoE Debuff',
};

const _SB_TARGET_LABELS = {
  monster: 'Single Enemy', 'monsters-aoe': 'All Nearby', 'monsters-line': 'Line',
  'party-member': 'Party Member', party: 'Entire Party',
};

let _sbCharIndex = null;
let _sbSelectedSpell = null;

function _openSpellSelectionModal(charIndex) {
  _sbCharIndex = charIndex;
  _sbSelectedSpell = null;
  playItemSound('scroll');

  const overlay = document.getElementById('spell-selection-overlay');
  overlay.classList.remove('spell-sel-hidden');

  const m = party[charIndex];
  _sbBuildRibbon(m);
  _sbRefreshSlots(m);
  document.getElementById('sb-slots-hint').textContent = 'Select a spell on the left, then click a slot to assign it.';
  document.getElementById('sb-slots-hint').classList.remove('sb-slots-hint--active');
  _sbSetSlotsSelectable(false);

  // Auto-select the first spell tab
  const firstTab = document.querySelector('#sb-ribbon .sb-ribbon-icon');
  if (firstTab) firstTab.click();
}

function _sbBuildRibbon(m) {
  const ribbon = document.getElementById('sb-ribbon');
  ribbon.innerHTML = '';
  const learnedSpells = m.spells || [];

  if (learnedSpells.length === 0) {
    ribbon.innerHTML = '<div class="sb-ribbon-empty">No spells learned — study spell scrolls.</div>';
    return;
  }

  // Group spells by type, preserving a defined order
  const TYPE_ORDER = ['direct-damage', 'aoe-debuff', 'healing', 'buff', 'debuff-cure'];
  const groups = {};
  learnedSpells.forEach(spell => {
    const spellDef = SPELLS.find(s => s.name === spell.name);
    if (!spellDef) return;
    const t = spellDef.type || 'other';
    if (!groups[t]) groups[t] = [];
    groups[t].push(spellDef);
  });

  const orderedTypes = [
    ...TYPE_ORDER.filter(t => groups[t]),
    ...Object.keys(groups).filter(t => !TYPE_ORDER.includes(t)),
  ];

  orderedTypes.forEach(type => {
    const spells = groups[type];
    const typeInfo = SPELL_TYPE_ICONS[type];

    const group = document.createElement('div');
    group.className = 'sb-tab-group';

    // Category marker tab
    const catTab = document.createElement('div');
    catTab.className = 'sb-tab-group-marker';
    catTab.title = _SB_TYPE_LABELS[type] || type;
    catTab.style.color = typeInfo?.color || '#8a6040';
    catTab.textContent = typeInfo?.symbol || '?';
    group.appendChild(catTab);

    spells.forEach(spellDef => {
      const icon = document.createElement('div');
      icon.className = 'sb-ribbon-icon';
      icon.dataset.spellName = spellDef.name;
      icon.innerHTML = `<img src="${asset(spellDef.icon)}" alt="${spellDef.name}" />`;
      icon.title = spellDef.name;

      const isEquipped = _SB_SPELL_SLOTS.some(k => m.equipment?.[k]?.name === spellDef.name);
      if (isEquipped) icon.classList.add('sb-ribbon-icon--equipped');

      icon.addEventListener('click', () => {
        ribbon.querySelectorAll('.sb-ribbon-icon').forEach(el => el.classList.remove('sb-ribbon-icon--selected'));
        icon.classList.add('sb-ribbon-icon--selected');
        _sbSelectedSpell = spellDef;
        _sbRenderDetail(spellDef, m);
        _sbSetSlotsSelectable(true);
        const hint = document.getElementById('sb-slots-hint');
        hint.textContent = `Click a slot on the right to assign ${spellDef.name}.`;
        hint.classList.add('sb-slots-hint--active');
        playItemSound('scroll');
      });

      group.appendChild(icon);
    });

    ribbon.appendChild(group);
  });
}

function _sbRenderDetail(spellDef, m) {
  const detail = document.getElementById('sb-detail');
  const typeLabel = _SB_TYPE_LABELS[spellDef.type] || spellDef.type;
  const typeIcon = SPELL_TYPE_ICONS[spellDef.type];

  let statsHtml = `
    <div class="sb-stat">
      <span class="sb-stat-label">MP Cost</span>
      <span class="sb-stat-val sb-stat-val--mp">${spellDef.mpCost}</span>
    </div>
    <div class="sb-stat">
      <span class="sb-stat-label">Target</span>
      <span class="sb-stat-val">${_SB_TARGET_LABELS[spellDef.target] || spellDef.target}</span>
    </div>
    <div class="sb-stat">
      <span class="sb-stat-label">Delay</span>
      <span class="sb-stat-val">${spellDef.delay}s</span>
    </div>`;

  if (spellDef.element) {
    statsHtml += `<div class="sb-stat"><span class="sb-stat-label">Element</span><span class="sb-stat-val sb-stat-val--element">${spellDef.element}</span></div>`;
  }

  if (spellDef.magnitudeFormula && spellDef.magnitudeScale) {
    const statName = spellDef.magnitudeFormula.charAt(0).toUpperCase() + spellDef.magnitudeFormula.slice(1);
    const currentStat = m.effectiveStats?.[spellDef.magnitudeFormula] ?? m.stats?.[spellDef.magnitudeFormula] ?? 0;
    const approx = Math.round(currentStat * spellDef.magnitudeScale);
    statsHtml += `<div class="sb-stat">
      <span class="sb-stat-label">Power Formula</span>
      <span class="sb-stat-val">${statName} × ${spellDef.magnitudeScale} ≈ ${approx}</span>
    </div>`;
  }

  detail.innerHTML = `
    <div class="sb-detail-content">
      <div class="sb-detail-header">
        <img class="sb-detail-icon" src="${asset(spellDef.icon)}" alt="${spellDef.name}" />
        <div class="sb-detail-name-area">
          <div class="sb-detail-name">${spellDef.name}</div>
          <span class="sb-detail-type sb-detail-type--${spellDef.type}">${typeIcon ? `<span class="sb-type-icon" style="color:${typeIcon.color}">${typeIcon.symbol}</span> ` : ''}${typeLabel}</span>
          <div class="sb-detail-desc">${spellDef.description}</div>
        </div>
      </div>
      <div class="sb-detail-stats">${statsHtml}</div>
    </div>`;
}

function _sbRefreshSlots(m) {
  _SB_SPELL_SLOTS.forEach(slotKey => {
    const slotEl = document.getElementById(`sb-slot-${slotKey}`);
    if (!slotEl) return;
    const item = m.equipment?.[slotKey] ?? null;

    // Icon
    const iconWrap = slotEl.querySelector('.sb-slot-icon-wrap');
    if (iconWrap) {
      let iconSrc = null;
      if (item) {
        const spellDef = SPELLS.find(s => s.name === item.name);
        const itemDef = spellDef || (item.name ? getItemDef(item.name) : null);
        iconSrc = itemDef?.icon ?? null;
      }
      iconWrap.innerHTML = iconSrc
        ? `<img src="${asset(iconSrc)}" alt="${item.name}" />`
        : '';
    }

    // Item name label
    const nameLabel = slotEl.querySelector('.sb-slot-item-name');
    if (nameLabel) nameLabel.textContent = item?.name ?? '—';

    slotEl.classList.toggle('sb-slot--has-spell', item?.slot === 'spell');
    slotEl.classList.toggle('sb-slot--has-item', !!item && item.slot !== 'spell');
  });
}

function _sbRefreshRibbonDots(m, ribbon) {
  ribbon.querySelectorAll('.sb-ribbon-icon[data-spell-name]').forEach(iconEl => {
    const isEquipped = _SB_SPELL_SLOTS.some(k => m.equipment?.[k]?.name === iconEl.dataset.spellName);
    iconEl.classList.toggle('sb-ribbon-icon--equipped', isEquipped);
  });
}

function _sbSetSlotsSelectable(on) {
  _SB_SPELL_SLOTS.forEach(slotKey => {
    const el = document.getElementById(`sb-slot-${slotKey}`);
    if (el) el.classList.toggle('sb-slot--selectable', on);
  });
}

// Slot click delegation (single listener on the overlay)
document.getElementById('spell-selection-overlay').addEventListener('click', (e) => {
  // Close on backdrop click
  if (e.target.id === 'spell-selection-overlay') {
    e.target.classList.add('spell-sel-hidden');
    return;
  }

  // Slot assignment
  const slotEl = e.target.closest('[data-equip-slot]');
  if (slotEl && _sbSelectedSpell && _sbCharIndex !== null) {
    const m = party[_sbCharIndex];
    const slotKey = slotEl.dataset.equipSlot;
    m.equipment[slotKey] = { name: _sbSelectedSpell.name, slot: 'spell' };
    updateEffectiveStats(m);
    _sbRefreshSlots(m);
    _sbRefreshRibbonDots(m, document.getElementById('sb-ribbon'));
    playItemSound('spell-assigned');
    refreshPartyCards();
    const hint = document.getElementById('sb-slots-hint');
    hint.textContent = `${_sbSelectedSpell.name} assigned to ${_SB_SLOT_LABELS[slotKey]}.`;
  }
});

document.getElementById('spell-sel-close').addEventListener('click', () => {
  playItemSound('scroll');
  document.getElementById('spell-selection-overlay').classList.add('spell-sel-hidden');
  if (_sbCharIndex !== null) renderModal(_sbCharIndex);
  refreshPartyCards();
});

// ─────────────────────────────────────────────────────────────────────────────
//  PARTY MEMBER TARGET PICKER
//  Shown when a spell with target: 'party-member' is activated.
//  Renders a small portrait + name button for each living party member, then
//  dispatches execution once the player clicks one (or cancel to abort).
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('party-target-close').addEventListener('click', _closePartyTargetPicker);
document.getElementById('party-target-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'party-target-overlay') _closePartyTargetPicker();
});

function _closePartyTargetPicker() {
  document.getElementById('party-target-overlay').classList.add('party-target-hidden');
}

function _openPartyTargetPicker(caster, casterIndex, hand, spellDef) {
  const overlay = document.getElementById('party-target-overlay');
  const grid = document.getElementById('party-target-grid');
  const title = document.getElementById('party-target-title');

  title.textContent = `${spellDef.name} — Choose Target`;
  grid.innerHTML = '';

  party.forEach(m => {
    if (m.isEmpty) return;

    const btn = document.createElement('button');
    btn.className = 'party-target-btn' + (m.isDead ? ' party-target-btn--dead' : '');
    btn.disabled = m.isDead;

    // Mini portrait canvas
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    canvas.className = 'party-target-portrait';
    drawPortrait(canvas, m);

    // Poisoned indicator
    const isPoisoned = m.activeDebuffs?.some(
      d => d.effectId === 'poison' && performance.now() < d.expiresAt
    );

    const info = document.createElement('div');
    info.className = 'party-target-info';

    const label = document.createElement('span');
    label.className = 'party-target-name';
    label.innerHTML = m.name + (isPoisoned ? ' <span class="party-target-poisoned">☠ Poisoned</span>' : '');

    // HP, MP, SP bars
    const bars = document.createElement('div');
    bars.className = 'party-target-bars';

    const hpTrack = document.createElement('div');
    hpTrack.className = 'bar-track';
    const hpFill = document.createElement('div');
    hpFill.className = 'bar-fill bar-hp';
    hpFill.style.width = Math.max(0, Math.min(100, (m.hp / (m.hpMax || 100)) * 100)) + '%';
    hpTrack.appendChild(hpFill);

    const mpTrack = document.createElement('div');
    mpTrack.className = 'bar-track';
    const mpFill = document.createElement('div');
    mpFill.className = 'bar-fill bar-mp';
    mpFill.style.width = Math.max(0, Math.min(100, (m.mp / (m.mpMax || 100)) * 100)) + '%';
    mpTrack.appendChild(mpFill);

    const spTrack = document.createElement('div');
    spTrack.className = 'bar-track';
    const spFill = document.createElement('div');
    spFill.className = 'bar-fill bar-sp';
    spFill.style.width = Math.max(0, Math.min(100, ((m.sp ?? 100) / (m.spMax || 100)) * 100)) + '%';
    spTrack.appendChild(spFill);

    bars.appendChild(hpTrack);
    bars.appendChild(mpTrack);
    bars.appendChild(spTrack);

    info.appendChild(label);
    info.appendChild(bars);

    btn.appendChild(canvas);
    btn.appendChild(info);

    btn.addEventListener('click', () => {
      _closePartyTargetPicker();
      _executePartyMemberSpell(caster, casterIndex, hand, spellDef, m);
    });

    grid.appendChild(btn);
  });

  overlay.classList.remove('party-target-hidden');
}

/** Dispatcher for party-wide spells — no target picker, applies to all living members. */
function _executePartySpell(caster, casterIndex, hand, spellDef) {
  if (caster.mp < spellDef.mpCost) {
    showMessage(`${caster.name} does not have enough mana!`);
    return;
  }
  setMp(caster.id, caster.mp - spellDef.mpCost);

  const isSkillHand = hand.startsWith('skill');
  const isSpellSlot = !isSkillHand && spellDef.slot === 'spell';
  const baseKey = isSkillHand ? `${casterIndex}-skill-${spellDef.name}` : `${casterIndex}-${hand}`;
  const timeKey = isSpellSlot ? `${baseKey}-${spellDef.name}` : baseKey;
  lastAttackTimes[timeKey] = performance.now();

  if (isSkillHand) {
    const cd = (spellDef.delay ?? 15) * 1000;
    _startSkillCooldownUI(casterIndex, performance.now() + cd, hand);
  }

  refreshPartyCards();
  playAction(spellDef.attackType, hand, casterIndex);
  _dispatchSpellVFX(spellDef.attackType);

  if (spellDef.attackType === ACTIONS.RESIST_POISON) {
    _executeResistPoison(caster, spellDef);
  }
}

function _executeResistPoison(caster) {
  const targets = party.filter(m => !m.isEmpty && !m.isDead);
  targets.forEach(m => applyStatusEffect(m.id, 'resist-poison'));

  showMessage(`${caster.name} casts <b>Resist Poison</b> — the party is protected!`, 2500);

  targets.forEach(m => {
    addLogEntry({
      time: Date.now(),
      type: 'skill',
      actor: caster.name,
      skillName: 'Resist Poison',
      target: m.name,
    });
  });

  refreshPartyCards();
}

/**
 * Dispatcher for AoE debuff spells that target nearby monsters (e.g. Sleep).
 * Finds all alive monsters within 1 grid square of the player and applies the
 * status effect from spellDef.attackType to each, gated by a resilience-based
 * resistance roll using spellDef.hitChance.
 */
function _executeAoEDebuffSpell(caster, casterIndex, hand, spellDef) {
  if (caster.mp < spellDef.mpCost) {
    showMessage(`${caster.name} does not have enough mana!`);
    return;
  }
  setMp(caster.id, caster.mp - spellDef.mpCost);

  const isSkillHand = hand.startsWith('skill');
  const isSpellSlot = !isSkillHand && spellDef.slot === 'spell';
  const baseKey = isSkillHand ? `${casterIndex}-skill-${spellDef.name}` : `${casterIndex}-${hand}`;
  const timeKey = isSpellSlot ? `${baseKey}-${spellDef.name}` : baseKey;
  lastAttackTimes[timeKey] = performance.now();

  if (isSkillHand) {
    const cd = (spellDef.delay ?? 15) * 1000;
    _startSkillCooldownUI(casterIndex, performance.now() + cd, hand);
  }

  refreshPartyCards();
  playAction(spellDef.attackType, hand, casterIndex);
  _dispatchSpellVFX(spellDef.attackType);

  // Determine the status effect to apply (same as the spell's attackType, e.g. 'sleep')
  const effectId = spellDef.attackType;
  const duration = spellDef.statusDuration ?? null; // null → use status-effects.json default

  // Collect all alive monsters within 1 grid square of the player
  const aoeTargets = monsters.filter(m =>
    m.alive &&
    Math.abs(m.gridRow - player.gridRow) <= 1 &&
    Math.abs(m.gridCol - player.gridCol) <= 1
  );

  if (aoeTargets.length === 0) {
    showMessage(`${caster.name} casts <b>${spellDef.name}</b> — but there are no nearby targets!`, 2000);
    return;
  }

  let hitCount = 0;
  aoeTargets.forEach(target => {
    const chance = calcOnHitChance(spellDef.hitChance ?? 0.65, target.stats?.resilience ?? 0, null, effectId);
    if (Math.random() < chance) {
      applyMonsterStatusEffect(target.id, effectId, caster.name, duration);
      hitCount++;
    }
  });

  const total = aoeTargets.length;
  let outcomeMsg, logTarget;
  if (hitCount === 0) {
    outcomeMsg = `${caster.name} casts <b>${spellDef.name}</b> — all monsters resist!`;
    logTarget = `no monsters (all resisted)`;
  } else if (hitCount === total) {
    outcomeMsg = `${caster.name} casts <b>${spellDef.name}</b> — ${hitCount} monster${hitCount > 1 ? 's fall' : ' falls'} into slumber!`;
    logTarget = `all ${total} monster${total > 1 ? 's' : ''}`;
  } else {
    outcomeMsg = `${caster.name} casts <b>${spellDef.name}</b> — ${hitCount} of ${total} monsters succumb!`;
    logTarget = `${hitCount} of ${total} monsters`;
  }

  showMessage(outcomeMsg, 2500);
  addLogEntry({ time: Date.now(), type: 'skill', actor: caster.name, skillName: spellDef.name, target: logTarget });
}

/** Dispatcher for line-of-sight AoE spells (e.g. Incinerate). */
function _executeLineSpell(caster, casterIndex, hand, spellDef) {
  if (caster.mp < spellDef.mpCost) {
    showMessage(`${caster.name} does not have enough mana!`);
    return;
  }
  setMp(caster.id, caster.mp - spellDef.mpCost);

  const isSkillHand = hand.startsWith('skill');
  const isSpellSlot = !isSkillHand && spellDef.slot === 'spell';
  const baseKey = isSkillHand ? `${casterIndex}-skill-${spellDef.name}` : `${casterIndex}-${hand}`;
  const timeKey = isSpellSlot ? `${baseKey}-${spellDef.name}` : baseKey;
  lastAttackTimes[timeKey] = performance.now();

  if (isSkillHand) {
    const cd = (spellDef.delay ?? 15) * 1000;
    _startSkillCooldownUI(casterIndex, performance.now() + cd, hand);
  }

  refreshPartyCards();
  breakPartyUnseen(`${caster.name} attacks — the cloak of shadow disperses!`);

  playAction(spellDef.attackType, hand, casterIndex);
  _dispatchSpellVFX(spellDef.attackType);

  const maxRange = spellDef.range ?? 1;
  const hits = spellDef.hits ?? 2;
  const durationSec = spellDef.durationSec ?? 2;
  const intervalMs = (durationSec * 1000) / hits;

  let currentHit = 0;
  function triggerDamageHit() {
    if (currentHit >= hits) return;

    // Find monsters currently in the line (it might change each tick if they move)
    const targets = monsters.filter(m => m.alive && isInFrontOfPlayer(m.gridRow, m.gridCol, maxRange));

    targets.forEach(target => {
      // Use attackMonster, passing spellDef as the faux weaponDef to carry the damage formula
      const result = attackMonster(target.id, caster, spellDef, spellDef.attackType);

      addLogEntry({
        time: Date.now(), actor: 'player', attacker: caster.name, target: result.monsterName || target.name,
        attackType: spellDef.attackType, hitChance: result.hitChance ?? 0, hit: result.hit, crit: result.crit,
        weaponBase: result.formula?.weaponBase ?? 0, statBonus: result.formula?.statBonus ?? 0,
        statLabel: result.formula?.statLabel ?? 'STR', mitigation: result.formula?.mitigation ?? 0,
        preCritDamage: result.formula?.preCritDamage ?? 0, finalDamage: result.damage,
        critMultiplier: result.formula?.critMultiplier ?? 1,
      });
      _logAppliedEffects(caster.name, result.monsterName || target.name, result.stunned, result.appliedEffects);
    });

    currentHit++;
    if (currentHit < hits) setTimeout(triggerDamageHit, intervalMs);
  }

  triggerDamageHit();
}

/** Dispatcher for party-member targeted spells — routes to the correct handler. */
function _executePartyMemberSpell(caster, casterIndex, hand, spellDef, target) {
  // MP check (deducted here, after the player has confirmed their target choice)
  if (caster.mp < spellDef.mpCost) {
    showMessage(`${caster.name} does not have enough mana!`);
    return;
  }
  setMp(caster.id, caster.mp - spellDef.mpCost);

  // Record cooldown so the slot greys out normally.
  // Spells include the spell name so switching spells in the same hand doesn't
  // inherit the previous spell's cooldown.
  const isSkillHand = hand.startsWith('skill');
  const isSpellSlot = !isSkillHand && spellDef.slot === 'spell';
  const baseKey = isSkillHand ? `${casterIndex}-skill-${spellDef.name}` : `${casterIndex}-${hand}`;
  const timeKey = isSpellSlot ? `${baseKey}-${spellDef.name}` : baseKey;
  lastAttackTimes[timeKey] = performance.now();

  if (isSkillHand) {
    const cd = (spellDef.delay ?? 15) * 1000;
    const ends = performance.now() + cd;
    if (spellDef.name === 'Heal') _healSkillCooldownEnds[casterIndex] = ends;
    _startSkillCooldownUI(casterIndex, ends, hand);
  }

  refreshPartyCards();

  // Play the spell animation
  playAction(spellDef.attackType, hand, casterIndex);
  _dispatchSpellVFX(spellDef.attackType);

  if (spellDef.attackType === ACTIONS.CURE_POISON) {
    _executeCurePoison(caster, target);
  } else if (spellDef.attackType === ACTIONS.HEAL) {
    _executeHeal(caster, spellDef, target);
  } else if (spellDef.attackType === ACTIONS.REJUVENATE) {
    _executeRejuvenate(caster, spellDef, target);
  } else if (spellDef.attackType === ACTIONS.REGENERATE) {
    _executeRegenerate(caster, spellDef, target);
  }
}

function _executeRejuvenate(caster, spellDef, target) {
  const amount = Math.floor(resolveSpellMagnitude('Rejuvenate', spellDef, caster));
  const oldSp = target.sp;
  setSp(target.id, target.sp + amount);
  const actualHeal = target.sp - oldSp;

  showMessage(`${caster.name} casts <b>Rejuvenate</b> on ${target.name} — restored ${actualHeal} SP!`, 2500);

  addLogEntry({
    time: Date.now(),
    type: 'skill',
    actor: caster.name,
    skillName: 'Rejuvenate',
    target: target.name,
    finalDamage: -actualHeal
  });

  refreshPartyCards();
}

function _executeRegenerate(caster, spellDef, target) {
  const amount = resolveSpellMagnitude('Regeneration', spellDef, caster);

  applyStatusEffect(target.id, 'regeneration', -amount); // negative for healing

  showMessage(`${caster.name} casts <b>Regeneration</b> on ${target.name}!`, 2500);

  addLogEntry({
    time: Date.now(),
    type: 'skill',
    actor: caster.name,
    skillName: 'Regeneration',
    target: target.name,
  });

  refreshPartyCards();
}

function _executeHeal(caster, spellDef, target) {
  const amount = Math.floor(resolveSpellMagnitude('Heal', spellDef, caster));
  const oldHp = target.hp;
  setHp(target.id, target.hp + amount);
  const actualHeal = target.hp - oldHp;

  showMessage(`${caster.name} casts <b>Heal</b> on ${target.name} — restored ${actualHeal} HP!`, 2500);

  addLogEntry({
    time: Date.now(),
    type: 'skill',
    actor: caster.name,
    skillName: 'Heal',
    target: target.name,
    finalDamage: -actualHeal // healing is negative damage in logs usually or just descriptive
  });

  refreshPartyCards();
}

function _executeCurePoison(caster, target) {
  const hadPoison = target.activeDebuffs?.some(
    d => d.effectId === 'poison' && performance.now() < d.expiresAt
  );

  let amount = 0;
  if (caster.skills) {
    caster.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      if (name === 'Lifewarden') {
        const skillDef = SKILLS_DATA['Lifewarden'];
        amount += (skillDef?.magnitude ?? 1);
      }
    });
  }

  if (amount > 0) {
    setHp(target.id, target.hp + amount);
  }

  // Strip all poison stacks from the target
  if (target.activeDebuffs) {
    target.activeDebuffs = target.activeDebuffs.filter(d => d.effectId !== 'poison');
  }

  let msg = hadPoison
    ? `${caster.name} casts <b>Cure Poison</b> on ${target.name} — venom purged!`
    : `${caster.name} casts <b>Cure Poison</b> on ${target.name}.`;

  if (amount > 0) {
    msg += ` Restored ${amount} HP!`;
  }

  showMessage(msg, 2500);

  addLogEntry({
    time: Date.now(),
    type: 'skill',
    actor: caster.name,
    skillName: 'Cure Poison',
    target: target.name,
    finalDamage: amount > 0 ? -amount : 0
  });

  refreshPartyCards();
}

// ─────────────────────────────────────────────
//  USE HAND  — triggered from party panel
// ─────────────────────────────────────────────
/**
 * Called when a player clicks a hand slot on the party panel during dungeon view.
 * Looks up the item in that slot, plays the action animation, and applies
 * damage to the nearest living monster.
 *
 * Damage formula:  baseDamage + hero.stats.strength - monster.defence
 *
 * @param {number} memberIndex  — 0-3
 * @param {'left'|'right'} hand
 */
function _showDamagePopup(slotEl, damage, isCrit) {
  const popup = document.createElement('span');
  popup.className = 'damage-popup' + (isCrit ? ' damage-popup--crit' : '');
  popup.textContent = `-${damage}`;
  slotEl.appendChild(popup);
  setTimeout(() => popup.remove(), 900);
}

/** Returns the alive monster closest to the player along the forward ray, up to maxRange cells. */
function _closestMonsterInFront(maxRange) {
  const inFront = monsters.filter(t => t.alive && isInFrontOfPlayer(t.gridRow, t.gridCol, maxRange));
  if (inFront.length === 0) return null;
  return inFront.reduce((best, t) => {
    const td = Math.abs(t.gridRow - player.gridRow) + Math.abs(t.gridCol - player.gridCol);
    const bd = Math.abs(best.gridRow - player.gridRow) + Math.abs(best.gridCol - player.gridCol);
    return td < bd ? t : best;
  });
}

/**
 * Logs separate status-effect entries for effects applied to a monster by an
 * attack (stun from shield-bash, poison from weapon on-hit, etc.).
 * These go to the Effects tab in the battle log.
 */
function _logAppliedEffects(attackerName, targetName, stunned, appliedEffects) {
  if (stunned) {
    addLogEntry({
      time: Date.now(),
      type: 'status-effect',
      actor: 'player',
      attacker: attackerName,
      target: targetName,
      effectId: 'stunned',
      effectName: 'Stun',
    });
  }
  (appliedEffects ?? []).forEach(effectId => {
    if (effectId === 'lifesteal') return; // lifesteal is not a debuff to show
    const def = STATUS_EFFECT_DEFS[effectId];
    addLogEntry({
      time: Date.now(),
      type: 'status-effect',
      actor: 'player',
      attacker: attackerName,
      target: targetName,
      effectId,
      effectName: def?.name ?? effectId,
      effectColor: def?.color ?? null,
    });
  });
}

export function useHand(memberIndex, hand, silent = false) {
  const m = party[memberIndex];
  if (!m) return;
  if (hasEffectFlag(m, 'preventsAction')) {
    if (!silent) showMessage(`${m.name} cannot act!`);
    return;
  }

  const isSkillSlotHand = hand === 'skill' || hand === 'skill2' || hand === 'skill3' || hand === 'skill4' || hand === 'skill5' || hand === 'skill6';
  const slotKeyMap = { left: 'leftHand', right: 'rightHand', skill: 'skill', skill2: 'skill2', skill3: 'skill3', skill4: 'skill4', skill5: 'skill5', skill6: 'skill6' };
  const slotKey = slotKeyMap[hand] ?? 'leftHand';
  const item = m.equipment?.[slotKey];

  const def = item ? getItemDef(item.name) : null;

  // Empty hand → punch; items with no attackType (e.g. Shield) → no action
  // Skill slots with empty item show "nothing equipped" message (handled in useSkillSlot)
  const attackType = item ? (def?.attackType ?? null) : (isSkillSlotHand ? null : ACTIONS.PUNCH);
  if (!attackType) return;

  // Cooldown validation
  const isBothHands = !isSkillSlotHand && def?.slot === 'bothHands';
  let delaySec = def?.delay ?? 2;

  // Whirlwind buff: double attack speed (half delay)
  const ww = skillsState.whirlwind;
  if (ww.active && ww.actorName === m.name && performance.now() < ww.expiresAt) {
    delaySec *= skillsState.whirlwind.magnitude;
  }

  // War Dance buff: boost attack speed for the whole party
  const wd = skillsState.warDance;
  if (wd.active && performance.now() < wd.expiresAt) {
    delaySec *= skillsState.warDance.magnitude;
  }

  // Status effect attack speed penalty (e.g. Slow debuff)
  delaySec *= getAttackSpeedMultiplier(m);

  // Check cooldown timer
  // A 'bothHands' weapon is driven by the left or right hand click but acts as
  // one cooldown, we only care about its primary slot timer (left).
  // Spells include the spell name in the key so switching spells in the same
  // hand slot doesn't inherit the previous spell's cooldown.
  // Skill slot spells all share a per-spell key regardless of which skill slot.
  const isSpellSlot = def?.slot === 'spell';
  const baseKey = isBothHands ? `${memberIndex}-left`
    : isSkillSlotHand ? `${memberIndex}-skill`
    : `${memberIndex}-${hand}`;
  const timeKey = isSpellSlot ? `${baseKey}-${item.name}` : baseKey;
  const now = performance.now();
  if (lastAttackTimes[timeKey]) {
    if (now - lastAttackTimes[timeKey] < delaySec * 1000) {
      return; // Attempted to attack while on cooldown
    }
  }

  // Dead members cannot act.
  if (m.isDead) return;

  // Spells that target a single party member need a target picker before executing.
  // We intercept here — after cooldown/dead checks — but before the monster-targeting path.
  // Skip during auto-attack (silent mode) — these require manual targeting.
  if (def?.target === 'party-member') {
    if (!silent) _openPartyTargetPicker(m, memberIndex, hand, def);
    return;
  }

  // Spells that target the whole party execute immediately without a target picker.
  if (def?.target === 'party') {
    _executePartySpell(m, memberIndex, hand, def);
    return;
  }

  // AoE debuff spells targeting nearby monsters (e.g. Sleep).
  if (def?.target === 'monsters-aoe') {
    _executeAoEDebuffSpell(m, memberIndex, hand, def);
    return;
  }

  // Line-of-sight AoE spells (e.g. Incinerate).
  if (def?.target === 'monsters-line') {
    _executeLineSpell(m, memberIndex, hand, def);
    return;
  }

  const isRanged = attackType === ACTIONS.SHOOT || attackType === ACTIONS.FIREBALL || attackType === ACTIONS.BANISHMENT || attackType === 'incinerate';
  const isBuff = attackType === ACTIONS.REGENERATE;

  // Back-row members can only melee if their front partner is dead (stepped up).
  // canMelee() centralises this logic — see combat-rules.js.
  if (!isRanged && !isBuff && !canMelee(party, memberIndex)) {
    if (!silent) showMessage(`${m.name} is in the back row — only ranged attacks can reach the enemy!`);
    return;
  }

  // Ammo requirement check for bows and crossbows
  if (def?.weaponType === 'bow' || def?.weaponType === 'crossbow') {
    const ammoItem = m.equipment?.ammo;
    const ammoDef = ammoItem ? getItemDef(ammoItem.name) : null;
    if (def.weaponType === 'bow') {
      if (!ammoDef || ammoDef.ammoType !== 'arrow') {
        if (!silent) showMessage(`${m.name} needs arrows equipped to use the ${def.name}!`);
        return;
      }
    } else if (def.weaponType === 'crossbow') {
      if (!ammoDef || ammoDef.ammoType !== 'bolt') {
        if (!silent) showMessage(`${m.name} needs bolts equipped to use the ${def.name}!`);
        return;
      }
    }
  }

  const maxRange = isRanged ? 4 : 1;

  // Find the alive monster closest to the player that is directly in front
  const target = isBuff ? null : _closestMonsterInFront(maxRange);

  // Set the cooldown timer and force HUD re-render.
  // If `bothHands` weapon (e.g., Greatsword), set the cooldown for left hand, 
  // which is correctly polled by both HUD visual slots.

  // Apply mana cost if applicable
  const mpCost = def?.mpCost ?? 0;
  const isSpell = mpCost > 0; // spells / fireballs cost mana, not stamina
  if (isSpell) {
    if (m.mp < mpCost) {
      if (!silent) showMessage(`${m.name} does not have enough mana!`);
      return;
    }
    setMp(m.id, m.mp - mpCost);
  }

  // Physical attacks cost 5 SP per staminaDrain level; spells and skills do not
  // Whirlwind / War Dance buff: also prevents SP drain
  let spCost = 5 * (def?.staminaDrain ?? 1);

  // Apply Conservator passive reductions (15% per node, stacks additively up to 45%)
  if (!isSpell && def?.weaponType && m.skills?.length) {
    let reduction = 0;
    for (const skill of m.skills) {
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && skillDef.effectType === 'weaponStaminaReduction' && skillDef.weaponType === def.weaponType) {
        reduction += skillDef.magnitude || 0;
      }
    }
    if (reduction > 0) spCost = Math.max(0, spCost * (1 - reduction));
  }

  const wwActive = ww.active && ww.actorName === m.name && now < ww.expiresAt;
  const wdActive = skillsState.warDance.active && now < skillsState.warDance.expiresAt;

  if (wwActive || wdActive) {
    spCost = 0;
  }

  if (!isSpell && spCost > 0 && m.sp < spCost) {
    if (!silent) showMessage(`${m.name} is too exhausted to attack!`);
    return;
  }

  lastAttackTimes[timeKey] = now;
  if (!isSpell && spCost > 0) setSp(m.id, m.sp - spCost);
  refreshPartyCards();

  // Attacking breaks the Unseen buff
  breakPartyUnseen(`${m.name} attacks — the cloak of shadow disperses!`);

  // Play the visual + audio animation regardless of whether a target exists
  playAction(attackType, hand, memberIndex);
  if (isSpell || isBuff) _dispatchSpellVFX(attackType, target);

  if (isBuff) {
    // Legacy global buffs handled here. 
    // Regeneration is now targeted, but if we add other untargeted buffs
    // they could go here. For now, we'll just return.
    return;
  }

  if (!target) {
    return;
  }

  // Pass character object + weapon def; hit chance and damage are resolved in combat-rules.js
  const ammoItem = m.equipment?.ammo;
  const ammoDef = ammoItem ? getItemDef(ammoItem.name) : null;
  const result = attackMonster(target.id, m, def, attackType, ammoDef);

  addLogEntry({
    time: Date.now(),
    actor: 'player',
    attacker: m.name,
    target: result.monsterName || target.name,
    attackType,
    hitChance: result.hitChance ?? 0,
    hit: result.hit,
    crit: result.crit,
    weaponBase: result.formula?.weaponBase ?? 0,
    statBonus: result.formula?.statBonus ?? 0,
    statLabel: result.formula?.statLabel ?? 'STR',
    mitigation: result.formula?.mitigation ?? 0,
    preCritDamage: result.formula?.preCritDamage ?? 0,
    finalDamage: result.damage,
    critMultiplier: result.formula?.critMultiplier ?? 1,
    stunned: result.stunned ?? false,
    poisoned: result.poisoned ?? false,
    sundered: result.sundered ?? false,
    ammoModifier: result.formula?.ammoModifier ?? null,
    berserkMultiplier: result.formula?.berserkMultiplier ?? 1.0,
    warcryMultiplier: result.formula?.warcryMultiplier ?? 1.0,
  });

  // Log any status effects applied to the monster as separate entries → Effects tab
  _logAppliedEffects(m.name, result.monsterName || target.name, result.stunned, result.appliedEffects);

  // Double Attack Effect
  const da = skillsState.doubleAttack;
  if (da.active && da.actorName === m.name && now < da.expiresAt) {
    // For ranged attacks the 150ms rapid-fire feel is fine; melee animations run
    // ~400ms so we wait long enough for the first swing to visually complete.
    const daDelay = attackType === ACTIONS.SHOOT ? 150 : 450;
    setTimeout(() => {
      // Deduct stamina for the second hit (spells/spCost=0/ww/wdActive exempt)
      if (!isSpell && spCost > 0) {
        if (m.sp < spCost) return; // exhausted before second hit fires
        setSp(m.id, m.sp - spCost);
        refreshPartyCards();
      }
      let daResult, daTarget;
      if (!target.alive) {
        // Find a new target if the first one died
        daTarget = _closestMonsterInFront(maxRange);
        if (daTarget) {
          daResult = attackMonster(daTarget.id, m, def, attackType, ammoDef);
          playAction(attackType, hand, memberIndex);
          if (isSpell || isBuff) _dispatchSpellVFX(attackType, daTarget);
        }
      } else {
        daTarget = target;
        daResult = attackMonster(target.id, m, def, attackType, ammoDef);
        playAction(attackType, hand, memberIndex);
        if (isSpell || isBuff) _dispatchSpellVFX(attackType, daTarget);
      }
      if (daResult) {
        addLogEntry({
          time: Date.now(),
          actor: 'player',
          attacker: m.name,
          target: daResult.monsterName || daTarget.name,
          attackType,
          hitChance: daResult.hitChance ?? 0,
          hit: daResult.hit,
          crit: daResult.crit,
          weaponBase: daResult.formula?.weaponBase ?? 0,
          statBonus: daResult.formula?.statBonus ?? 0,
          statLabel: daResult.formula?.statLabel ?? 'STR',
          mitigation: daResult.formula?.mitigation ?? 0,
          preCritDamage: daResult.formula?.preCritDamage ?? 0,
          finalDamage: daResult.damage,
          critMultiplier: daResult.formula?.critMultiplier ?? 1,
          stunned: daResult.stunned ?? false,
          poisoned: daResult.poisoned ?? false,
          sundered: daResult.sundered ?? false,
          ammoModifier: daResult.formula?.ammoModifier ?? null,
          berserkMultiplier: daResult.formula?.berserkMultiplier ?? 1.0,
          warcryMultiplier: daResult.formula?.warcryMultiplier ?? 1.0,
        });
        _logAppliedEffects(m.name, daResult.monsterName || daTarget.name, daResult.stunned, daResult.appliedEffects);
      }
    }, daDelay);
  }

  if (!result.hit) {
    return;
  }


  if (result.crit) {
    if (result.killed) {
      showMessage(`<span style="color:#ff8800">⚡ CRITICAL!</span> ${m.name} obliterates the ${target.name} for ${result.damage} dmg!`, 3000);
    } else {
      showMessage(`<span style="color:#ff8800">⚡ CRITICAL!</span> ${m.name} inflicts a critical hit for ${result.damage} dmg!`, 1500);
    }
  } else {
    if (result.killed) {
      showMessage(`${m.name} slays the ${target.name} for ${result.damage} dmg!`);
    }
    // Normal hit damage is shown by the red CSS2DObject popup above the monster — no toast needed
  }
}

// ─────────────────────────────────────────────
//  AUTO-ATTACK TICK
// ─────────────────────────────────────────────
// How long after a weapon's cooldown expires before auto-attack fires (ms).
const AUTO_EXTRA_DELAY_MS = 1000;
// How much later the right hand fires vs the left when both are ready (ms).
const AUTO_STAGGER_MS = 600;

// Per "memberIndex-hand" scheduled fire timestamp.
const autoNextFireAt = {};

// Call once per frame per front-row member when auto-attack is active and a
// monster is in melee range.  All timing / cooldown logic lives here so that
// main.js doesn't need weapon definitions.
export function tickAutoAttack(memberIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty || m.isDead) return;
  if (hasEffectFlag(m, 'preventsAction')) return;

  _tickAutoHand(memberIndex, 'left',  0);
  _tickAutoHand(memberIndex, 'right', AUTO_STAGGER_MS);
}

// Reset scheduled timers (e.g. when auto-attack is toggled off).
export function clearAutoAttackTimers() {
  for (const k of Object.keys(autoNextFireAt)) delete autoNextFireAt[k];
}

function _tickAutoHand(memberIndex, hand, staggerOffsetMs) {
  const key = `${memberIndex}-${hand}`;
  const now = performance.now();

  // ── Phase 2: a fire is already scheduled — check if it's time ──
  if (autoNextFireAt[key] !== undefined) {
    if (now >= autoNextFireAt[key]) {
      delete autoNextFireAt[key];
      useHand(memberIndex, hand, true);
    }
    return;
  }

  // ── Phase 1: no fire scheduled — check if cooldown has expired ──
  const m = party[memberIndex];
  const slotKey = hand === 'left' ? 'leftHand' : 'rightHand';
  const item = m.equipment?.[slotKey];
  const def = item ? getItemDef(item.name) : null;
  const attackType = item ? (def?.attackType ?? null) : ACTIONS.PUNCH;
  if (!attackType) return; // passive item (plain shield) or empty slot with no punch intent

  const isBothHands = def?.slot === 'bothHands';
  if (hand === 'right' && isBothHands) return; // bothHands weapon is driven by left only

  // Compute effective weapon delay (mirrors logic in useHand)
  let delaySec = def?.delay ?? 2;
  const ww = skillsState.whirlwind;
  if (ww.active && ww.actorName === m.name && now < ww.expiresAt) delaySec *= ww.magnitude;
  const wd = skillsState.warDance;
  if (wd.active && now < wd.expiresAt) delaySec *= wd.magnitude;
  delaySec *= getAttackSpeedMultiplier(m);

  const isSpellSlot = def?.slot === 'spell';
  const baseKey = isBothHands ? `${memberIndex}-left` : `${memberIndex}-${hand}`;
  const timeKey = isSpellSlot ? `${baseKey}-${item.name}` : baseKey;

  const lastFire = lastAttackTimes[timeKey] ?? 0;
  if (now < lastFire + delaySec * 1000) return; // still on cooldown

  // Cooldown just expired — schedule fire after extra delay + stagger offset
  autoNextFireAt[key] = now + AUTO_EXTRA_DELAY_MS + staggerOffsetMs;
}

// ─────────────────────────────────────────────
//  AUTO-RANGE-ATTACK TICK
// ─────────────────────────────────────────────
// Mirrors AUTO-ATTACK TICK but only fires when the relevant hand holds a bow
// or crossbow.  Uses its own schedule map so it never collides with melee
// auto-attack timers.

const autoRangeNextFireAt = {};

// Call once per frame per party member when auto-range-attack is active and a
// monster is within ranged range.
export function tickAutoRangeAttack(memberIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty || m.isDead) return;
  if (hasEffectFlag(m, 'preventsAction')) return;

  _tickAutoRangeHand(memberIndex, 'left',  0);
  _tickAutoRangeHand(memberIndex, 'right', AUTO_STAGGER_MS);
}

// Reset ranged scheduled timers (e.g. when auto-range-attack is toggled off).
export function clearAutoRangeAttackTimers() {
  for (const k of Object.keys(autoRangeNextFireAt)) delete autoRangeNextFireAt[k];
}

function _tickAutoRangeHand(memberIndex, hand, staggerOffsetMs) {
  const key = `${memberIndex}-${hand}`;
  const now = performance.now();

  // ── Phase 2: a fire is already scheduled — check if it's time ──
  if (autoRangeNextFireAt[key] !== undefined) {
    if (now >= autoRangeNextFireAt[key]) {
      delete autoRangeNextFireAt[key];
      useHand(memberIndex, hand, true);
    }
    return;
  }

  // ── Phase 1: no fire scheduled — check weapon type and cooldown ──
  const m = party[memberIndex];
  const slotKey = hand === 'left' ? 'leftHand' : 'rightHand';
  const item = m.equipment?.[slotKey];
  const def = item ? getItemDef(item.name) : null;

  // Only trigger for bow or crossbow weapons
  if (!def || (def.weaponType !== 'bow' && def.weaponType !== 'crossbow')) return;

  const attackType = def.attackType ?? null;
  if (!attackType) return;

  const isBothHands = def.slot === 'bothHands';
  if (hand === 'right' && isBothHands) return; // bothHands weapon driven by left only

  // Compute effective weapon delay (mirrors logic in useHand)
  let delaySec = def.delay ?? 2;
  const ww = skillsState.whirlwind;
  if (ww.active && ww.actorName === m.name && now < ww.expiresAt) delaySec *= ww.magnitude;
  const wd = skillsState.warDance;
  if (wd.active && now < wd.expiresAt) delaySec *= wd.magnitude;
  delaySec *= getAttackSpeedMultiplier(m);

  const baseKey = isBothHands ? `${memberIndex}-left` : `${memberIndex}-${hand}`;
  const lastFire = lastAttackTimes[baseKey] ?? 0;
  if (now < lastFire + delaySec * 1000) return; // still on cooldown

  // Cooldown just expired — schedule fire after the human-feel delay
  autoRangeNextFireAt[key] = now + AUTO_EXTRA_DELAY_MS + staggerOffsetMs;
}

// ─────────────────────────────────────────────
//  USE SKILL  — dispatcher + per-skill implementations
// ─────────────────────────────────────────────

// ── Skill cooldown/duration/magnitude values loaded from data/skills.json ──
const HUNTERS_EYE_COOLDOWN_MS = SKILLS_DATA["Hunter's Eye"].cooldownMs;
const SANCTUARY_COOLDOWN_MS = SKILLS_DATA['Sanctuary'].cooldownMs;
const SANCTUARY_DURATION_MS = SKILLS_DATA['Sanctuary'].durationMs;
const HOLY_RADIANCE_COOLDOWN_MS = SKILLS_DATA['Holy Radiance'].cooldownMs;
const ENTANGLE_COOLDOWN_MS = SKILLS_DATA['Entangle'].cooldownMs;
const ENTANGLE_DURATION_MS = SKILLS_DATA['Entangle'].durationMs;
const SUNDER_ARMOR_COOLDOWN_MS = SKILLS_DATA['Sunder Armor'].cooldownMs;
const SUNDER_ARMOR_DURATION_MS = SKILLS_DATA['Sunder Armor'].durationMs;

let _huntersEyeCooldownEnd = 0;
let _sanctuaryCooldownEnd = 0;
let _holyRadianceCooldownEnd = 0;
let _sanctuaryExpireTimer = null;

let _entangleCooldownEnd = 0;
let _entangleExpireTimer = null;

let _sunderArmorCooldownEnd = 0;
let _sunderArmorExpireTimer = null;

// ── Action Slot Picker ────────────────────────────────────────────────────────
let _pickerCtx = null; // { memberIndex, slotKey }

function openActionSlotPicker(memberIndex, slotKey) {
  const m = party[memberIndex];
  if (!m || m.isEmpty || m.isDead) return;
  _pickerCtx = { memberIndex, slotKey };

  const overlay = document.getElementById('action-slot-picker-overlay');
  const title = document.getElementById('action-slot-picker-title');
  const body = document.getElementById('action-slot-picker-body');
  if (!overlay || !body) return;

  title.textContent = `${m.name} — Equip Action Slot`;
  body.innerHTML = '';

  const skills = (m.skills || []).filter(s => !SKILLS_DATA[s.name]?.isPassive);
  const spells = m.spells || [];
  const potions = (m.inventory || []).filter(item => item && getItemDef(item.name)?.type === 'potion');

  function addSection(label, items) {
    if (!items.length) return;
    const hdr = document.createElement('div');
    hdr.className = 'asp-section-header';
    hdr.textContent = label;
    body.appendChild(hdr);
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'asp-item';
      const def = item.slot === 'spell' ? null : getItemDef(item.name);
      const iconSrc = item.icon || def?.icon || null;
      if (iconSrc) {
        const img = document.createElement('img');
        img.src = asset(iconSrc);
        img.alt = item.name;
        row.appendChild(img);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.name;
      row.appendChild(nameSpan);
      row.addEventListener('click', () => {
        const ctx = _pickerCtx;
        if (!ctx) return;
        const member = party[ctx.memberIndex];
        if (!member) return;
        const isPotion = getItemDef(item.name)?.type === 'potion';
        if (isPotion) {
          // Remove from inventory and place in action slot; displace existing to inventory
          const invIdx = member.inventory.findIndex(inv => inv && inv.name === item.name);
          if (invIdx === -1) { closeActionSlotPicker(); return; }
          const displaced = member.equipment[ctx.slotKey];
          member.equipment[ctx.slotKey] = item;
          member.inventory[invIdx] = displaced; // displaced could be null or a skill ref (just drop it)
          if (displaced && getItemDef(displaced.name)?.type !== 'potion') {
            // Skills/spells don't go to inventory — just clear
            member.inventory[invIdx] = null;
          }
        } else {
          const isSpell = member.spells?.some(s => s.name === item.name);
          member.equipment[ctx.slotKey] = isSpell
            ? { name: item.name, slot: 'spell' }
            : { name: item.name, slot: 'skill', icon: item.icon };
        }
        refreshPartyCards();
        closeActionSlotPicker();
      });
      body.appendChild(row);
    });
  }

  addSection('Skills', skills);
  if (skills.length && spells.length) {
    const div = document.createElement('div');
    div.className = 'asp-divider';
    body.appendChild(div);
  }
  addSection('Spells', spells);
  if ((skills.length || spells.length) && potions.length) {
    const div = document.createElement('div');
    div.className = 'asp-divider';
    body.appendChild(div);
  }
  addSection('Potions', potions);

  if (!skills.length && !spells.length && !potions.length) {
    const empty = document.createElement('div');
    empty.className = 'asp-item';
    empty.style.color = '#5a4a28';
    empty.textContent = 'Nothing available to equip.';
    body.appendChild(empty);
  }

  overlay.classList.remove('action-slot-picker-hidden');
}

function closeActionSlotPicker() {
  _pickerCtx = null;
  const overlay = document.getElementById('action-slot-picker-overlay');
  if (overlay) overlay.classList.add('action-slot-picker-hidden');
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
function useSkillSlot(memberIndex, slotKey) {
  const m = party[memberIndex];
  if (!m || m.isDead) return;
  if (hasEffectFlag(m, 'preventsAction')) {
    showMessage(`${m.name} cannot act!`);
    return;
  }
  const item = m.equipment?.[slotKey];
  if (!item) {
    // Empty slot — open picker
    openActionSlotPicker(memberIndex, slotKey);
    return;
  }
  // Check if it's a potion
  const itemDef = getItemDef(item.name);
  if (itemDef?.type === 'potion') {
    if (!itemDef.partyPotion) breakPartyUnseen(`${m.name} uses an item — the cloak of shadow disperses!`);
    if (_applyPotionEffect(m, item)) {
      m.equipment[slotKey] = null;
    }
    refreshPartyCards();
    return;
  }
  // Check if it's a spell (spells can be placed in any skill slot)
  const isSpell = m.spells?.some(s => s.name === item.name);
  if (isSpell) {
    // Route through useHand using slotKey as the virtual hand
    useHand(memberIndex, slotKey);
  } else {
    // It's a skill — route through useSkill dispatch
    if (slotKey === 'skill') {
      useSkill(memberIndex);
    } else {
      const orig = m.equipment.skill;
      m.equipment.skill = item;
      useSkill(memberIndex);
      m.equipment.skill = orig;
    }
  }
}

function useSkill(memberIndex) {
  const m = party[memberIndex];
  if (!m || m.isDead) return;
  if (hasEffectFlag(m, 'preventsAction')) {
    showMessage(`${m.name} cannot use skills!`);
    return;
  }

  const skill = m.equipment?.skill;
  if (!skill) {
    showMessage(`${m.name} has no skill equipped!`);
    return;
  }

  if (skill.name === "Hunter's Eye") { _useHuntersEye(m, memberIndex); return; }
  if (skill.name === 'Sanctuary') { _useSanctuary(m, memberIndex); return; }
  if (skill.name === 'Holy Radiance') { _useHolyRadiance(m, memberIndex); return; }
  if (skill.name === 'Arcane Lantern') { _useArcaneLantern(m, memberIndex); return; }
  if (skill.name === 'Miners Light') { _useMinersLight(m, memberIndex); return; }
  if (skill.name === 'Runic Scholar') { _useRunicScholar(m, memberIndex); return; }
  if (skill.name === 'Mana Tap') { _useManaTap(m, memberIndex); return; }
  if (skill.name === 'Entangle') { _useEntangle(m, memberIndex); return; }
  if (skill.name === 'Sunder Armor') { _useSunderArmor(m, memberIndex); return; }
  if (skill.name === 'Berserk') { _useBerserk(m, memberIndex); return; }
  if (skill.name === 'Warcry') { _useWarcry(m, memberIndex); return; }
  if (skill.name === 'Whirlwind') { _useWhirlwind(m, memberIndex); return; }
  if (skill.name === 'War Dance') { _useWarDance(m, memberIndex); return; }
  if (skill.name === 'True Shot') { _useTrueShot(m, memberIndex); return; }
  if (skill.name === 'Double Attack') { _useDoubleAttack(m, memberIndex); return; }
  if (skill.name === 'Rampart') { _useRampart(m, memberIndex); return; }
  if (skill.name === 'Heal') { _useHealSkill(m, memberIndex); return; }

  playSkillSound('magic');
  triggerDefaultSkillEffect();

  const def = getItemDef(skill.name);
  if (def && def.delay) {
    lastAttackTimes[`${memberIndex}-skill-${skill.name}`] = performance.now();
    _startSkillCooldownUI(memberIndex, performance.now() + (def.delay * 1000));
  }

  showMessage(`${m.name} uses ${skill.name}! (Skill logic not yet implemented)`);
}

// ── Hunter's Eye (Elrond) ──────────────────────────────────────────────────
function _useHuntersEye(member, memberIndex) {
  // Always allow manual deactivation
  if (getHuntersEyeTargetId() !== null) {
    setHuntersEyeTarget(null);
    showMessage(`${member.name} lowers Hunter's Eye.`);
    return;
  }

  const now = performance.now();
  if (now < _huntersEyeCooldownEnd) {
    const remaining = Math.ceil((_huntersEyeCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#f0b040">Hunter's Eye</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const target = getInRangeMonster();
  if (!target) {
    showMessage(`<span style="color:#f0b040">Hunter's Eye</span> — no enemy in range. Engage a monster first!`, 2500);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  _huntersEyeCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Hunter's Eye`] = now;
  setHuntersEyeTarget(target.id);
  playSkillSound('hunters-eye');
  triggerHuntersEyeEffect();
  showMessage(`<span style="color:#f0b040">Hunter's Eye</span> — ${member.name} reads the ${target.name}!`, 2500);
  addLogEntry({ type: 'skill', actor: member.name, skillName: "Hunter's Eye" });
  _startSkillCooldownUI(memberIndex, _huntersEyeCooldownEnd);
}

// ── Entangle (Elara) ──────────────────────────────────────────────────────
function _useEntangle(member, memberIndex) {
  const now = performance.now();
  if (now < _entangleCooldownEnd) {
    const remaining = Math.ceil((_entangleCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#80ff80">Entangle</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const target = getInRangeMonster();
  if (!target) {
    showMessage(`<span style="color:#80ff80">Entangle</span> — no enemy in range. Engage a monster first!`, 2500);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const entangleDurationMs = ENTANGLE_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.entangle.active = true;
  skillsState.entangle.targetId = target.id;
  skillsState.entangle.expiresAt = now + entangleDurationMs;
  skillsState.entangle.magnitude = resolveSkillMagnitude('Entangle', SKILLS_DATA['Entangle'], member);
  _entangleCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Entangle`] = now;

  playSkillSound('magic');
  triggerEntangleEffect();
  const entangleDelayStr = skillsState.entangle.magnitude.toFixed(1);
  showMessage(
    `<span style="color:#80ff80">✦ Entangle</span> — ${member.name} roots the ${target.name}! Monster attack delay ×${entangleDelayStr} for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Entangle', target: target.name, note: `Atk Spd ×½ for ${Math.round(entangleDurationMs / 1000)}s` });

  // Force the label visible immediately on the target monster
  const entangleTarget = monsters.find(x => x.id === target.id);
  if (entangleTarget?.entangleLabel) entangleTarget.entangleLabel.visible = true;

  if (_entangleExpireTimer) clearTimeout(_entangleExpireTimer);
  _entangleExpireTimer = setTimeout(() => {
    skillsState.entangle.active = false;
    skillsState.entangle.targetId = null;
    if (entangleTarget?.entangleLabel) entangleTarget.entangleLabel.visible = false;
    showMessage(`<span style="color:#80ff80">Entangle</span> fades — the roots wither away.`, 2500);
    _entangleExpireTimer = null;
  }, entangleDurationMs);

  _startSkillCooldownUI(memberIndex, _entangleCooldownEnd);
}

// ── Sunder Armor (Thorek) ──────────────────────────────────────────────────
function _useSunderArmor(member, memberIndex) {
  const now = performance.now();
  if (now < _sunderArmorCooldownEnd) {
    const remaining = Math.ceil((_sunderArmorCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#ff8080">Sunder Armor</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const target = getInRangeMonster();
  if (!target) {
    showMessage(`<span style="color:#ff8080">Sunder Armor</span> — no enemy in range. Engage a monster first!`, 2500);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const sunderArmorDurationMs = SUNDER_ARMOR_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.sunderArmor.active = true;
  skillsState.sunderArmor.targetId = target.id;
  skillsState.sunderArmor.expiresAt = now + sunderArmorDurationMs;
  skillsState.sunderArmor.magnitude = resolveSkillMagnitude('Sunder Armor', SKILLS_DATA['Sunder Armor'], member);
  _sunderArmorCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Sunder Armor`] = now;

  playSkillSound('render');
  triggerSunderArmorEffect();
  const sunderPct = Math.round((1 - skillsState.sunderArmor.magnitude) * 100);
  showMessage(
    `<span style="color:#ff8080">✦ Sunder Armor</span> — ${member.name} crushes the ${target.name}! Defence reduced by ${sunderPct}% for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Sunder Armor', target: target.name, note: `DEF/RES ×½ for ${Math.round(sunderArmorDurationMs / 1000)}s` });

  // Force the label visible immediately on the target monster
  const targetMonster = monsters.find(x => x.id === target.id);
  if (targetMonster?.sunderLabel) targetMonster.sunderLabel.visible = true;

  if (_sunderArmorExpireTimer) clearTimeout(_sunderArmorExpireTimer);
  _sunderArmorExpireTimer = setTimeout(() => {
    skillsState.sunderArmor.active = false;
    skillsState.sunderArmor.targetId = null;
    if (targetMonster?.sunderLabel) targetMonster.sunderLabel.visible = false;
    showMessage(`<span style="color:#ff8080">Sunder Armor</span> fades — the armor naturally mends.`, 2500);
    _sunderArmorExpireTimer = null;
  }, sunderArmorDurationMs);

  _startSkillCooldownUI(memberIndex, _sunderArmorCooldownEnd);
}

// ── Berserk (Korg) ─────────────────────────────────────────────────────────
const BERSERK_COOLDOWN_MS = SKILLS_DATA['Berserk'].cooldownMs;
const BERSERK_DURATION_MS = SKILLS_DATA['Berserk'].durationMs;
let _berserkCooldownEnd = 0;
let _berserkExpireTimer = null;

function _useBerserk(member, memberIndex) {
  const now = performance.now();
  if (now < _berserkCooldownEnd) {
    const remaining = Math.ceil((_berserkCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#ff5050">Berserk</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const berserkDurationMs = BERSERK_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.berserk.active = true;
  skillsState.berserk.actorName = member.name;
  skillsState.berserk.expiresAt = now + berserkDurationMs;
  skillsState.berserk.magnitude = resolveSkillMagnitude('Berserk', SKILLS_DATA['Berserk'], member);
  _berserkCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Berserk`] = now;

  playSkillSound('berserk');
  triggerBerserkEffect();
  const berserkPct = Math.round((skillsState.berserk.magnitude - 1) * 100);
  showMessage(
    `<span style="color:#ff5050">✦ Berserk</span> — ${member.name} roars in fury! Damage +${berserkPct}% for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Berserk' });

  if (_berserkExpireTimer) clearTimeout(_berserkExpireTimer);
  _berserkExpireTimer = setTimeout(() => {
    skillsState.berserk.active = false;
    skillsState.berserk.actorName = null;
    showMessage(`<span style="color:#ff5050">Berserk</span> fades — the rage subsides.`, 2500);
    _berserkExpireTimer = null;
  }, berserkDurationMs);

  _startSkillCooldownUI(memberIndex, _berserkCooldownEnd);
}

// ── Warcry (Korg) ──────────────────────────────────────────────────────────
const WARCRY_COOLDOWN_MS = SKILLS_DATA['Warcry']?.cooldownMs ?? 60000;
const WARCRY_DURATION_MS = SKILLS_DATA['Warcry']?.durationMs ?? 30000;
let _warcryCooldownEnd = 0;
let _warcryExpireTimer = null;

function _useWarcry(member, memberIndex) {
  const now = performance.now();
  if (now < _warcryCooldownEnd) {
    const remaining = Math.ceil((_warcryCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#ffcc00">Warcry</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const warcryDurationMs = WARCRY_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.warcry.active = true;
  skillsState.warcry.expiresAt = now + warcryDurationMs;
  skillsState.warcry.magnitude = resolveSkillMagnitude('Warcry', SKILLS_DATA['Warcry'], member);
  _warcryCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Warcry`] = now;

  playSkillSound('berserk'); // reuse berserk roar for now
  triggerWarcryEffect();
  const warcryPct = Math.round((skillsState.warcry.magnitude - 1) * 100);
  showMessage(
    `<span style="color:#ffcc00">✦ Warcry</span> — ${member.name} inspires the party! Damage +${warcryPct}% for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Warcry' });

  if (_warcryExpireTimer) clearTimeout(_warcryExpireTimer);
  _warcryExpireTimer = setTimeout(() => {
    skillsState.warcry.active = false;
    showMessage(`<span style="color:#ffcc00">Warcry</span> fades — the inspiration passes.`, 2500);
    addLogEntry({ type: 'skill', actor: 'System', skillName: 'Warcry fades' });
    _warcryExpireTimer = null;
  }, warcryDurationMs);

  _startSkillCooldownUI(memberIndex, _warcryCooldownEnd);
}

// ── Sanctuary (Alaric) ────────────────────────────────────────────────────
function _useSanctuary(member, memberIndex) {
  const now = performance.now();
  if (now < _sanctuaryCooldownEnd) {
    const remaining = Math.ceil((_sanctuaryCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#f0d080">Sanctuary</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 120) * 1000;
  const sanctuaryDurationMs = SANCTUARY_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  // Activate the buff — magnitude resolved from the caster's current stats
  skillsState.sanctuary.active = true;
  skillsState.sanctuary.expiresAt = now + sanctuaryDurationMs;
  skillsState.sanctuary.magnitude = resolveSkillMagnitude('Sanctuary', SKILLS_DATA['Sanctuary'], member);
  _sanctuaryCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Sanctuary`] = now;

  playSkillSound('holy');
  triggerSanctuaryEffect();
  const sanctuaryReductionPct = Math.min(skillsState.sanctuary.magnitude, 100);
  showMessage(
    `<span style="color:#f0d080">✦ Sanctuary</span> — ${member.name} shields the party! Damage −${sanctuaryReductionPct}% for 60s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Sanctuary' });

  // Auto-expire the visual when the 60s buff ends
  if (_sanctuaryExpireTimer) clearTimeout(_sanctuaryExpireTimer);
  _sanctuaryExpireTimer = setTimeout(() => {
    skillsState.sanctuary.active = false;
    showMessage(`<span style="color:#f0d080">Sanctuary</span> fades — the shield dissipates.`, 2500);
    _sanctuaryExpireTimer = null;
  }, sanctuaryDurationMs);

  _startSkillCooldownUI(memberIndex, _sanctuaryCooldownEnd);
}

// ── Holy Radiance (Alaric) ────────────────────────────────────────────────
function _useHolyRadiance(member, memberIndex) {
  const now = performance.now();
  if (now < _holyRadianceCooldownEnd) {
    const remaining = Math.ceil((_holyRadianceCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#f8f8a0">Holy Radiance</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 120) * 1000;
  _holyRadianceCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Holy Radiance`] = now;

  const holyRadianceHeal = resolveSkillMagnitude('Holy Radiance', SKILLS_DATA['Holy Radiance'], member);
  let healed = 0;
  party.forEach((m) => {
    if (!m.isEmpty && !m.isDead && m.hp < m.hpMax) {
      setHp(m.id, Math.min(m.hp + holyRadianceHeal, m.hpMax));
      healed++;
    }
  });

  if (healed > 0) {
    playSkillSound('holy');
    triggerHolyRadianceEffect();
    showMessage(
      `<span style="color:#f8f8a0">✦ Holy Radiance</span> — ${member.name} calls down divine light! Each member heals ${holyRadianceHeal} HP.`,
      3000
    );
    addLogEntry({ type: 'skill', actor: member.name, skillName: 'Holy Radiance' });
  } else {
    showMessage(`<span style="color:#f8f8a0">Holy Radiance</span> — the party is already at full health.`, 2000);
  }

  _startSkillCooldownUI(memberIndex, _holyRadianceCooldownEnd);
}

// ── Arcane Lantern (Ashar) ───────────────────────────────────────────────
const ARCANE_LANTERN_COOLDOWN_MS = SKILLS_DATA['Arcane Lantern'].cooldownMs;
const ARCANE_LANTERN_DURATION_MS = SKILLS_DATA['Arcane Lantern'].durationMs;
let _arcaneLanternCooldownEnd = 0;
let _arcaneLanternExpireTimer = null;

function _useArcaneLantern(member, memberIndex) {
  const now = performance.now();
  if (now < _arcaneLanternCooldownEnd) {
    const remaining = Math.ceil((_arcaneLanternCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#a0d8ff">Arcane Lantern</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const arcaneLanternDurationMs = ARCANE_LANTERN_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.arcaneLight.active = true;
  skillsState.arcaneLight.expiresAt = now + arcaneLanternDurationMs;
  _arcaneLanternCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Arcane Lantern`] = now;

  playSkillSound('magic');
  triggerArcaneLanternEffect();
  showMessage(
    `<span style="color:#a0d8ff">✦ Arcane Lantern</span> — ${member.name} conjures magical light for 60s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Arcane Lantern' });

  if (_arcaneLanternExpireTimer) clearTimeout(_arcaneLanternExpireTimer);
  _arcaneLanternExpireTimer = setTimeout(() => {
    skillsState.arcaneLight.active = false;
    showMessage(`<span style="color:#a0d8ff">Arcane Lantern</span> fades — darkness returns.`, 2500);
    _arcaneLanternExpireTimer = null;
  }, arcaneLanternDurationMs);

  _startSkillCooldownUI(memberIndex, _arcaneLanternCooldownEnd);
}

// ── Miner's Light (Thorek) ────────────────────────────────────────────────
let _minersLightCooldownEnd = 0;
let _minersLightExpireTimer = null;

function _useMinersLight(member, memberIndex) {
  const now = performance.now();
  if (now < _minersLightCooldownEnd) {
    const remaining = Math.ceil((_minersLightCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#d8d8ff">Miners Light</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const minersLightDurationMs = ARCANE_LANTERN_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  // Same duration and effect as Arcane Lantern
  skillsState.arcaneLight.active = true;
  skillsState.arcaneLight.expiresAt = now + minersLightDurationMs;
  _minersLightCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Miners Light`] = now;

  playSkillSound('magic');
  triggerArcaneLanternEffect();
  showMessage(
    `<span style="color:#d8d8ff">✦ Miners Light</span> — ${member.name} ignites a lantern for 60s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: "Miners Light" });

  if (_minersLightExpireTimer) clearTimeout(_minersLightExpireTimer);
  _minersLightExpireTimer = setTimeout(() => {
    // Both skills share the same global light state
    skillsState.arcaneLight.active = false;
    showMessage(`<span style="color:#d8d8ff">Miners Light</span> fades — darkness returns.`, 2500);
    _minersLightExpireTimer = null;
  }, minersLightDurationMs);

  _startSkillCooldownUI(memberIndex, _minersLightCooldownEnd);
}

// ── War Dance (Lumni) ───────────────────────────────────────────────────────
const WAR_DANCE_COOLDOWN_MS = SKILLS_DATA['War Dance']?.cooldownMs ?? 60000;
const WAR_DANCE_DURATION_MS = SKILLS_DATA['War Dance']?.durationMs ?? 30000;
let _warDanceCooldownEnd = 0;
let _warDanceExpireTimer = null;

function _useWarDance(member, memberIndex) {
  const now = performance.now();
  if (now < _warDanceCooldownEnd) {
    const remaining = Math.ceil((_warDanceCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#ff80c0">War Dance</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const warDanceDurationMs = WAR_DANCE_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.warDance.active = true;
  skillsState.warDance.expiresAt = now + warDanceDurationMs;
  skillsState.warDance.magnitude = resolveSkillMagnitude('War Dance', SKILLS_DATA['War Dance'], member);
  _warDanceCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-War Dance`] = now;

  playSkillSound('war-dance');
  triggerWarDanceEffect();
  const warDanceDelayStr = skillsState.warDance.magnitude.toFixed(2);
  showMessage(
    `<span style="color:#ff80c0">✦ War Dance</span> — ${member.name} inspires the party! Attack delay ×${warDanceDelayStr} for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'War Dance' });

  if (_warDanceExpireTimer) clearTimeout(_warDanceExpireTimer);
  _warDanceExpireTimer = setTimeout(() => {
    skillsState.warDance.active = false;
    showMessage(`<span style="color:#ff80c0">War Dance</span> fades — the rhythm ends.`, 2500);
    addLogEntry({ type: 'skill', actor: 'System', skillName: 'War Dance fades' });
    _warDanceExpireTimer = null;
  }, warDanceDurationMs);

  _startSkillCooldownUI(memberIndex, _warDanceCooldownEnd);
}

// ── Whirlwind (Lumni) ─────────────────────────────────────────────────────
const WHIRLWIND_COOLDOWN_MS = SKILLS_DATA['Whirlwind'].cooldownMs;
const WHIRLWIND_DURATION_MS = SKILLS_DATA['Whirlwind'].durationMs;
let _whirlwindCooldownEnds = [0, 0, 0, 0];
let _whirlwindExpireTimers = [null, null, null, null];

function _useWhirlwind(member, memberIndex) {
  const now = performance.now();
  if (now < _whirlwindCooldownEnds[memberIndex]) {
    const remaining = Math.ceil((_whirlwindCooldownEnds[memberIndex] - now) / 1000);
    showMessage(`<span style="color:#a0f0ff">Whirlwind</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const whirlwindDurationMs = WHIRLWIND_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.whirlwind.active = true;
  skillsState.whirlwind.actorName = member.name;
  skillsState.whirlwind.expiresAt = now + whirlwindDurationMs;
  skillsState.whirlwind.magnitude = resolveSkillMagnitude('Whirlwind', SKILLS_DATA['Whirlwind'], member);
  _whirlwindCooldownEnds[memberIndex] = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Whirlwind`] = now;

  playSkillSound('berserk');
  triggerWhirlwindEffect();
  const whirlwindDelayStr = skillsState.whirlwind.magnitude.toFixed(2);
  showMessage(
    `<span style="color:#a0f0ff">✦ Whirlwind</span> — ${member.name} becomes a blur! Attack delay ×${whirlwindDelayStr} for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Whirlwind' });

  if (_whirlwindExpireTimers[memberIndex]) clearTimeout(_whirlwindExpireTimers[memberIndex]);
  _whirlwindExpireTimers[memberIndex] = setTimeout(() => {
    skillsState.whirlwind.active = false;
    skillsState.whirlwind.actorName = null;
    showMessage(`<span style="color:#a0f0ff">Whirlwind</span> fades — movement returns to normal.`, 2500);
    _whirlwindExpireTimers[memberIndex] = null;
  }, whirlwindDurationMs);

  _startSkillCooldownUI(memberIndex, _whirlwindCooldownEnds[memberIndex]);
}

// ── True Shot (Baldur) ──────────────────────────────────────────────────
const TRUE_SHOT_COOLDOWN_MS = SKILLS_DATA['True Shot'].cooldownMs;
const TRUE_SHOT_DURATION_MS = SKILLS_DATA['True Shot'].durationMs;
let _trueShotCooldownEnds = [0, 0, 0, 0];
let _trueShotExpireTimers = [null, null, null, null];

// ── Double Attack ──────────────────────────────────────────────────────────
const DOUBLE_ATTACK_DURATION_MS = SKILLS_DATA['Double Attack']?.durationMs ?? 20000;
let _doubleAttackCooldownEnds = [0, 0, 0, 0];
let _doubleAttackExpireTimers = [null, null, null, null];

function _useDoubleAttack(member, memberIndex) {
  const now = performance.now();
  if (now < _doubleAttackCooldownEnds[memberIndex]) {
    const remaining = Math.ceil((_doubleAttackCooldownEnds[memberIndex] - now) / 1000);
    showMessage(`<span style="color:#ff8080">Double Attack</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const skillDef = SKILLS_DATA['Double Attack'];
  const mag = resolveSkillMagnitude('Double Attack', skillDef, member);
  const cooldownMs = (skillDef?.cooldownMs ?? 90000);
  
  // Base duration is 20s. Any magnitude > 1 (e.g. from the dagger's +20 bonus)
  // adds directly to the duration in seconds. Also apply any item duration bonus.
  const durationMs = (skillDef?.durationMs ?? 20000) + (mag > 1 ? (mag - 1) * 1000 : 0) + (member.skillDurationBonusMs ?? 0);

  skillsState.doubleAttack.active = true;
  skillsState.doubleAttack.actorName = member.name;
  skillsState.doubleAttack.expiresAt = now + durationMs;

  _doubleAttackCooldownEnds[memberIndex] = now + cooldownMs;
  lastAttackTimes[`${memberIndex}-skill-Double Attack`] = now;

  playSkillSound('double-attack');
  triggerDoubleAttackEffect();

  showMessage(
    `<span style="color:#ff8080">✦ Double Attack</span> — ${member.name} enters a state of focused aggression! Striking twice with every attack for 20s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Double Attack' });

  if (_doubleAttackExpireTimers[memberIndex]) clearTimeout(_doubleAttackExpireTimers[memberIndex]);
  _doubleAttackExpireTimers[memberIndex] = setTimeout(() => {
    // Only deactivate if this member was the one who activated the current state
    // (In case of multiple Double Attackers, though unlikely for now)
    if (skillsState.doubleAttack.actorName === member.name) {
      skillsState.doubleAttack.active = false;
      skillsState.doubleAttack.actorName = null;
      showMessage(`<span style="color:#ff8080">Double Attack</span> fades — focus returns to normal.`, 2500);
    }
    _doubleAttackExpireTimers[memberIndex] = null;
  }, durationMs);

  _startSkillCooldownUI(memberIndex, _doubleAttackCooldownEnds[memberIndex]);
}

function _useTrueShot(member, memberIndex) {
  const now = performance.now();
  if (now < _trueShotCooldownEnds[memberIndex]) {
    const remaining = Math.ceil((_trueShotCooldownEnds[memberIndex] - now) / 1000);
    showMessage(`<span style="color:#ffe080">True Shot</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  const trueShotDurationMs = TRUE_SHOT_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.trueShot.active = true;
  skillsState.trueShot.actorName = member.name;
  skillsState.trueShot.expiresAt = now + trueShotDurationMs;
  _trueShotCooldownEnds[memberIndex] = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-True Shot`] = now;

  playSkillSound('magic');
  triggerTrueShotEffect();
  showMessage(
    `<span style="color:#ffe080">✦ True Shot</span> — ${member.name} focuses! Ranged attacks will not miss for 20s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'True Shot' });

  if (_trueShotExpireTimers[memberIndex]) clearTimeout(_trueShotExpireTimers[memberIndex]);
  _trueShotExpireTimers[memberIndex] = setTimeout(() => {
    skillsState.trueShot.active = false;
    skillsState.trueShot.actorName = null;
    showMessage(`<span style="color:#ffe080">True Shot</span> fades — focus returns to normal.`, 2500);
    _trueShotExpireTimers[memberIndex] = null;
  }, trueShotDurationMs);

  _startSkillCooldownUI(memberIndex, _trueShotCooldownEnds[memberIndex]);
}

// ── Rampart ──────────────────────────────────────────────────────────────
const RAMPART_DURATION_MS = SKILLS_DATA['Rampart']?.durationMs ?? 60000;
let _rampartCooldownEnds = [0, 0, 0, 0];
let _rampartExpireTimers = [null, null, null, null];

function _useRampart(member, memberIndex) {
  const now = performance.now();
  if (now < _rampartCooldownEnds[memberIndex]) {
    const remaining = Math.ceil((_rampartCooldownEnds[memberIndex] - now) / 1000);
    showMessage(`<span style="color:#ffd700">Rampart</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const skillDef = SKILLS_DATA['Rampart'];
  const mag = resolveSkillMagnitude('Rampart', skillDef, member);
  const cooldownMs = (skillDef.cooldownMs ?? 120000);

  const rampartDurationMs = RAMPART_DURATION_MS + (member.skillDurationBonusMs ?? 0);
  skillsState.rampart.active = true;
  skillsState.rampart.actorName = member.name;
  skillsState.rampart.expiresAt = now + rampartDurationMs;
  skillsState.rampart.magnitude = mag;

  _rampartCooldownEnds[memberIndex] = now + cooldownMs;
  lastAttackTimes[`${memberIndex}-skill-Rampart`] = now;

  playSkillSound('rampart');
  triggerRampartEffect();
  showMessage(
    `<span style="color:#ffd700">✦ Rampart</span> — ${member.name} braces themselves! Defence rating doubled for 60s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Rampart' });

  if (_rampartExpireTimers[memberIndex]) clearTimeout(_rampartExpireTimers[memberIndex]);
  _rampartExpireTimers[memberIndex] = setTimeout(() => {
    if (skillsState.rampart.actorName === member.name) {
      skillsState.rampart.active = false;
      skillsState.rampart.actorName = null;
      showMessage(`<span style="color:#ffd700">Rampart</span> fades — the character lowers their guard.`, 2500);
    }
    _rampartExpireTimers[memberIndex] = null;
  }, rampartDurationMs);

  _startSkillCooldownUI(memberIndex, _rampartCooldownEnds[memberIndex]);
}

// ── Runic Scholar (Ashar) ────────────────────────────────────────────────
const RUNIC_SCHOLAR_COOLDOWN_MS = SKILLS_DATA['Runic Scholar'].cooldownMs;
let _runicScholarCooldownEnds = [0, 0, 0, 0];

function _useRunicScholar(member, memberIndex) {
  const now = performance.now();

  // Toggle off if already primed (lets the player cancel — cooldown still applies)
  if (member.runicScholarActive) {
    member.runicScholarActive = false;
    refreshPartyCards();
    showMessage(`<span style="color:#c080ff">Runic Scholar</span> — ${member.name} releases the charge.`, 2000);
    return;
  }

  if (now < _runicScholarCooldownEnds[memberIndex]) {
    const remaining = Math.ceil((_runicScholarCooldownEnds[memberIndex] - now) / 1000);
    showMessage(`<span style="color:#c080ff">Runic Scholar</span> — ready in ${remaining}s`, 2000);
    return;
  }

  member.runicScholarActive = true;
  member.runicScholarMagnitude = resolveSkillMagnitude('Runic Scholar', SKILLS_DATA['Runic Scholar'], member);
  _runicScholarCooldownEnds[memberIndex] = now + RUNIC_SCHOLAR_COOLDOWN_MS;
  lastAttackTimes[`${memberIndex}-skill-Runic Scholar`] = now;
  refreshPartyCards(); // immediately lights up the skill slot glow

  playSkillSound('magic');
  triggerRunicScholarEffect();
  showMessage(
    `<span style="color:#c080ff">✦ Runic Scholar</span> — ${member.name} channels the runes! Next spell deals ×${member.runicScholarMagnitude.toFixed(1)} damage.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Runic Scholar' });

  _startSkillCooldownUI(memberIndex, _runicScholarCooldownEnds[memberIndex]);
}

// ── Mana Tap (Ashar) ─────────────────────────────────────────────────────
const MANA_TAP_COOLDOWN_MS = SKILLS_DATA['Mana Tap'].cooldownMs;
let _manaTapCooldownEnd = 0;

function _useManaTap(member, memberIndex) {
  const now = performance.now();
  if (now < _manaTapCooldownEnd) {
    const remaining = Math.ceil((_manaTapCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#40c0ff">Mana Tap</span> — ready in ${remaining}s`, 2000);
    return;
  }

  if (member.mp >= member.mpMax) {
    showMessage(`<span style="color:#40c0ff">Mana Tap</span> — ${member.name}'s mana is already full.`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 120) * 1000;
  _manaTapCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill-Mana Tap`] = now;
  setMp(member.id, member.mpMax);

  playSkillSound('magic');
  triggerManaTapEffect();
  showMessage(
    `<span style="color:#40c0ff">✦ Mana Tap</span> — ${member.name} draws on hidden reserves! Mana fully restored.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Mana Tap' });
  _startSkillCooldownUI(memberIndex, _manaTapCooldownEnd);
}

// ── Heal (Korg / Skills) ──────────────────────────────────────────────────
const HEAL_SKILL_COOLDOWN_MS = 45000;
let _healSkillCooldownEnds = [0, 0, 0, 0]; // per-member cooldown for Heal skill if shared

function _useHealSkill(member, memberIndex) {
  const now = performance.now();
  if (now < _healSkillCooldownEnds[memberIndex]) {
    const remaining = Math.ceil((_healSkillCooldownEnds[memberIndex] - now) / 1000);
    showMessage(`<span style="color:#ff80c0">Heal</span> — ready in ${remaining}s`, 2000);
    return;
  }

  // Skills that require a target picker
  // We don't deduct MP/cooldown here; we do it in _executePartyMemberSpell
  // but for skills we need to manually handle the "hand" as 'skill'
  _openPartyTargetPicker(member, memberIndex, 'skill', {
    name: 'Heal',
    attackType: ACTIONS.HEAL,
    mpCost: 12, // MP cost for the skill version too? 
    cooldown: HEAL_SKILL_COOLDOWN_MS
  });
}

/**
 * Special override for skills that used the target picker.
 * Normally _executePartyMemberSpell handles spells.
 * We need to ensure it also sets our custom skill cooldown if it was a 'skill' use.
 */
// I will need to update _executePartyMemberSpell to handle the cooldown if it came from a skill slot.

// ── Generic cooldown badge ────────────────────────────────────────────────
/**
 * Shows a countdown badge on the skill slot of the given party member.
 * @param {number} memberIndex - Party slot index (0-3)
 * @param {number} expiresAt   - performance.now() timestamp when cooldown ends
 */
function _startSkillCooldownUI(memberIndex, expiresAt, slotKey = 'skill') {
  const suffix = slotKey === 'skill' ? '' : slotKey.replace('skill', '');
  const slotEl = document.getElementById(`slot-sk${suffix}-${memberIndex}`);
  if (!slotEl) return;

  // Cancel any existing timer stored on this element
  if (slotEl._cdTimer) clearInterval(slotEl._cdTimer);

  let badge = slotEl.querySelector('.skill-cd-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'skill-cd-badge';
    slotEl.appendChild(badge);
  }

  slotEl.classList.add('slot-cooling-down');
  // Re-enable pointer events so clicking shows the remaining time message
  slotEl.style.pointerEvents = 'auto';

  function tick() {
    const remaining = Math.ceil((expiresAt - performance.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(slotEl._cdTimer);
      slotEl._cdTimer = null;
      slotEl.classList.remove('slot-cooling-down');
      slotEl.style.pointerEvents = '';
      badge.remove();
    } else {
      badge.textContent = remaining + 's';
    }
  }

  tick();
  slotEl._cdTimer = setInterval(tick, 500);
}

// ─────────────────────────────────────────────
//  DOM WIRING
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  INVENTORY SORT
// ─────────────────────────────────────────────
export function _getItemSortPriority(item) {
  const def = getItemDef(item.name);
  if (!def) return 99;
  const slot = def.slot;
  const type = def.type;
  if (slot === 'bothHands' || slot === 'hand') return 0;        // weapons
  if (slot === 'head' || slot === 'body' || slot === 'legs' || slot === 'feet') return 1; // armour
  if (slot === 'neck' || slot === 'ring' || slot === 'ammo') return 2;  // accessories
  if (slot === 'skill') return 3;                                // skills
  if (type === 'spellbook') return 4;                           // spellbooks
  if (type === 'potion') return 5;                              // potions
  if (slot === 'loot') return 6;                                // loot
  return 7;
}

function _sortInventory() {
  if (activeCharIndex === null) return;
  playInventorySortSound();
  const m = party[activeCharIndex];

  // Collect all non-null items, sort by type then name, then repack from index 0
  const items = m.inventory.filter(item => item !== null);
  items.sort((a, b) => {
    const pa = _getItemSortPriority(a);
    const pb = _getItemSortPriority(b);
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < m.inventory.length; i++) {
    m.inventory[i] = items[i] ?? null;
  }

  renderModal(activeCharIndex);
}

function buildInventoryGrid() {
  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'inv-cell';
    cell.dataset.index = i;
    cell.addEventListener('click', onInventoryCellClick);
    cell.addEventListener('contextmenu', onInventoryCellContextMenu);
    // Hover tooltip — reads live item each time in case it changed
    attachTooltipListeners(cell, () => {
      if (activeCharIndex === null) return null;
      return party[activeCharIndex].inventory[i] ?? null;
    });
    grid.appendChild(cell);
  }
}

function attachPaperdollListeners() {
  SLOT_KEYS.forEach((key) => {
    const el = document.getElementById(`pd-${key}`);
    if (!el) return;
    el.addEventListener('click', onPaperdollSlotClick);
    el.addEventListener('contextmenu', onPaperdollSlotContextMenu);
    // Hover tooltip for equipped items
    attachTooltipListeners(el, () => {
      if (activeCharIndex === null) return null;
      const m = party[activeCharIndex];
      let item = m.equipment[key] ?? null;
      
      if (item && key === 'skill') {
        // If it's a skill, grab the full definition from SKILLS_DATA or m.skills
        const skillDef = SKILLS_DATA[item.name] || {};
        const potency = _formatSkillPotency(item.name, m);
        return { ...skillDef, name: item.name, isSkill: true, potency };
      }
      
      return item;
    });
  });

}


function attachBarTooltipListeners() {
  const hpRow = document.getElementById('equip-row-hp');
  if (hpRow) {
    attachTooltipListeners(hpRow, () => ({
      name: 'Health',
      description: 'Represents your physical well-being. If this reaches zero, the character is knocked out and can no longer fight.',
      isCustom: true
    }));
  }
  const mpRow = document.getElementById('equip-row-mp');
  if (mpRow) {
    attachTooltipListeners(mpRow, () => ({
      name: 'Mana',
      description: 'The magical energy needed to cast spells and channel divine power.',
      isCustom: true
    }));
  }
  const spRow = document.getElementById('equip-row-sp');
  if (spRow) {
    attachTooltipListeners(spRow, () => ({
      name: 'Stamina',
      description: 'Physical endurance used for sprinting, heavy lifting, and advanced combat techniques.',
      isCustom: true
    }));
  }
}

function attachCardListeners() {
  party.forEach((m, i) => {
    const card = document.getElementById(`member-${i}`);
    if (!card) return;

    // Clicking the portrait opens the equipment modal
    const portrait = card.querySelector('.portrait');
    if (portrait) {
      portrait.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(i);
      });
    }

    // Clicking the left/right hand slots uses the item — does NOT open modal
    const lhSlot = document.getElementById(`slot-lh-${i}`);
    const rhSlot = document.getElementById(`slot-rh-${i}`);

    if (lhSlot) {
      lhSlot.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent card click / modal open
        useHand(i, 'left');
      });
      lhSlot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const m = party[i];
        if (!m || m.isEmpty) return;
        if (m.equipment?.leftHand?.slot === 'spell' && m.spells?.length) {
          _showSkillSwitchMenu(e.clientX, e.clientY, i, 'spell', 'leftHand');
        }
      });
    }
    if (rhSlot) {
      rhSlot.addEventListener('click', (e) => {
        e.stopPropagation();
        useHand(i, 'right');
      });
      rhSlot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const m = party[i];
        if (!m || m.isEmpty) return;
        if (m.equipment?.rightHand?.slot === 'spell' && m.spells?.length) {
          _showSkillSwitchMenu(e.clientX, e.clientY, i, 'spell', 'rightHand');
        }
      });
    }

    ['skill', 'skill2', 'skill3', 'skill4', 'skill5', 'skill6'].forEach(slotKey => {
      const suffix = slotKey === 'skill' ? '' : slotKey.replace('skill', '');
      const slotEl = document.getElementById(`slot-sk${suffix}-${i}`);
      if (!slotEl) return;
      slotEl.addEventListener('click', (e) => {
        e.stopPropagation();
        useSkillSlot(i, slotKey);
      });
      slotEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const m = party[i];
        if (!m || m.isEmpty) return;
        _showSkillSwitchMenu(e.clientX, e.clientY, i, 'unified', slotKey);
      });
    });

  });
}

function attachOverlayListeners() {
  // Loadout B rotate button
  const rotateBtn = document.getElementById('loadout-rotate-btn');
  if (rotateBtn) {
    rotateBtn.addEventListener('click', () => {
      if (activeCharIndex !== null) {
        if (party[activeCharIndex].isDead) return;
        rotateLoadout(activeCharIndex);
        renderModal(activeCharIndex);
      }
    });
  }

  // Loadout B slots — clicking a B slot with an item unequips it back to inventory
  ['pd-lhB', 'pd-rhB', 'pd-skB'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      if (activeCharIndex === null) return;
      const m = party[activeCharIndex];
      if (!m || !m.loadoutB) return;
      if (m.isDead) return;
      const lb = el.dataset.lb;
      let item = null;
      if (lb === 'leftHand') {
        item = m.loadoutB.leftHand;
        if (item && m.loadoutB.leftHand?.slot === 'bothHands') m.loadoutB.rightHand = null;
        m.loadoutB.leftHand = null;
      } else if (lb === 'rightHand') {
        item = m.loadoutB.rightHand;
        m.loadoutB.rightHand = null;
      } else if (lb === 'skill') {
        item = m.loadoutB.skill;
        m.loadoutB.skill = null;
      }
      if (item) {
        const slot = m.inventory.indexOf(null);
        if (slot !== -1) {
          m.inventory[slot] = item;
          showMessage(`${item.name} returned to inventory.`);
        } else {
          // Restore on slot if inventory full
          if (lb === 'leftHand') m.loadoutB.leftHand = item;
          else if (lb === 'rightHand') m.loadoutB.rightHand = item;
          else m.loadoutB.skill = item;
          showMessage('Inventory full!');
        }
      }
      renderModal(activeCharIndex);
      refreshPartyCards();
    });
  });

  // Action slot picker close button + backdrop click
  const aspClose = document.getElementById('action-slot-picker-close');
  if (aspClose) aspClose.addEventListener('click', closeActionSlotPicker);
  const aspOverlay = document.getElementById('action-slot-picker-overlay');
  if (aspOverlay) aspOverlay.addEventListener('click', (e) => {
    if (e.target === aspOverlay) closeActionSlotPicker();
  });

  // Close button
  document.getElementById('equip-close')
    .addEventListener('click', closeModal);

  // Click on dark backdrop (not the modal box itself)
  document.getElementById('equip-overlay')
    .addEventListener('click', (e) => {
      if (e.target === document.getElementById('equip-overlay')) closeModal();
    });

  // Escape key — close context menu first, then modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (_pickerCtx !== null) {
        e.stopPropagation();
        closeActionSlotPicker();
        return;
      }
      if (_skillSwMenuCtx !== null) {
        e.stopPropagation();
        _hideSkillSwitchMenu();
        return;
      }
      if (_ctxInvIndex !== null) {
        e.stopPropagation();
        _hideContextMenu();
        return;
      }
      if (activeCharIndex !== null) {
        e.stopPropagation();
        closeModal();
      }
      if (activeCharDevIndex !== null) {
        e.stopPropagation();
        closeCharDevModal();
      }
    }

    // I key — open character inventory
    if (e.key === 'i' || e.key === 'I') {
      if (activeCharIndex !== null || activeCharDevIndex !== null) return; // already open
      const overlayOpen = ['tactics-overlay', 'chest-overlay', 'armor-stand-overlay', 'merchant-overlay', 'main-menu-overlay'].some(id => {
        const el = document.getElementById(id);
        return el && window.getComputedStyle(el).display !== 'none';
      });
      if (overlayOpen) return;
      const firstIndex = party.findIndex(m => !m.isEmpty && !m.isDead);
      if (firstIndex !== -1) openModal(firstIndex);
    }

    // C key — open character development
    if (e.key === 'c' || e.key === 'C') {
      if (activeCharIndex !== null || activeCharDevIndex !== null) return; // already open
      const overlayOpen = ['tactics-overlay', 'chest-overlay', 'armor-stand-overlay', 'merchant-overlay', 'main-menu-overlay'].some(id => {
        const el = document.getElementById(id);
        return el && window.getComputedStyle(el).display !== 'none';
      });
      if (overlayOpen) return;
      const firstIndex = party.findIndex(m => !m.isEmpty && !m.isDead);
      if (firstIndex !== -1) openCharDevModal(firstIndex);
    }
  });

  // Click outside context menus → dismiss them
  document.addEventListener('mousedown', (e) => {
    const skillMenu = document.getElementById('skill-switch-menu');
    if (!skillMenu.classList.contains('skill-sw-hidden') && !skillMenu.contains(e.target)) {
      _hideSkillSwitchMenu();
    }
    const invMenu = document.getElementById('inv-context-menu');
    if (!invMenu.classList.contains('inv-ctx-hidden') && !invMenu.contains(e.target)) {
      _hideContextMenu();
    }
  });
}

// Development button — close inventory and open char-dev for same member
document.getElementById('equip-char-dev').addEventListener('click', () => {
  if (activeCharIndex !== null) {
    if (party[activeCharIndex].isDead) return;
    const idx = activeCharIndex;
    closeModal();
    openCharDevModal(idx);
  }
});



/**
 * Public helper to add an item to a specific character's inventory.
 * Returns true if successful, false if inventory is full.
 */
export function addItemToInventory(charIndex, itemName) {
  const m = party[charIndex];
  if (!m || m.isEmpty) return false;

  // Item definitions expect a name and its default slot
  const def = getItemDef(itemName);
  if (!def) return false;

  const freeIndex = m.inventory.indexOf(null);
  if (freeIndex === -1) return false;

  m.inventory[freeIndex] = { name: itemName, slot: def.slot };
  return true;
}

// ─────────────────────────────────────────────
//  PUBLIC INIT
// ─────────────────────────────────────────────
export function initEquipment() {
  extendPartyData();
  buildInventoryGrid();
  attachPaperdollListeners();
  attachBarTooltipListeners();
  attachCardListeners();
  attachOverlayListeners();
  attachCharDevListeners();

  // Sort button
  const sortBtn = document.getElementById('inv-sort-btn');
  if (sortBtn) sortBtn.addEventListener('click', _sortInventory);

  // Drop confirmation buttons
  const dropYes = document.getElementById('drop-confirm-yes');
  const dropNo = document.getElementById('drop-confirm-no');
  if (dropYes) dropYes.addEventListener('click', _confirmDrop);
  if (dropNo) dropNo.addEventListener('click', _hideDropConfirm);
}

function attachCharDevListeners() {
  // Equip Skill Tabs
  document.querySelectorAll('#equip-skill-tabs .skill-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#equip-skill-tabs .skill-tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      _equipSkillTab = e.target.dataset.tab;
      if (activeCharIndex !== null) renderModal(activeCharIndex);
    });
  });

  // Char Dev Close
  const closeBtn = document.getElementById('char-dev-close');
  if (closeBtn) closeBtn.addEventListener('click', closeCharDevModal);

  // Char Dev Prev / Next — cycle through non-empty party members
  function navigateCharDev(direction) {
    if (activeCharDevIndex === null) return;
    const total = party.length;
    let idx = activeCharDevIndex;
    for (let i = 0; i < total - 1; i++) {
      idx = (idx + direction + total) % total;
      if (!party[idx].isEmpty) {
        openCharDevModal(idx);
        return;
      }
    }
  }

  const prevBtn = document.getElementById('char-dev-prev');
  const nextBtn = document.getElementById('char-dev-next');
  if (prevBtn) prevBtn.addEventListener('click', () => navigateCharDev(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateCharDev(1));

  // Confirm Level Up — apply chosen tree node
  const confirmBtn = document.getElementById('char-dev-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeCharDevIndex === null) return;
      const m = party[activeCharDevIndex];
      if (!m || m.isEmpty || (m.pendingNodePicks ?? 0) <= 0) return;
      if (!m.pendingNodeChoice) return;

      const tree = getSkillTree(m.skillTreeId);
      if (!tree) return;
      const node = tree.nodes.find(n => n.id === m.pendingNodeChoice);
      if (!node) return;

      // Apply node benefit and record it
      applyNodeBenefit(m, node);
      if (!m.acquiredNodes) m.acquiredNodes = ['start'];
      m.acquiredNodes.push(m.pendingNodeChoice);
      m.pendingNodePicks = (m.pendingNodePicks ?? 1) - 1;
      m.pendingNodeChoice = null;

      updateEffectiveStats(m);

      if ((m.pendingNodePicks ?? 0) > 0) {
        // More picks remaining — re-render and stay open
        renderCharDevModal(activeCharDevIndex);
        refreshPartyCards();
      } else {
        // All picks used — finalize
        m.pendingLevelUp = false;
        playLevelUpConfirmSound();

        const messages = [
          `${m.name} has grown in power!`,
          `${m.name} feels a surge of new energy!`,
          `${m.name} has mastered new techniques!`,
          `${m.name} becomes even more formidable!`,
          `${m.name} ascends to new heights!`
        ];
        showMessage(messages[Math.floor(Math.random() * messages.length)]);
        closeCharDevModal();
      }
    });
  }
}

// ─────────────────────────────────────────────
//  PARCHMENT READING
// ─────────────────────────────────────────────

function _readParchment(memberIndex, invIndex, def) {
  const overlay = document.getElementById('parchment-overlay');
  const body = document.getElementById('parchment-body');
  const title = document.getElementById('parchment-title');
  
  if (!overlay || !body) return;
  
  title.textContent = def.name || 'Parchment';
  body.innerHTML = '';
  
  if (def.parchmentType === 'minor-potions' || def.parchmentType === 'party-potions') {
    const isParty = def.parchmentType === 'party-potions';
    let html = `<p style="margin-bottom: 20px;"><em>The following recipes for alchemical ${isParty ? 'party ' : ''}concoctions have been inscribed:</em></p>`;

    POTIONS.forEach(p => {
      // Filter based on parchment type
      if (isParty && !p.partyPotion) return;
      if (!isParty && p.partyPotion) return;

      html += `<div style="margin-bottom: 15px;">`;
      html += `<strong style="font-size: 1.1em; color: #5a2a1a;">${p.name}</strong><br/>`;
      if (p.ingredients && p.ingredients.length > 0) {
        html += `<div style="margin: 5px 0;">`;
        p.ingredients.forEach(ing => {
          html += `• ${ing.quantity}x ${ing.name}<br/>`;
        });
        html += `</div>`;
      } else {
        html += `• Unknown ingredients<br/>`;
      }
      html += `</div>`;
    });
    body.innerHTML = html;
  } else if (def.parchmentType === 'potions') {
    let html = `<p style="margin-bottom: 20px;"><em>The following alchemical recipes have been inscribed:</em></p>`;
    POTIONS.forEach(p => {
      if (p.partyPotion) return;
      if (p.name.startsWith('Minor')) return;
      html += `<div style="margin-bottom: 15px;">`;
      html += `<strong style="font-size: 1.1em; color: #5a2a1a;">${p.name}</strong><br/>`;
      if (p.ingredients && p.ingredients.length > 0) {
        html += `<div style="margin: 5px 0;">`;
        p.ingredients.forEach(ing => {
          html += `• ${ing.quantity}x ${ing.name}<br/>`;
        });
        html += `</div>`;
      } else {
        html += `• Unknown ingredients<br/>`;
      }
      html += `</div>`;
    });
    body.innerHTML = html;
  } else if (def.parchmentType === 'forge-armour' || def.parchmentType === 'forge-weapons') {
    const isWeapons = def.parchmentType === 'forge-weapons';
    const weaponNames = new Set(WEAPONS.map(w => w.name));
    const label = isWeapons ? 'weapons' : 'armour';
    let html = `<p style="margin-bottom: 20px;"><em>The following secrets of forging magical ${label} have been inscribed:</em></p>`;
    FORGE.forEach(item => {
      const isWeapon = weaponNames.has(item.name);
      if (isWeapons && !isWeapon) return;
      if (!isWeapons && isWeapon) return;
      html += `<div style="margin-bottom: 15px;">`;
      html += `<strong style="font-size: 1.1em; color: #5a2a1a;">${item.name}</strong><br/>`;
      if (item.ingredients && item.ingredients.length > 0) {
        html += `<div style="margin: 5px 0;">`;
        item.ingredients.forEach(ing => {
          html += `• ${ing.quantity}x ${ing.name}<br/>`;
        });
        html += `</div>`;
      } else {
        html += `• Unknown ingredients<br/>`;
      }
      html += `</div>`;
    });
    body.innerHTML = html;
  } else if (def.parchmentType === 'essence-recipe' && def.recipeName) {
    const item = FORGE.find(r => r.name === def.recipeName);
    let html = `<p style="margin-bottom: 20px;"><em>The following ancient monster-crafted recipe has been deciphered:</em></p>`;
    if (item) {
      html += `<div style="margin-bottom: 15px;">`;
      html += `<strong style="font-size: 1.1em; color: #5a2a1a;">${item.name}</strong><br/>`;
      if (item.ingredients && item.ingredients.length > 0) {
        html += `<div style="margin: 5px 0;">`;
        item.ingredients.forEach(ing => {
          html += `• ${ing.quantity}x ${ing.name}<br/>`;
        });
        html += `</div>`;
      } else {
        html += `• Unknown ingredients<br/>`;
      }
      html += `</div>`;
    } else {
      html += `<p>${def.description || 'The parchment is blank.'}</p>`;
    }
    body.innerHTML = html;
  } else {
    body.innerHTML = `<p>${def.description || 'The parchment is blank.'}</p>`;
  }
  
  overlay.style.display = 'flex';
  
  const closeBtn = document.getElementById('parchment-close');
  const closeBtn2 = document.getElementById('parchment-close-btn');
  const hideFn = () => { overlay.style.display = 'none'; };
  if (closeBtn) closeBtn.onclick = hideFn;
  if (closeBtn2) closeBtn2.onclick = hideFn;
}

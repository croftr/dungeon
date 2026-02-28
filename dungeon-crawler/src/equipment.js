import { party, refreshPartyCards, lastAttackTimes, setHp, setMp, setSp, drawPortrait, applyStatusEffect, addGold, getAttackSpeedMultiplier } from './party.js';
import { getItemDef } from './items.js';
import { SPELLS } from './spells.js';
import { ACTIONS } from './items.js';
import SKILLS_DATA from './data/skills.json';
import { playAction } from './actions.js';
import { attackMonster, monsters, getInRangeMonster, setHuntersEyeTarget, getHuntersEyeTargetId } from './monster.js';
import { showMessage } from './minimap.js';
import { dropMember } from './recruits.js';
import { isInFrontOfPlayer } from './player.js';
import { isAlchemyModalOpen, addItemToAlchemy } from './objects.js';
import { canMelee, resolveSkillMagnitude, resolveSpellMagnitude } from './combat-rules.js';
import { playCritSound, playSkillSound } from './audio.js';
import { addLogEntry } from './battle-log.js';
import { skillsState } from './skills-state.js';
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
  triggerDefaultSpellEffect,
  triggerDefaultSkillEffect,
} from './quarks-intro.js';

// Maps spell attackType → VFX + sound. Add new entries here as spells grow.
function _dispatchSpellVFX(attackType) {
  switch (attackType) {
    case 'fireball':
      triggerFireballEffect();
      // fireball audio already handled by playActionSound inside playAction
      break;
    case 'regenerate':
      playSkillSound('cure');
      triggerRegenerationEffect();
      break;
    case 'cure-poison':
      playSkillSound('cure');
      triggerCurePoisonEffect();
      break;
    case 'heal':
      playSkillSound('heal');
      triggerHolyRadianceEffect();
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
const SLOT_KEYS = [
  'head', 'cloak', 'neck', 'chest',
  'leftHand', 'rightHand',
  'belt', 'hands',
  'ring1', 'ring2',
  'legs', 'feet', 'ammo', 'skill',
];

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
  // skillBonuses accumulates flat additions to formula-resolved skill magnitudes.
  // Keys: "all" (every skill), or a skill type string e.g. "healing", "buff", "debuff".
  const newSkillBonuses = {};
  const countedItems = new Set();

  Object.values(m.equipment || {}).forEach(item => {
    if (item && !countedItems.has(item)) {
      countedItems.add(item);
      const def = getItemDef(item.name);
      if (!def) return;

      // Preferred: structured statBonuses object  { vitality: 1, intelligence: 2, … }
      // This is the general-purpose data-driven approach — add a statBonuses entry to
      // any item definition and it will be applied automatically when equipped.
      if (def.statBonuses) {
        Object.entries(def.statBonuses).forEach(([stat, delta]) => {
          if (newStats[stat] !== undefined) {
            newStats[stat] += delta;
          }
        });
      } else if (def.statChange) {
        // Legacy fallback: parse a human-readable string like "+1 Vitality"
        const match = def.statChange.match(/([+-]?\d+)\s+([a-zA-Z]+)/);
        if (match) {
          const val = parseInt(match[1], 10);
          const statName = match[2].toLowerCase();
          if (newStats[statName] !== undefined) {
            newStats[statName] += val;
          }
        }
      }

      // skillBonuses: flat additions to formula-resolved skill magnitudes.
      // Add a skillBonuses entry to any item definition to boost skill potency.
      if (def.skillBonuses) {
        Object.entries(def.skillBonuses).forEach(([key, delta]) => {
          newSkillBonuses[key] = (newSkillBonuses[key] ?? 0) + delta;
        });
      }
    }
  });

  m.stats = newStats;
  m.skillBonuses = newSkillBonuses;
}

export function extendPartyData() {
  party.forEach((m) => {
    if (m.isEmpty) return;
    if (m.isDead === undefined) m.isDead = false;

    if (!m.baseStats && m.stats) {
      m.baseStats = { ...m.stats };
    }

    if (m.equipment) {
      updateEffectiveStats(m);
      return; // Already initialized
    }

    // All slots empty by default
    m.equipment = Object.fromEntries(SLOT_KEYS.map((k) => [k, null]));
    // Every character starts with a Shawl on their head
    m.equipment.head = { name: 'Shawl', slot: 'head' };
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
      const slot = def?.slot ?? 'leftHand';
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
      const slot = def?.slot ?? 'rightHand';
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
    if (m.startingSkill) {
      const skillDef = (m.skills ?? []).find((s) => s.name === m.startingSkill);
      m.equipment.skill = { name: m.startingSkill, slot: 'skill', icon: skillDef?.icon ?? null };
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

    if (m.equipment.leftHand?.name === 'Spellbook' || m.equipment.rightHand?.name === 'Spellbook') {
      // Merlin (and others) must now learn Fireball before it appears as default
      if (m.spells.some(s => s.name === 'Fireball')) {
        m.selectedSpell = 'Fireball';
      } else if (m.spells.length > 0) {
        m.selectedSpell = m.spells[0].name;
      } else {
        m.selectedSpell = null;
      }
    }

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
    containerEl.innerHTML = `<img src="${iconSrc}" alt="${item.name}" draggable="false" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;" />`;
  } else {
    containerEl.innerHTML = `<span>${item.name}</span>`;
  }
}

function renderModal(memberIndex) {
  const m = party[memberIndex];

  // Header name
  document.getElementById('equip-char-name').textContent = m.name;

  // ── Paperdoll slots ──
  // For bothHands items the same object sits in both leftHand and rightHand.
  // We show the name in full on the primary (leftHand) slot and faded on rightHand.
  SLOT_KEYS.forEach((key) => {
    const el = document.getElementById(`pd-${key}`);
    const item = m.equipment[key];
    const isBothHands = item?.slot === 'bothHands';
    const isSecondary = isBothHands && key === 'rightHand';
    el.classList.toggle('occupied', item !== null);
    el.classList.toggle('both-hands-secondary', isSecondary);
    const pdItemEl = el.querySelector('.pd-item') || el;
    renderItemIcon(item, pdItemEl);
  });

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
  Object.values(m.equipment).forEach(item => {
    if (item && !countedItems.has(item)) {
      countedItems.add(item);
      const def = getItemDef(item.name);
      if (def?.defence) {
        totalDef += def.defence;
      }
    }
  });
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

    if (skills.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'skill-empty';
      empty.textContent = 'No skills learned.';
      skillsEl.appendChild(empty);
    } else {
      skills.forEach((skill) => {
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

      // Switch character on click
      memEl.onclick = () => {
        if (i !== activeIndex) openModal(i);
      };

      // Drag and Drop targets (for transferring items)
      memEl.addEventListener('dragover', (e) => {
        if (i === activeIndex) return; // Can't drop on yourself
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
        if (data.fromChar === i) return; // safety
        transferItem(data.fromChar, i, data.invIndex);
      });
    }

    bar.appendChild(memEl);
  });
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

function positionTooltip(mouseX, mouseY) {
  const panel = document.getElementById('item-detail-panel');
  const pw = panel.offsetWidth || 190;
  const ph = panel.offsetHeight || 120;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default: place to the right and below cursor
  let x = mouseX + TOOLTIP_OFFSET_X;
  let y = mouseY + TOOLTIP_OFFSET_Y;

  // Flip left if it would overflow the right edge
  if (x + pw > vw - 8) x = mouseX - pw - TOOLTIP_OFFSET_X;
  // Flip up if it would overflow the bottom edge
  if (y + ph > vh - 8) y = mouseY - ph - TOOLTIP_OFFSET_Y;

  panel.style.left = x + 'px';
  panel.style.top = y + 'px';
}

function populateTooltip(obj) {
  if (!obj) return;
  const isSkill = !!obj.isSkill;
  const isCustom = !!obj.isCustom;
  const nameEl = document.getElementById('item-detail-name');
  const slotEl = document.getElementById('item-detail-slot');
  const actionEl = document.getElementById('item-detail-action');
  const descEl = document.getElementById('item-detail-desc');
  const statsEl = document.getElementById('item-detail-stats');

  nameEl.textContent = obj.name;

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
            <span>Block Chance</span>
            <span id="item-detail-block">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-scaling">
            <span>Scales with</span>
            <span id="item-detail-scaling">—</span>
        </div>
        <div id="detail-row-scaling-bar">
            <div id="item-detail-scaling-bar"></div>
        </div>
        <div class="detail-stat-row" id="detail-row-statchange">
            <span>Stat Change</span>
            <span id="item-detail-statchange">—</span>
        </div>
        <div class="detail-stat-row" id="detail-row-skillbonus">
            <span style="font-size:8px">Skill Bonuses</span>
            <span id="item-detail-skillbonus" style="font-size:8px; text-align:right">—</span>
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
            <span>Market Value</span>
            <span id="item-detail-value">—</span>
        </div>
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

  const isAmmo = (def?.slot === 'ammo');
  const isSpellbook = (def?.type === 'spellbook');
  const hasDefence = !isAmmo && def?.defence != null && def.defence > 0;
  const hasBlock = !isAmmo && def?.blockChance != null && def.blockChance > 0;
  const hasScaling = !isAmmo && def?.statWeights != null && def?.attackType != null;
  const hasStatChange = def?.statChange != null || (isSpellbook && def?.requiredInt);
  const hasSkillBonus = def?.skillBonuses && Object.keys(def.skillBonuses).length > 0;

  // Hide/show rows based on item type and available stats
  document.getElementById('detail-row-damage').style.display = (isAmmo || isSpellbook) ? 'none' : 'flex';
  document.getElementById('detail-row-scaling').style.display = hasScaling ? 'flex' : 'none';
  document.getElementById('detail-row-scaling-bar').style.display = hasScaling ? 'block' : 'none';
  document.getElementById('detail-row-defence').style.display = hasDefence ? 'flex' : 'none';
  document.getElementById('detail-row-block').style.display = hasBlock ? 'flex' : 'none';
  document.getElementById('detail-row-value').style.display = isAmmo ? 'none' : 'flex';
  document.getElementById('detail-row-weight').style.display = isAmmo ? 'none' : 'flex';
  document.getElementById('detail-row-statchange').style.display = hasStatChange ? 'flex' : 'none';
  document.getElementById('detail-row-skillbonus').style.display = hasSkillBonus ? 'flex' : 'none';
  document.getElementById('detail-row-ammo-mod').style.display = isAmmo ? 'flex' : 'none';
  document.getElementById('detail-row-ammo-type').style.display = isAmmo ? 'flex' : 'none';

  const slotLabelEl = document.getElementById('detail-row-statchange').querySelector('span:first-child');
  slotLabelEl.textContent = isSpellbook ? 'Requires' : 'Stat Change';

  slotEl.textContent = isSpellbook ? 'Type: Spellbook' : ('Slot: ' + (SLOT_LABELS[def?.slot ?? obj.slot] ?? obj.slot));

  if (isSpellbook) {
    actionEl.textContent = 'Learns: ' + (def.spellName || 'None');
  } else {
    actionEl.textContent = def?.attackType ? 'Attack: ' + def.attackType.charAt(0).toUpperCase() + def.attackType.slice(1) : '';
  }

  descEl.textContent = def?.description ?? '—';

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
    document.getElementById('item-detail-value').textContent =
      def != null ? def.value + ' gp' : '—';
    document.getElementById('item-detail-weight').textContent =
      def != null ? def.weight + ' kg' : '—';
    if (isSpellbook) {
      document.getElementById('item-detail-statchange').textContent = def.requiredInt + ' Intelligence';
      document.getElementById('item-detail-statchange').style.color = '#ff8080';
    } else if (hasStatChange) {
      document.getElementById('item-detail-statchange').textContent = def.statChange;
      document.getElementById('item-detail-statchange').style.color = '#60c060';
    }

    if (hasSkillBonus) {
      // Format each bonus entry: type keys get a readable label, named skills show as-is
      const BONUS_LABELS = { all: 'All Skills', healing: 'Healing', buff: 'Buff', debuff: 'Debuff' };
      const parts = Object.entries(def.skillBonuses).map(([key, val]) => {
        const label = BONUS_LABELS[key] ?? key;
        return `${label} +${val}`;
      });
      document.getElementById('item-detail-skillbonus').textContent = parts.join(' · ');
    }
  }

  // Stat-scaling display — shows which stats drive physical damage
  if (hasScaling) {
    const { str = 0, dex = 0 } = def.statWeights;
    const scalingEl = document.getElementById('item-detail-scaling');
    const barEl = document.getElementById('item-detail-scaling-bar');

    // Text label — coloured to match the dominant stat
    if (dex === 0) {
      scalingEl.textContent = 'Strength';
      scalingEl.style.color = '#e07030'; // orange
    } else if (str === 0) {
      scalingEl.textContent = 'Dexterity';
      scalingEl.style.color = '#30b8c0'; // teal
    } else {
      const sPct = Math.round(str * 100);
      const dPct = Math.round(dex * 100);
      scalingEl.innerHTML =
        `<span style="color:#e07030">STR ${sPct}%</span>` +
        ` <span style="color:#7a6a50">·</span> ` +
        `<span style="color:#30b8c0">DEX ${dPct}%</span>`;
      scalingEl.style.color = ''; // reset so child spans control colour
    }

    // Gradient bar: orange = STR portion, teal = DEX portion
    const pct = Math.round(str * 100);
    if (dex === 0) {
      barEl.style.background = 'linear-gradient(90deg, #b04818, #e07030)';
    } else if (str === 0) {
      barEl.style.background = 'linear-gradient(90deg, #1890a0, #30b8c0)';
    } else {
      barEl.style.background =
        `linear-gradient(90deg, #e07030 0%, #e07030 ${pct}%, #30b8c0 ${pct}%, #30b8c0 100%)`;
    }
  }
}

export function showTooltip(item, mouseX, mouseY) {
  if (!item) { hideTooltip(); return; }
  populateTooltip(item);
  const panel = document.getElementById('item-detail-panel');
  panel.classList.remove('detail-hidden');
  positionTooltip(mouseX, mouseY);
}

export function hideTooltip() {
  document.getElementById('item-detail-panel').classList.add('detail-hidden');
}

/** Attach hover tooltip listeners to any hoverable item element.
 *  getItem() is called each time to get the current item (may change). */
export function attachTooltipListeners(el, getItem) {
  // Remove any existing listeners first
  if (el._tooltipCleanup) {
    el._tooltipCleanup();
    delete el._tooltipCleanup;
  }

  const onEnter = (e) => {
    const item = getItem();
    if (item) showTooltip(item, e.clientX, e.clientY);
  };

  const onMove = (e) => {
    const item = getItem();
    if (item) {
      // Keep tooltip populated and repositioned as cursor moves
      populateTooltip(item);
      const panel = document.getElementById('item-detail-panel');
      panel.classList.remove('detail-hidden');
      positionTooltip(e.clientX, e.clientY);
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
 * appropriate equipment slot (handles bothHands, enable-spell, and
 * regular slots). Shared by left-click and the context menu.
 */
function _equipItem(memberIndex, invIndex) {
  const m = party[memberIndex];
  let item = m.inventory[invIndex];
  if (!item) return;

  m.inventory[invIndex] = null;

  if (item.slot === 'bothHands') {
    const displaced = [m.equipment.leftHand, m.equipment.rightHand]
      .filter((d) => d !== null)
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
      .filter((d) => d.slot !== 'spell' || d.name === 'Spellbook');

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

    if (displaced.some(d => d.name === 'Spellbook')) m.selectedSpell = null;

    displaced.forEach((d) => {
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
    });
  } else if (item.slot === 'enable-spell') {
    const displaced = [m.equipment.leftHand, m.equipment.rightHand]
      .filter((d) => d !== null)
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
      .filter((d) => d.slot !== 'spell' || d.name === 'Spellbook');

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
    // We no longer automatically afford Fireball. The off-hand remains free for a Spellbook.
    m.equipment.rightHand = null;

    if (displaced.some(d => d.name === 'Spellbook')) m.selectedSpell = null;

    displaced.forEach((d) => {
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
    });
  } else if (item.slot === 'spell') {
    let targetSlot = null;
    if (m.equipment.leftHand?.slot === 'enable-spell') targetSlot = 'rightHand';
    else if (m.equipment.rightHand?.slot === 'enable-spell') targetSlot = 'leftHand';

    if (!targetSlot) {
      const cell = document.querySelector(`.inv-cell[data-index="${invIndex}"]`);
      if (cell) {
        cell.style.borderColor = '#c04040';
        setTimeout(() => { cell.style.borderColor = ''; }, 400);
      }
      m.inventory[invIndex] = item;
      return;
    }

    let currentlyWorn = m.equipment[targetSlot];
    const displaced = [];
    if (currentlyWorn && currentlyWorn.name === 'Spellbook') displaced.push(currentlyWorn);
    else if (currentlyWorn && currentlyWorn.slot !== 'spell') displaced.push(currentlyWorn);

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

    if (displaced.some(d => d.name === 'Spellbook')) m.selectedSpell = null;

    displaced.forEach((d) => {
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
    });
  } else {
    // ── Smart ring-slot assignment ──────────────────────────────────────────
    // If the item targets a ring slot but that slot is already occupied and the
    // other ring slot is empty, automatically redirect to the free slot instead.
    // This lets the player fill both ring slots without needing to know slot names.
    const RING_PAIRS = { ring1: 'ring2', ring2: 'ring1' };
    if (item.slot in RING_PAIRS && m.equipment[item.slot] !== null && m.equipment[RING_PAIRS[item.slot]] === null) {
      item = { ...item, slot: RING_PAIRS[item.slot] };
    }

    const displaced = [];
    let currentlyWorn = m.equipment[item.slot];
    let otherSlotCleared = null;

    if (currentlyWorn?.slot === 'enable-spell') {
      const spellHand = item.slot === 'leftHand' ? 'rightHand' : 'leftHand';
      const pairedSpell = m.equipment[spellHand];
      if (pairedSpell?.slot === 'spell') {
        if (pairedSpell.name === 'Spellbook') displaced.push(pairedSpell);
        otherSlotCleared = spellHand;
      }
    } else if (currentlyWorn?.slot === 'spell') {
      const wandHand = item.slot === 'leftHand' ? 'rightHand' : 'leftHand';
      const pairedWand = m.equipment[wandHand];
      if (pairedWand?.slot === 'enable-spell') {
        displaced.push(pairedWand);
        otherSlotCleared = wandHand;
      }
      if (currentlyWorn.name === 'Spellbook') displaced.push(currentlyWorn);
      currentlyWorn = null;
    }

    if (currentlyWorn && (currentlyWorn.slot !== 'spell' || currentlyWorn.name === 'Spellbook')) {
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

    if (otherSlotCleared) m.equipment[otherSlotCleared] = null;
    m.equipment[item.slot] = item;

    if (displaced.some(d => d.name === 'Spellbook')) m.selectedSpell = null;

    displaced.forEach((d) => {
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = { name: d.name, slot: d.slot };
    });
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

  // If no spell is selected yet and they have a Spellbook equipped, auto-select this one
  if (!m.selectedSpell) {
    const hasSpellbook =
      m.equipment?.leftHand?.name === 'Spellbook' ||
      m.equipment?.rightHand?.name === 'Spellbook';
    if (hasSpellbook) m.selectedSpell = spellDef.name;
  }

  // Consume the scroll
  m.inventory[invIndex] = null;

  playSkillSound('magic');
  showMessage(`${m.name} learns ${def.spellName}!`);

  renderModal(memberIndex);
  refreshPartyCards();
}

function _usePotion(memberIndex, invIndex) {
  const m = party[memberIndex];
  const item = m.inventory[invIndex];
  if (!item) return;

  const def = getItemDef(item.name);
  if (!def || def.type !== 'potion' || !def.effect) return;

  const { type, value } = def.effect;
  let msg = '';
  let sound = 'heal';

  switch (type) {
    case 'heal':
    case 'restore-hp': {
      const oldHp = m.hp;
      const newHp = Math.min(m.hpMax, m.hp + (value || 0));
      setHp(m.id, newHp);
      msg = `restores ${newHp - oldHp} HP`;
      sound = 'heal';
      break;
    }
    case 'restore-mp': {
      const oldMp = m.mp;
      const newMp = Math.min(m.mpMax, m.mp + (value || 0));
      setMp(m.id, newMp);
      msg = `restores ${newMp - oldMp} MP`;
      sound = 'magic';
      break;
    }
    case 'restore-sp': {
      const oldSp = m.sp;
      const newSp = Math.min(m.spMax ?? 100, m.sp + (value || 0));
      setSp(m.id, newSp);
      msg = `restores ${newSp - oldSp} SP`;
      sound = 'magic';
      break;
    }
    case 'cure-poison': {
      const hadPoison = (m.activeDebuffs || []).some(d => d.effectId === 'poison');
      m.activeDebuffs = (m.activeDebuffs || []).filter(d => d.effectId !== 'poison');
      msg = hadPoison ? `is cured of poison` : 'feels refreshed';
      sound = 'cure';
      break;
    }
    default:
      console.warn(`Unknown potion effect type: ${type}`);
      return;
  }

  showMessage(`${m.name} drinks ${item.name} and ${msg}.`);
  if (sound) playSkillSound(sound);

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
  if (def?.type === 'potion') {
    _usePotion(activeCharIndex, invIndex);
    return;
  }

  _equipItem(activeCharIndex, invIndex);
}

/** Right-click on an inventory cell → open the context menu. */
function onInventoryCellContextMenu(e) {
  if (activeCharIndex === null) return;
  const invIndex = Number(e.currentTarget.dataset.index);
  const m = party[activeCharIndex];
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
  const m = party[activeCharIndex];
  const item = m.inventory[invIndex];
  const def = item ? getItemDef(item.name) : null;

  // ── Sell button (loot items only) ──
  const sellBtn = document.getElementById('inv-ctx-sell');
  const alchemyBtn = document.getElementById('inv-ctx-alchemy'); // We need to add this to the HTML

  // Reset all buttons
  if (useBtn) useBtn.style.display = 'none';
  equipBtn.style.display = 'none';
  learnBtn.style.display = 'none';
  if (sellBtn) sellBtn.style.display = 'none';

  if (def?.type === 'potion') {
    if (useBtn) {
      useBtn.style.display = 'block';
      useBtn.onclick = () => {
        _usePotion(activeCharIndex, _ctxInvIndex);
        _hideContextMenu();
      };
    }
    // Potions are also sellable
    if (sellBtn) {
      sellBtn.style.display = 'block';
      sellBtn.onclick = () => {
        const sellItem = party[activeCharIndex]?.inventory[_ctxInvIndex];
        if (sellItem) {
          const sellDef = getItemDef(sellItem.name);
          const goldValue = sellDef?.value ?? 0;
          party[activeCharIndex].inventory[_ctxInvIndex] = null;
          addGold(goldValue);
          showMessage(`Sold ${sellItem.name} for ${goldValue} gold.`);
          renderModal(activeCharIndex);
        }
        _hideContextMenu();
      };
    }
  } else if (def?.slot === 'loot') {
    if (sellBtn) {
      sellBtn.style.display = 'block';
      sellBtn.onclick = () => {
        const sellItem = party[activeCharIndex]?.inventory[_ctxInvIndex];
        if (sellItem) {
          const sellDef = getItemDef(sellItem.name);
          const goldValue = sellDef?.value ?? 0;
          party[activeCharIndex].inventory[_ctxInvIndex] = null;
          addGold(goldValue);
          showMessage(`Sold ${sellItem.name} for ${goldValue} gold.`);
          renderModal(activeCharIndex);
        }
        _hideContextMenu();
      };
    }
  } else if (def?.type === 'spellbook') {
    learnBtn.style.display = 'block';
    learnBtn.onclick = () => {
      _learnSpell(activeCharIndex, _ctxInvIndex);
      _hideContextMenu();
    };
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

function _showSkillSwitchMenu(x, y, memberIndex, mode) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;

  const items = mode === 'skill' ? (m.skills || []) : (m.spells || []);
  if (!items.length) return;

  _skillSwMenuCtx = { memberIndex, mode };

  const menu = document.getElementById('skill-switch-menu');
  menu.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'skill-sw-header';
  header.textContent = mode === 'skill' ? 'Switch Skill' : 'Switch Spell';
  menu.appendChild(header);

  const currentName = mode === 'skill'
    ? m.equipment?.skill?.name
    : m.selectedSpell;

  items.forEach(item => {
    const isActive = item.name === currentName;
    const row = document.createElement('div');
    row.className = 'skill-sw-item' + (isActive ? ' skill-sw-active' : '');

    if (item.icon) {
      const img = document.createElement('img');
      img.src = item.icon;
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
      if (mode === 'skill') {
        m.equipment.skill = { name: item.name, slot: 'skill', icon: item.icon };
      } else {
        m.selectedSpell = item.name;
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
  const item = m.equipment[key];
  if (!item) return; // empty slot — nothing to do

  if (item.slot === 'spell' && item.name !== 'Spellbook') return; // Cannot manually unequip other spells

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
  } else if (item.slot === 'enable-spell') {
    const spellSlot = key === 'leftHand' ? 'rightHand' : 'leftHand';
    const carriedSpell = m.equipment[spellSlot];
    if (carriedSpell?.slot === 'spell') {
      if (carriedSpell.name === 'Spellbook') displaced.push(carriedSpell);
      otherSlotCleared = spellSlot;
    }
  }

  const freeSlots = m.inventory.filter(i => i === null).length;
  if (displaced.length > freeSlots) {
    e.currentTarget.style.borderColor = '#c04040';
    setTimeout(() => { e.currentTarget.style.borderColor = ''; }, 400);
    return;
  }

  if (otherSlotCleared) m.equipment[otherSlotCleared] = null;
  m.equipment[key] = null;

  if (displaced.some(d => d.name === 'Spellbook')) {
    m.selectedSpell = null;
  }

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

  if (item.name === 'Spellbook') {
    e.preventDefault();
    hideTooltip();
    _openSpellSelectionModal(activeCharIndex, key);
  }
}

// ─────────────────────────────────────────────
//  OPEN / CLOSE
// ─────────────────────────────────────────────
function openModal(memberIndex) {
  activeCharIndex = memberIndex;
  hideTooltip();
  document.getElementById('equip-overlay').classList.remove('equip-hidden');
  renderModal(memberIndex);
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
//  SPELL SELECTION MODAL
// ─────────────────────────────────────────────
function _openSpellSelectionModal(charIndex, itemKey) {
  const overlay = document.getElementById('spell-selection-overlay');
  const grid = document.getElementById('spell-sel-grid');

  overlay.classList.remove('spell-sel-hidden');

  const m = party[charIndex];
  const learnedSpells = m.spells || [];

  grid.innerHTML = '';

  if (learnedSpells.length === 0) {
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#7a6a50; font-size:12px; padding:20px; text-align:center; grid-column:1/-1;';
    msg.textContent = 'No spells learned. Study spell scrolls to learn spells.';
    grid.appendChild(msg);
    return;
  }

  // Show only spells this character has learned
  learnedSpells.forEach(spell => {
    const spellDef = SPELLS.find(s => s.name === spell.name);
    if (!spellDef) return;
    const isSelected = m.selectedSpell === spell.name;
    const div = document.createElement('div');
    div.className = 'spell-sel-slot' + (isSelected ? ' spell-sel-slot--active' : '');
    div.innerHTML = `<img src="${spellDef.icon}" />`;
    div.title = spellDef.name;
    div.onclick = () => {
      m.selectedSpell = spell.name;
      overlay.classList.add('spell-sel-hidden');
      renderModal(charIndex);
      refreshPartyCards();
    };
    grid.appendChild(div);
  });

  // Pad with empty slots so the grid always shows at least a couple of empties
  const totalSlots = Math.max(learnedSpells.length + 2, 6);
  for (let i = learnedSpells.length; i < totalSlots; i++) {
    const div = document.createElement('div');
    div.className = 'spell-sel-slot empty';
    div.innerHTML = 'Empty';
    grid.appendChild(div);
  }
}

document.getElementById('spell-sel-close').addEventListener('click', () => {
  document.getElementById('spell-selection-overlay').classList.add('spell-sel-hidden');
});

// Click outside spell selector -> close
document.getElementById('spell-selection-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'spell-selection-overlay') {
    e.target.classList.add('spell-sel-hidden');
  }
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

    const label = document.createElement('span');
    label.className = 'party-target-name';
    label.innerHTML = m.name + (isPoisoned ? ' <span class="party-target-poisoned">☠ Poisoned</span>' : '');

    btn.appendChild(canvas);
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      _closePartyTargetPicker();
      _executePartyMemberSpell(caster, casterIndex, hand, spellDef, m);
    });

    grid.appendChild(btn);
  });

  overlay.classList.remove('party-target-hidden');
}

/** Dispatcher for party-member targeted spells — routes to the correct handler. */
function _executePartyMemberSpell(caster, casterIndex, hand, spellDef, target) {
  // MP check (deducted here, after the player has confirmed their target choice)
  if (caster.mp < spellDef.mpCost) {
    showMessage(`${caster.name} does not have enough mana!`);
    return;
  }
  setMp(caster.id, caster.mp - spellDef.mpCost);

  // Record cooldown so the slot greys out normally
  const timeKey = (hand === 'skill') ? `${casterIndex}-skill` : `${casterIndex}-${hand}`;
  lastAttackTimes[timeKey] = performance.now();

  if (hand === 'skill') {
    const cd = (spellDef.delay ?? 15) * 1000;
    const ends = performance.now() + cd;
    if (spellDef.name === 'Heal') _healSkillCooldownEnds[casterIndex] = ends;
    _startSkillCooldownUI(casterIndex, ends);
  }

  refreshPartyCards();

  // Play the spell animation
  playAction(spellDef.attackType, hand);
  _dispatchSpellVFX(spellDef.attackType);

  if (spellDef.attackType === ACTIONS.CURE_POISON) {
    _executeCurePoison(caster, target);
  } else if (spellDef.attackType === ACTIONS.HEAL) {
    _executeHeal(caster, spellDef, target);
  } else if (spellDef.attackType === ACTIONS.REGENERATE) {
    _executeRegenerate(caster, spellDef, target);
  }
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

  // Strip all poison stacks from the target
  if (target.activeDebuffs) {
    target.activeDebuffs = target.activeDebuffs.filter(d => d.effectId !== 'poison');
  }

  const msg = hadPoison
    ? `${caster.name} casts <b>Cure Poison</b> on ${target.name} — venom purged!`
    : `${caster.name} casts <b>Cure Poison</b> on ${target.name}.`;
  showMessage(msg, 2500);

  addLogEntry({
    time: Date.now(),
    type: 'skill',
    actor: caster.name,
    skillName: 'Cure Poison',
    target: target.name,
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

function useHand(memberIndex, hand) {
  const m = party[memberIndex];
  if (!m) return;

  const slotKey = hand === 'left' ? 'leftHand' : 'rightHand';
  let item = m.equipment?.[slotKey];

  if (item && item.name === 'Spellbook' && m.selectedSpell) {
    item = { name: m.selectedSpell, slot: 'spell' };
  }

  const def = item ? getItemDef(item.name) : null;

  // Empty hand → punch; items with no attackType (e.g. Shield) → no action
  const attackType = item ? (def?.attackType ?? null) : ACTIONS.PUNCH;
  if (!attackType) return;

  // Cooldown validation
  const isBothHands = def?.slot === 'bothHands';
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
  const timeKey = isBothHands ? `${memberIndex}-left` : `${memberIndex}-${hand}`;
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
  if (def?.target === 'party-member') {
    _openPartyTargetPicker(m, memberIndex, hand, def);
    return;
  }

  const isRanged = attackType === ACTIONS.SHOOT || attackType === ACTIONS.FIREBALL;
  const isBuff = attackType === ACTIONS.REGENERATE;

  // Back-row members can only melee if their front partner is dead (stepped up).
  // canMelee() centralises this logic — see combat-rules.js.
  if (!isRanged && !isBuff && !canMelee(party, memberIndex)) {
    showMessage(`${m.name} is in the back row — only ranged attacks can reach the enemy!`);
    return;
  }

  const maxRange = isRanged ? 3 : 1;

  // Find the first alive monster that is in range and directly in front
  const target = isBuff ? null : monsters.find(
    t => t.alive && isInFrontOfPlayer(t.gridRow, t.gridCol, maxRange)
  );

  // Set the cooldown timer and force HUD re-render.
  // If `bothHands` weapon (e.g., Greatsword), set the cooldown for left hand, 
  // which is correctly polled by both HUD visual slots.

  // Apply mana cost if applicable
  const mpCost = def?.mpCost ?? 0;
  const isSpell = mpCost > 0; // spells / fireballs cost mana, not stamina
  if (isSpell) {
    if (m.mp < mpCost) {
      showMessage(`${m.name} does not have enough mana!`);
      return;
    }
    setMp(m.id, m.mp - mpCost);
  }

  // Physical attacks cost 5 SP; spells and skills do not
  // Whirlwind / War Dance buff: also prevents SP drain
  let spCost = 5;
  const wwActive = ww.active && ww.actorName === m.name && now < ww.expiresAt;
  const wdActive = skillsState.warDance.active && now < skillsState.warDance.expiresAt;

  if (wwActive || wdActive) {
    spCost = 0;
  }

  if (!isSpell && spCost > 0 && m.sp < spCost) {
    showMessage(`${m.name} is too exhausted to attack!`);
    return;
  }

  lastAttackTimes[timeKey] = now;
  if (!isSpell && spCost > 0) setSp(m.id, m.sp - spCost);
  refreshPartyCards();

  // Play the visual + audio animation regardless of whether a target exists
  playAction(attackType, hand);
  if (isSpell || isBuff) _dispatchSpellVFX(attackType);

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
    warcryMultiplier: result.formula?.warcryMultiplier ?? 1.0,
  });

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

// ── Dispatcher ────────────────────────────────────────────────────────────────
function useSkill(memberIndex) {
  const m = party[memberIndex];
  if (!m || m.isDead) return;

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
  if (skill.name === 'Heal') { _useHealSkill(m, memberIndex); return; }

  playSkillSound('magic');
  triggerDefaultSkillEffect();

  const def = getItemDef(skill.name);
  if (def && def.delay) {
    lastAttackTimes[`${memberIndex}-skill`] = performance.now();
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
  lastAttackTimes[`${memberIndex}-skill`] = now;
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
  skillsState.entangle.active = true;
  skillsState.entangle.targetId = target.id;
  skillsState.entangle.expiresAt = now + ENTANGLE_DURATION_MS;
  skillsState.entangle.magnitude = resolveSkillMagnitude('Entangle', SKILLS_DATA['Entangle'], member);
  _entangleCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

  playSkillSound('magic');
  triggerEntangleEffect();
  const entangleDelayStr = skillsState.entangle.magnitude.toFixed(1);
  showMessage(
    `<span style="color:#80ff80">✦ Entangle</span> — ${member.name} roots the ${target.name}! Monster attack delay ×${entangleDelayStr} for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Entangle', target: target.name });

  if (_entangleExpireTimer) clearTimeout(_entangleExpireTimer);
  _entangleExpireTimer = setTimeout(() => {
    skillsState.entangle.active = false;
    skillsState.entangle.targetId = null;
    showMessage(`<span style="color:#80ff80">Entangle</span> fades — the roots wither away.`, 2500);
    _entangleExpireTimer = null;
  }, ENTANGLE_DURATION_MS);

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
  skillsState.sunderArmor.active = true;
  skillsState.sunderArmor.targetId = target.id;
  skillsState.sunderArmor.expiresAt = now + SUNDER_ARMOR_DURATION_MS;
  skillsState.sunderArmor.magnitude = resolveSkillMagnitude('Sunder Armor', SKILLS_DATA['Sunder Armor'], member);
  _sunderArmorCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

  playSkillSound('render');
  triggerSunderArmorEffect();
  const sunderPct = Math.round((1 - skillsState.sunderArmor.magnitude) * 100);
  showMessage(
    `<span style="color:#ff8080">✦ Sunder Armor</span> — ${member.name} crushes the ${target.name}! Defence reduced by ${sunderPct}% for 30s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Sunder Armor', target: target.name });

  if (_sunderArmorExpireTimer) clearTimeout(_sunderArmorExpireTimer);
  _sunderArmorExpireTimer = setTimeout(() => {
    skillsState.sunderArmor.active = false;
    skillsState.sunderArmor.targetId = null;
    showMessage(`<span style="color:#ff8080">Sunder Armor</span> fades — the armor naturally mends.`, 2500);
    _sunderArmorExpireTimer = null;
  }, SUNDER_ARMOR_DURATION_MS);

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
  skillsState.berserk.active = true;
  skillsState.berserk.actorName = member.name;
  skillsState.berserk.expiresAt = now + BERSERK_DURATION_MS;
  skillsState.berserk.magnitude = resolveSkillMagnitude('Berserk', SKILLS_DATA['Berserk'], member);
  _berserkCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

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
  }, BERSERK_DURATION_MS);

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
  skillsState.warcry.active = true;
  skillsState.warcry.expiresAt = now + WARCRY_DURATION_MS;
  skillsState.warcry.magnitude = resolveSkillMagnitude('Warcry', SKILLS_DATA['Warcry'], member);
  _warcryCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

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
  }, WARCRY_DURATION_MS);

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
  // Activate the buff — magnitude resolved from the caster's current stats
  skillsState.sanctuary.active = true;
  skillsState.sanctuary.expiresAt = now + SANCTUARY_DURATION_MS;
  skillsState.sanctuary.magnitude = resolveSkillMagnitude('Sanctuary', SKILLS_DATA['Sanctuary'], member);
  _sanctuaryCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

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
  }, SANCTUARY_DURATION_MS);

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
  lastAttackTimes[`${memberIndex}-skill`] = now;

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

// ── Arcane Lantern (Merlin) ───────────────────────────────────────────────
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
  skillsState.arcaneLight.active = true;
  skillsState.arcaneLight.expiresAt = now + ARCANE_LANTERN_DURATION_MS;
  _arcaneLanternCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

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
  }, ARCANE_LANTERN_DURATION_MS);

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
  // Same duration and effect as Arcane Lantern
  skillsState.arcaneLight.active = true;
  skillsState.arcaneLight.expiresAt = now + ARCANE_LANTERN_DURATION_MS;
  _minersLightCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

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
  }, ARCANE_LANTERN_DURATION_MS);

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
  skillsState.warDance.active = true;
  skillsState.warDance.expiresAt = now + WAR_DANCE_DURATION_MS;
  skillsState.warDance.magnitude = resolveSkillMagnitude('War Dance', SKILLS_DATA['War Dance'], member);
  _warDanceCooldownEnd = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

  playSkillSound('berserk');
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
  }, WAR_DANCE_DURATION_MS);

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
  skillsState.whirlwind.active = true;
  skillsState.whirlwind.actorName = member.name;
  skillsState.whirlwind.expiresAt = now + WHIRLWIND_DURATION_MS;
  skillsState.whirlwind.magnitude = resolveSkillMagnitude('Whirlwind', SKILLS_DATA['Whirlwind'], member);
  _whirlwindCooldownEnds[memberIndex] = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

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
  }, WHIRLWIND_DURATION_MS);

  _startSkillCooldownUI(memberIndex, _whirlwindCooldownEnds[memberIndex]);
}

// ── True Shot (Baldur) ──────────────────────────────────────────────────
const TRUE_SHOT_COOLDOWN_MS = SKILLS_DATA['True Shot'].cooldownMs;
const TRUE_SHOT_DURATION_MS = SKILLS_DATA['True Shot'].durationMs;
let _trueShotCooldownEnds = [0, 0, 0, 0];
let _trueShotExpireTimers = [null, null, null, null];

function _useTrueShot(member, memberIndex) {
  const now = performance.now();
  if (now < _trueShotCooldownEnds[memberIndex]) {
    const remaining = Math.ceil((_trueShotCooldownEnds[memberIndex] - now) / 1000);
    showMessage(`<span style="color:#ffe080">True Shot</span> — ready in ${remaining}s`, 2000);
    return;
  }

  const def = getItemDef(member.equipment.skill.name);
  const delayMs = (def?.delay ?? 60) * 1000;
  skillsState.trueShot.active = true;
  skillsState.trueShot.actorName = member.name;
  skillsState.trueShot.expiresAt = now + TRUE_SHOT_DURATION_MS;
  _trueShotCooldownEnds[memberIndex] = now + delayMs;
  lastAttackTimes[`${memberIndex}-skill`] = now;

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
  }, TRUE_SHOT_DURATION_MS);

  _startSkillCooldownUI(memberIndex, _trueShotCooldownEnds[memberIndex]);
}

// ── Runic Scholar (Merlin) ────────────────────────────────────────────────
function _useRunicScholar(member, memberIndex) {
  // Toggle off if already primed (lets the player cancel the buff)
  if (member.runicScholarActive) {
    member.runicScholarActive = false;
    refreshPartyCards();
    showMessage(`<span style="color:#c080ff">Runic Scholar</span> — ${member.name} releases the charge.`, 2000);
    return;
  }

  member.runicScholarActive = true;
  member.runicScholarMagnitude = resolveSkillMagnitude('Runic Scholar', SKILLS_DATA['Runic Scholar'], member);
  refreshPartyCards(); // immediately lights up the skill slot glow

  playSkillSound('magic');
  triggerRunicScholarEffect();
  showMessage(
    `<span style="color:#c080ff">✦ Runic Scholar</span> — ${member.name} channels the runes! Next spell deals ×${member.runicScholarMagnitude.toFixed(1)} damage.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Runic Scholar' });
}

// ── Mana Tap (Merlin) ─────────────────────────────────────────────────────
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
  lastAttackTimes[`${memberIndex}-skill`] = now;
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
const HEAL_SKILL_COOLDOWN_MS = SKILLS_DATA['Heal'].cooldownMs;
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
function _startSkillCooldownUI(memberIndex, expiresAt) {
  const slotEl = document.getElementById(`slot-sk-${memberIndex}`);
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
    el.addEventListener('click', onPaperdollSlotClick);
    el.addEventListener('contextmenu', onPaperdollSlotContextMenu);
    // Hover tooltip for equipped items
    attachTooltipListeners(el, () => {
      if (activeCharIndex === null) return null;
      return party[activeCharIndex].equipment[key] ?? null;
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
        if (m.equipment?.leftHand?.name === 'Spellbook' && m.spells?.length) {
          _showSkillSwitchMenu(e.clientX, e.clientY, i, 'spell');
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
        if (m.equipment?.rightHand?.name === 'Spellbook' && m.spells?.length) {
          _showSkillSwitchMenu(e.clientX, e.clientY, i, 'spell');
        }
      });
    }

    const skSlot = document.getElementById(`slot-sk-${i}`);
    if (skSlot) {
      skSlot.addEventListener('click', (e) => {
        e.stopPropagation();
        useSkill(i);
      });
      skSlot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const m = party[i];
        if (!m || m.isEmpty) return;
        if (m.skills?.length) {
          _showSkillSwitchMenu(e.clientX, e.clientY, i, 'skill');
        }
      });
    }

  });
}

function attachOverlayListeners() {
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
    }

    // C key — open character inventory for the first available member
    if (e.key === 'c' || e.key === 'C') {
      if (activeCharIndex !== null) return; // already open
      const overlayOpen = ['tactics-overlay', 'chest-overlay', 'merchant-overlay', 'main-menu-overlay'].some(id => {
        const el = document.getElementById(id);
        return el && window.getComputedStyle(el).display !== 'none';
      });
      if (overlayOpen) return;
      const firstIndex = party.findIndex(m => !m.isEmpty && !m.isDead);
      if (firstIndex !== -1) openModal(firstIndex);
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

// Drop button
document.getElementById('equip-drop').addEventListener('click', () => {
  if (activeCharIndex !== null) {
    dropMember(activeCharIndex);
    closeModal();
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
}

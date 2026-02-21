import { party, refreshPartyCards } from './party.js';
import { getItemDef } from './items.js';
import { ACTIONS } from './items.js';
import { playAction } from './actions.js';
import { attackMonster, monsters } from './monster.js';
import { showMessage } from './minimap.js';
import { dropMember } from './recruits.js';
import { isInFrontOfPlayer } from './player.js';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const SLOT_KEYS = [
  'head', 'cloak', 'neck', 'chest',
  'leftHand', 'rightHand',
  'belt', 'hands',
  'ring1', 'ring2',
  'legs', 'feet', 'skill',
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
  skill: 'Skill',
};

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let activeCharIndex = null;

// ─────────────────────────────────────────────
//  DATA SETUP  — extends party member objects
// ─────────────────────────────────────────────
export function extendPartyData() {
  party.forEach((m) => {
    if (m.isEmpty) return;
    if (m.equipment) return; // Already initialized

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
      } else if (slot === 'enable-spell') {
        m.equipment.leftHand = { name: m.leftHand, slot: 'enable-spell' };
        m.equipment.rightHand = { name: 'Fireball', slot: 'spell' };
      } else {
        m.equipment.leftHand = { name: m.leftHand, slot: 'leftHand' };
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
      } else if (slot === 'enable-spell') {
        if (!m.equipment.rightHand && !m.equipment.leftHand) {
          m.equipment.rightHand = { name: m.rightHand, slot: 'enable-spell' };
          m.equipment.leftHand = { name: 'Fireball', slot: 'spell' };
        }
      } else {
        if (m.equipment.rightHand?.slot !== 'spell') {
          m.equipment.rightHand = { name: m.rightHand, slot: 'rightHand' };
        }
      }
    }
    if (m.startingSkill) {
      m.equipment.skill = { name: m.startingSkill, slot: 'skill' };
    }
    // 20-slot inventory, all empty
    m.inventory = Array(INVENTORY_SIZE).fill(null);
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
  if (def && def.icon) {
    containerEl.innerHTML = `<img src="${def.icon}" alt="${item.name}" draggable="false" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;" />`;
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
  });

  // ── Character stats ──
  const stats = m.stats ?? {};
  ['strength', 'dexterity', 'vitality', 'intelligence', 'resilience'].forEach((key) => {
    const el = document.getElementById(`stat-${key}`);
    if (el) el.textContent = stats[key] ?? '—';
  });

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
        card.innerHTML = `<span class="skill-name">${skill.name}</span><span class="skill-desc">${skill.description}</span>`;
        skillsEl.appendChild(card);
      });
    }
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

function populateTooltip(item) {
  const def = getItemDef(item.name);

  document.getElementById('item-detail-name').textContent = item.name;
  document.getElementById('item-detail-slot').textContent =
    'Slot: ' + (SLOT_LABELS[def?.slot ?? item.slot] ?? item.slot);
  document.getElementById('item-detail-action').textContent =
    def?.attackType
      ? 'Attack: ' + def.attackType.charAt(0).toUpperCase() + def.attackType.slice(1)
      : '';
  document.getElementById('item-detail-desc').textContent =
    def?.description ?? '—';
  document.getElementById('item-detail-damage').textContent =
    def?.baseDamage != null ? def.baseDamage : '—';
  document.getElementById('item-detail-value').textContent =
    def != null ? def.value + ' gp' : '—';
  document.getElementById('item-detail-weight').textContent =
    def != null ? def.weight + ' kg' : '—';
}

function showTooltip(item, mouseX, mouseY) {
  if (!item) { hideTooltip(); return; }
  populateTooltip(item);
  const panel = document.getElementById('item-detail-panel');
  panel.classList.remove('detail-hidden');
  positionTooltip(mouseX, mouseY);
}

function hideTooltip() {
  document.getElementById('item-detail-panel').classList.add('detail-hidden');
}

/** Attach hover tooltip listeners to any hoverable item element.
 *  getItem() is called each time to get the current item (may change). */
function attachTooltipListeners(el, getItem) {
  el.addEventListener('mouseenter', (e) => {
    const item = getItem();
    if (item) showTooltip(item, e.clientX, e.clientY);
  });
  el.addEventListener('mousemove', (e) => {
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
  });
  el.addEventListener('mouseleave', () => hideTooltip());
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
  activeCharIndex = null;
  // Sync party card HUD to reflect any equipment changes (weapons, torch, etc.)
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
function useHand(memberIndex, hand) {
  const m = party[memberIndex];
  if (!m) return;

  const slotKey = hand === 'left' ? 'leftHand' : 'rightHand';
  const item = m.equipment?.[slotKey];
  const def = item ? getItemDef(item.name) : null;

  // Empty hand → punch; items with no attackType (e.g. Shield) → no action
  const attackType = item ? (def?.attackType ?? null) : ACTIONS.PUNCH;
  if (!attackType) return;

  // Slots 0 and 1 are the front row; slots 2 and 3 are the back row.
  // Back-row members can only attack with ranged weapons (SHOOT or FIREBALL).
  const isRanged = attackType === ACTIONS.SHOOT || attackType === ACTIONS.FIREBALL;
  const isBackRow = memberIndex >= 2;

  if (isBackRow && !isRanged) {
    showMessage(`${m.name} is in the back row — only ranged attacks can reach the enemy!`);
    return;
  }

  const maxRange = isRanged ? 3 : 1;

  // Find the first alive monster that is in range and directly in front
  const target = monsters.find(
    t => t.alive && isInFrontOfPlayer(t.gridRow, t.gridCol, maxRange)
  );

  if (!target) {
    showMessage(isRanged ? 'No target in range (up to 3 squares ahead).' : 'No target directly in front of you.');
    return;
  }

  // Play the visual + audio animation only when a valid target is in range
  playAction(attackType, hand);

  const baseDamage = item ? (def?.baseDamage ?? 0) : 0; // bare fists: no base damage
  const heroStr = m.stats?.strength ?? 10;
  const result = attackMonster(target.id, baseDamage, heroStr, attackType);

  if (result.hit) {
    if (result.killed) {
      showMessage(`${m.name} slays the ${target.name}!`);
    } else {
      showMessage(`${m.name} hits ${target.name} for <b>${result.damage}</b> damage! &nbsp;(${result.monsterHp} / ${target.hpMax} HP)`);
    }
  }
}

// ─────────────────────────────────────────────
//  USE SKILL
// ─────────────────────────────────────────────
function useSkill(memberIndex) {
  const m = party[memberIndex];
  if (!m) return;

  const skill = m.equipment?.skill;
  if (!skill) {
    showMessage(`${m.name} has no skill equipped!`);
    return;
  }

  showMessage(`${m.name} uses ${skill.name}! (Skill logic not yet implemented)`);
}

// ─────────────────────────────────────────────
//  CLICK HANDLERS
// ─────────────────────────────────────────────

// Clicking a body slot with an item → move it to first free inventory cell
// For bothHands items, both hand slots are cleared with one inventory entry.
function onPaperdollSlotClick(e) {
  if (activeCharIndex === null) return;
  const key = e.currentTarget.dataset.slot;
  const m = party[activeCharIndex];
  const item = m.equipment[key];
  if (!item) return; // empty slot — nothing to do
  if (item.slot === 'spell') return; // Cannot manually unequip spell

  const freeIndex = m.inventory.indexOf(null);
  if (freeIndex === -1) {
    e.currentTarget.style.borderColor = '#c04040';
    setTimeout(() => { e.currentTarget.style.borderColor = ''; }, 400);
    return;
  }

  // Store a single inventory copy with the canonical slot
  m.inventory[freeIndex] = { name: item.name, slot: item.slot };
  m.equipment[key] = null;
  // If it was a bothHands item, clear the mirrored slot too
  if (item.slot === 'bothHands') {
    m.equipment.leftHand = null;
    m.equipment.rightHand = null;
  } else if (item.slot === 'enable-spell') {
    if (key === 'leftHand' && m.equipment.rightHand?.slot === 'spell') m.equipment.rightHand = null;
    if (key === 'rightHand' && m.equipment.leftHand?.slot === 'spell') m.equipment.leftHand = null;
  }
  renderModal(activeCharIndex);
}

// Left-click an occupied inventory cell → equip the item back to its home slot.
// For bothHands items, fills both hand slots; any displaced single-hand items
// are returned to inventory (first displaced item gets the freed cell, second
// goes to the next free cell).
function onInventoryCellClick(e) {
  if (activeCharIndex === null) return;
  const invIndex = Number(e.currentTarget.dataset.index);
  const m = party[activeCharIndex];
  const item = m.inventory[invIndex];
  if (!item) return; // empty cell

  // Clear this inventory cell first
  m.inventory[invIndex] = null;

  if (item.slot === 'bothHands') {
    const displaced = [m.equipment.leftHand, m.equipment.rightHand]
      .filter((d) => d !== null && d !== m.equipment.leftHand || d === m.equipment.rightHand)
      // deduplicate — bothHands items share the same reference
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
      .filter((d) => d.slot !== 'spell');

    // Clear and equip both slots
    m.equipment.leftHand = item;
    m.equipment.rightHand = item;

    // Return any displaced items to inventory
    displaced.forEach((d) => {
      if (!d) return;
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = d;
    });
  } else if (item.slot === 'enable-spell') {
    const displaced = [m.equipment.leftHand, m.equipment.rightHand]
      .filter((d) => d !== null)
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
      .filter((d) => d.slot !== 'spell');

    m.equipment.leftHand = item;
    m.equipment.rightHand = { name: 'Fireball', slot: 'spell' };

    displaced.forEach((d) => {
      if (!d) return;
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = d;
    });
  } else {
    let currentlyWorn = m.equipment[item.slot];

    // Check if we are displacing an enable-spell item
    if (currentlyWorn?.slot === 'enable-spell') {
      if (item.slot === 'leftHand' && m.equipment.rightHand?.slot === 'spell') m.equipment.rightHand = null;
      if (item.slot === 'rightHand' && m.equipment.leftHand?.slot === 'spell') m.equipment.leftHand = null;
    } else if (currentlyWorn?.slot === 'spell') {
      const otherSlot = item.slot === 'leftHand' ? 'rightHand' : 'leftHand';
      const otherItem = m.equipment[otherSlot];
      if (otherItem?.slot === 'enable-spell') {
        // Send the staff to inventory since it lost its spell component
        const fi = m.inventory.indexOf(null);
        if (fi !== -1) m.inventory[fi] = otherItem;
        m.equipment[otherSlot] = null;
      }
      currentlyWorn = null; // Spell disappears
    }

    m.equipment[item.slot] = item;
    if (currentlyWorn && currentlyWorn.slot !== 'spell') {
      m.inventory[invIndex] = currentlyWorn;
    }
  }

  renderModal(activeCharIndex);
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
    // Hover tooltip for equipped items
    attachTooltipListeners(el, () => {
      if (activeCharIndex === null) return null;
      return party[activeCharIndex].equipment[key] ?? null;
    });
  });
}

function attachCardListeners() {
  party.forEach((m, i) => {
    const card = document.getElementById(`member-${i}`);
    if (!card) return;

    // Clicking the card opens the equipment modal
    card.addEventListener('click', () => openModal(i));

    // Clicking the left/right hand slots uses the item — does NOT open modal
    const lhSlot = document.getElementById(`slot-lh-${i}`);
    const rhSlot = document.getElementById(`slot-rh-${i}`);

    if (lhSlot) {
      lhSlot.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent card click / modal open
        useHand(i, 'left');
      });
    }
    if (rhSlot) {
      rhSlot.addEventListener('click', (e) => {
        e.stopPropagation();
        useHand(i, 'right');
      });
    }

    const skSlot = document.getElementById(`slot-sk-${i}`);
    if (skSlot) {
      skSlot.addEventListener('click', (e) => {
        e.stopPropagation();
        useSkill(i);
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

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeCharIndex !== null) {
      e.stopPropagation();
      closeModal();
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

// ─────────────────────────────────────────────
//  PUBLIC INIT
// ─────────────────────────────────────────────
export function initEquipment() {
  extendPartyData();
  buildInventoryGrid();
  attachPaperdollListeners();
  attachCardListeners();
  attachOverlayListeners();
}

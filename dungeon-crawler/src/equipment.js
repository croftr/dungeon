import { party } from './party.js';
import { getItemDef } from './items.js';
import { playAction  } from './actions.js';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const SLOT_KEYS = [
  'head', 'cloak', 'neck', 'chest',
  'leftHand', 'rightHand',
  'belt', 'hands',
  'ring1', 'ring2',
  'legs', 'feet',
];

const INVENTORY_SIZE = 20; // 4 cols × 5 rows

// Human-readable slot labels for the detail panel
const SLOT_LABELS = {
  head      : 'Head',
  cloak     : 'Cloak',
  neck      : 'Neck',
  chest     : 'Chest',
  leftHand  : 'Left Hand',
  rightHand : 'Right Hand',
  bothHands : 'Both Hands',
  belt      : 'Belt',
  hands     : 'Gauntlets',
  ring1     : 'Ring',
  ring2     : 'Ring',
  legs      : 'Legs',
  feet      : 'Feet',
};

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let activeCharIndex = null;

// ─────────────────────────────────────────────
//  DATA SETUP  — extends party member objects
// ─────────────────────────────────────────────
function extendPartyData() {
  party.forEach((m) => {
    // All slots empty by default
    m.equipment = Object.fromEntries(SLOT_KEYS.map((k) => [k, null]));
    // Every character starts with a Shawl on their head
    m.equipment.head = { name: 'Shawl', slot: 'head' };
    // Seed left/right hand from party card data (skip '—' placeholder)
    // For bothHands items, fill both slots with the same item object reference
    if (m.leftHand && m.leftHand !== '—') {
      const def  = getItemDef(m.leftHand);
      const slot = def?.slot ?? 'leftHand';
      if (slot === 'bothHands') {
        const item = { name: m.leftHand, slot: 'bothHands' };
        m.equipment.leftHand  = item;
        m.equipment.rightHand = item;
      } else {
        m.equipment.leftHand = { name: m.leftHand, slot: 'leftHand' };
      }
    }
    if (m.rightHand && m.rightHand !== '—') {
      const def  = getItemDef(m.rightHand);
      const slot = def?.slot ?? 'rightHand';
      // Only seed rightHand if not already filled by a bothHands item
      if (slot === 'bothHands') {
        if (!m.equipment.leftHand) {
          const item = { name: m.rightHand, slot: 'bothHands' };
          m.equipment.leftHand  = item;
          m.equipment.rightHand = item;
        }
      } else {
        m.equipment.rightHand = { name: m.rightHand, slot: 'rightHand' };
      }
    }
    // 20-slot inventory, all empty
    m.inventory = Array(INVENTORY_SIZE).fill(null);
  });
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
function renderModal(memberIndex) {
  const m = party[memberIndex];

  // Header name
  document.getElementById('equip-char-name').textContent = m.name;

  // ── Paperdoll slots ──
  // For bothHands items the same object sits in both leftHand and rightHand.
  // We show the name in full on the primary (leftHand) slot and faded on rightHand.
  SLOT_KEYS.forEach((key) => {
    const el   = document.getElementById(`pd-${key}`);
    const item = m.equipment[key];
    const isBothHands = item?.slot === 'bothHands';
    const isSecondary = isBothHands && key === 'rightHand';
    el.classList.toggle('occupied',             item !== null);
    el.classList.toggle('both-hands-secondary', isSecondary);
    el.querySelector('.pd-item').textContent = item ? item.name : '';
  });

  // ── Inventory cells ──
  const cells = document.querySelectorAll('.inv-cell');
  cells.forEach((cell, i) => {
    const item = m.inventory[i];
    cell.textContent = item ? item.name : '';
    cell.classList.toggle('occupied', item !== null);
  });
}

// ─────────────────────────────────────────────
//  ITEM TOOLTIP
// ─────────────────────────────────────────────
const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = 14;

function positionTooltip(mouseX, mouseY) {
  const panel  = document.getElementById('item-detail-panel');
  const pw     = panel.offsetWidth  || 190;
  const ph     = panel.offsetHeight || 120;
  const vw     = window.innerWidth;
  const vh     = window.innerHeight;

  // Default: place to the right and below cursor
  let x = mouseX + TOOLTIP_OFFSET_X;
  let y = mouseY + TOOLTIP_OFFSET_Y;

  // Flip left if it would overflow the right edge
  if (x + pw > vw - 8) x = mouseX - pw - TOOLTIP_OFFSET_X;
  // Flip up if it would overflow the bottom edge
  if (y + ph > vh - 8) y = mouseY - ph - TOOLTIP_OFFSET_Y;

  panel.style.left = x + 'px';
  panel.style.top  = y + 'px';
}

function populateTooltip(item) {
  const def = getItemDef(item.name);

  document.getElementById('item-detail-name').textContent = item.name;
  document.getElementById('item-detail-slot').textContent =
    'Slot: ' + (SLOT_LABELS[def?.slot ?? item.slot] ?? item.slot);
  document.getElementById('item-detail-action').textContent =
    def?.action
      ? 'Action: ' + def.action.charAt(0).toUpperCase() + def.action.slice(1)
      : '';
  document.getElementById('item-detail-desc').textContent =
    def?.description ?? '—';
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
}

// ─────────────────────────────────────────────
//  USE HAND  — triggered from party panel
// ─────────────────────────────────────────────
/**
 * Called when a player clicks a hand slot on the party panel during dungeon view.
 * Looks up the item in that slot and plays the corresponding action animation.
 * @param {number} memberIndex  — 0-3
 * @param {'left'|'right'} hand
 */
function useHand(memberIndex, hand) {
  const m = party[memberIndex];
  if (!m) return;

  const slotKey = hand === 'left' ? 'leftHand' : 'rightHand';
  const item    = m.equipment?.[slotKey];
  if (!item) return;

  const def = getItemDef(item.name);
  if (!def?.action) return; // item has no action (e.g. Grimoire)

  playAction(def.action, hand);
}

// ─────────────────────────────────────────────
//  CLICK HANDLERS
// ─────────────────────────────────────────────

// Clicking a body slot with an item → move it to first free inventory cell
// For bothHands items, both hand slots are cleared with one inventory entry.
function onPaperdollSlotClick(e) {
  if (activeCharIndex === null) return;
  const key  = e.currentTarget.dataset.slot;
  const m    = party[activeCharIndex];
  const item = m.equipment[key];
  if (!item) return; // empty slot — nothing to do

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
    m.equipment.leftHand  = null;
    m.equipment.rightHand = null;
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
  const m        = party[activeCharIndex];
  const item     = m.inventory[invIndex];
  if (!item) return; // empty cell

  // Clear this inventory cell first
  m.inventory[invIndex] = null;

  if (item.slot === 'bothHands') {
    const displaced = [m.equipment.leftHand, m.equipment.rightHand]
      .filter((d) => d !== null && d !== m.equipment.leftHand || d === m.equipment.rightHand)
      // deduplicate — bothHands items share the same reference
      .filter((d, idx, arr) => arr.indexOf(d) === idx);

    // Clear and equip both slots
    m.equipment.leftHand  = item;
    m.equipment.rightHand = item;

    // Return any displaced items to inventory
    displaced.forEach((d) => {
      if (!d) return;
      const fi = m.inventory.indexOf(null);
      if (fi !== -1) m.inventory[fi] = d;
    });
  } else {
    const currentlyWorn = m.equipment[item.slot];
    m.equipment[item.slot] = item;
    if (currentlyWorn) m.inventory[invIndex] = currentlyWorn;
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
    cell.className      = 'inv-cell';
    cell.dataset.index  = i;
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

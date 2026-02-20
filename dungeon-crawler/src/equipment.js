import { party } from './party.js';

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
    if (m.leftHand  && m.leftHand  !== '—') {
      m.equipment.leftHand  = { name: m.leftHand,  slot: 'leftHand'  };
    }
    if (m.rightHand && m.rightHand !== '—') {
      m.equipment.rightHand = { name: m.rightHand, slot: 'rightHand' };
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
  SLOT_KEYS.forEach((key) => {
    const el   = document.getElementById(`pd-${key}`);
    const item = m.equipment[key];
    el.classList.toggle('occupied', item !== null);
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
//  OPEN / CLOSE
// ─────────────────────────────────────────────
function openModal(memberIndex) {
  activeCharIndex = memberIndex;
  document.getElementById('equip-overlay').classList.remove('equip-hidden');
  renderModal(memberIndex);
}

function closeModal() {
  document.getElementById('equip-overlay').classList.add('equip-hidden');
  activeCharIndex = null;
}

// ─────────────────────────────────────────────
//  CLICK HANDLERS
// ─────────────────────────────────────────────

// Clicking a body slot with an item → move it to first free inventory cell
function onPaperdollSlotClick(e) {
  if (activeCharIndex === null) return;
  const key  = e.currentTarget.dataset.slot;
  const m    = party[activeCharIndex];
  const item = m.equipment[key];
  if (!item) return; // empty slot — nothing to do

  const freeIndex = m.inventory.indexOf(null);
  if (freeIndex === -1) {
    // Inventory full — flash the slot briefly as feedback
    e.currentTarget.style.borderColor = '#c04040';
    setTimeout(() => { e.currentTarget.style.borderColor = ''; }, 400);
    return;
  }

  m.inventory[freeIndex] = item;
  m.equipment[key]        = null;
  renderModal(activeCharIndex);
}

// Clicking an occupied inventory cell → equip the item back to its home slot
// If the home slot is occupied, swap them
function onInventoryCellClick(e) {
  if (activeCharIndex === null) return;
  const invIndex = Number(e.currentTarget.dataset.index);
  const m        = party[activeCharIndex];
  const item     = m.inventory[invIndex];
  if (!item) return; // empty cell

  const targetSlot     = item.slot;
  const currentlyWorn  = m.equipment[targetSlot];

  // Put the inventory item on the body
  m.equipment[targetSlot] = item;
  // Clear that inventory cell
  m.inventory[invIndex]   = null;
  // If the body slot already had something, put it in the now-vacant cell
  if (currentlyWorn) {
    m.inventory[invIndex] = currentlyWorn;
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
    grid.appendChild(cell);
  }
}

function attachPaperdollListeners() {
  SLOT_KEYS.forEach((key) => {
    document.getElementById(`pd-${key}`)
      .addEventListener('click', onPaperdollSlotClick);
  });
}

function attachCardListeners() {
  party.forEach((m, i) => {
    const card = document.getElementById(`member-${i}`);
    if (card) card.addEventListener('click', () => openModal(i));
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

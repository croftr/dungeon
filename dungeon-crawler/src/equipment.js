import { party, refreshPartyCards, lastAttackTimes, setHp, setMp, setSp, drawPortrait, applyRegeneration } from './party.js';
import { getItemDef } from './items.js';
import { SPELLS } from './spells.js';
import { ACTIONS } from './items.js';
import { playAction } from './actions.js';
import { attackMonster, monsters, getInRangeMonster, setHuntersEyeTarget, getHuntersEyeTargetId } from './monster.js';
import { showMessage } from './minimap.js';
import { dropMember } from './recruits.js';
import { isInFrontOfPlayer } from './player.js';
import { canMelee } from './combat-rules.js';
import { playCritSound } from './audio.js';
import { addLogEntry } from './battle-log.js';
import { skillsState } from './skills-state.js';

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

// ─────────────────────────────────────────────
//  DATA SETUP  — extends party member objects
// ─────────────────────────────────────────────
export function extendPartyData() {
  party.forEach((m) => {
    if (m.isEmpty) return;
    if (m.isDead === undefined) m.isDead = false;
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

    if (m.equipment.leftHand?.name === 'Spellbook' || m.equipment.rightHand?.name === 'Spellbook') {
      m.selectedSpell = 'Fireball';
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
        card.innerHTML = `<span class="skill-name">${skill.name}</span><span class="skill-desc">${skill.description}</span>`;
        // Click to equip — clicking the already-equipped skill unequips it
        card.addEventListener('click', () => {
          m.equipment.skill = isEquipped ? null : { name: skill.name, slot: 'skill', icon: skill.icon ?? null };
          renderModal(activeCharIndex);
          refreshPartyCards();
        });
        skillsEl.appendChild(card);
      });
    }
  }

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
  const isCustom = !!item.isCustom;
  const nameEl = document.getElementById('item-detail-name');
  const slotEl = document.getElementById('item-detail-slot');
  const actionEl = document.getElementById('item-detail-action');
  const descEl = document.getElementById('item-detail-desc');
  const statsEl = document.getElementById('item-detail-stats');

  nameEl.textContent = item.name;

  if (isCustom) {
    slotEl.textContent = '';
    actionEl.textContent = '';
    descEl.textContent = item.description;
    statsEl.style.display = 'none';
    return;
  }

  statsEl.style.display = 'flex';
  const def = getItemDef(item.name);

  const isAmmo = (def?.slot === 'ammo');
  const hasDefence = !isAmmo && def?.defence != null && def.defence > 0;
  const hasBlock = !isAmmo && def?.blockChance != null && def.blockChance > 0;

  // Hide/show rows based on item type and available stats
  document.getElementById('detail-row-damage').style.display = isAmmo ? 'none' : 'flex';
  document.getElementById('detail-row-defence').style.display = hasDefence ? 'flex' : 'none';
  document.getElementById('detail-row-block').style.display = hasBlock ? 'flex' : 'none';
  document.getElementById('detail-row-value').style.display = isAmmo ? 'none' : 'flex';
  document.getElementById('detail-row-weight').style.display = isAmmo ? 'none' : 'flex';
  document.getElementById('detail-row-ammo-mod').style.display = isAmmo ? 'flex' : 'none';
  document.getElementById('detail-row-ammo-type').style.display = isAmmo ? 'flex' : 'none';

  slotEl.textContent =
    'Slot: ' + (SLOT_LABELS[def?.slot ?? item.slot] ?? item.slot);
  actionEl.textContent =
    def?.attackType
      ? 'Attack: ' + def.attackType.charAt(0).toUpperCase() + def.attackType.slice(1)
      : '';
  descEl.textContent =
    def?.description ?? '—';

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
  }
}

function showTooltip(item, mouseX, mouseY) {
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
//  CLICK HANDLERS
// ─────────────────────────────────────────────

/**
 * Core equip logic — moves item at invIndex from inventory into the
 * appropriate equipment slot (handles bothHands, enable-spell, and
 * regular slots). Shared by left-click and the context menu.
 */
function _equipItem(memberIndex, invIndex) {
  const m = party[memberIndex];
  const item = m.inventory[invIndex];
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
  document.getElementById('inv-ctx-equip').onclick = () => {
    _equipItem(activeCharIndex, _ctxInvIndex);
    _hideContextMenu();
  };

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

  // Show all defined spells + some empty slots
  const availableSpells = SPELLS.map(s => s.name);
  const m = party[charIndex];

  grid.innerHTML = '';

  // Spells
  availableSpells.forEach(spellName => {
    const def = getItemDef(spellName);
    const div = document.createElement('div');
    div.className = 'spell-sel-slot';
    div.innerHTML = `<img src="${def.icon}" />`;
    div.title = def.name;
    div.onclick = () => {
      m.selectedSpell = spellName;
      overlay.classList.add('spell-sel-hidden');
      renderModal(charIndex);
      refreshPartyCards();
    };
    grid.appendChild(div);
  });

  // Empty slots
  for (let i = 0; i < 6; i++) {
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
  const delaySec = def?.delay ?? 2;

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
  // If `bothHands` weapon (e.g., Short Bow), set the cooldown for left hand, 
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
  const SP_COST = 5;
  if (!isSpell && m.sp < SP_COST) {
    showMessage(`${m.name} is too exhausted to attack!`);
    return;
  }

  lastAttackTimes[timeKey] = now;
  if (!isSpell) setSp(m.id, m.sp - SP_COST);
  refreshPartyCards();

  // Play the visual + audio animation regardless of whether a target exists
  playAction(attackType, hand);

  if (isBuff) {
    if (attackType === ACTIONS.REGENERATE) {
      applyRegeneration();
      showMessage(`${m.name} casts Regeneration!`);
      addLogEntry({
        time: Date.now(),
        actor: 'player',
        attacker: m.name,
        target: 'party',
        attackType,
        hitChance: 100,
        hit: true,
        crit: false,
        finalDamage: 0
      });
    }
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
    mitigation: result.formula?.mitigation ?? 0,
    preCritDamage: result.formula?.preCritDamage ?? 0,
    finalDamage: result.damage,
    critMultiplier: result.formula?.critMultiplier ?? 1,
    stunned: result.stunned ?? false,
    poisoned: result.poisoned ?? false,
    sundered: result.sundered ?? false,
    ammoModifier: result.formula?.ammoModifier ?? null,
  });

  if (!result.hit) {
    showMessage(`${m.name} misses!`);
    return;
  }

  // Damage number floats up from the clicked weapon slot
  const slotId = `slot-${hand === 'left' ? 'lh' : 'rh'}-${memberIndex}`;
  const slotEl = document.getElementById(slotId);
  if (slotEl) _showDamagePopup(slotEl, result.damage, result.crit);

  if (result.crit) {
    playCritSound(attackType);
    if (result.killed) {
      showMessage(`<span style="color:#ff8800">⚡ CRITICAL!</span> ${m.name} obliterates the ${target.name}!`, 3000);
    } else {
      showMessage(`<span style="color:#ff8800">⚡ CRITICAL!</span> ${m.name} &nbsp;<b>${result.damage}</b> damage`, 2500);
    }
  } else {
    if (result.killed) {
      showMessage(`${m.name} slays the ${target.name}!`);
    } else {
      showMessage(`${m.name} &nbsp;<b>${result.damage}</b> damage`);
    }
  }
}

// ─────────────────────────────────────────────
//  USE SKILL  — dispatcher + per-skill implementations
// ─────────────────────────────────────────────

// ── Cooldown timestamps (performance.now epoch when the skill becomes ready) ──
const HUNTERS_EYE_COOLDOWN_MS = 60_000;
const SANCTUARY_COOLDOWN_MS = 120_000;
const SANCTUARY_DURATION_MS = 60_000;
const HOLY_RADIANCE_COOLDOWN_MS = 120_000;
const HOLY_RADIANCE_HEAL = 10;

let _huntersEyeCooldownEnd = 0;
let _sanctuaryCooldownEnd = 0;
let _holyRadianceCooldownEnd = 0;
let _sanctuaryExpireTimer = null;

const ENTANGLE_COOLDOWN_MS = 60_000;
const ENTANGLE_DURATION_MS = 30_000;
let _entangleCooldownEnd = 0;
let _entangleExpireTimer = null;

const SUNDER_ARMOR_COOLDOWN_MS = 60_000;
const SUNDER_ARMOR_DURATION_MS = 30_000;
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
  if (skill.name === 'Runic Scholar') { _useRunicScholar(m, memberIndex); return; }
  if (skill.name === 'Mana Tap') { _useManaTap(m, memberIndex); return; }
  if (skill.name === 'Entangle') { _useEntangle(m, memberIndex); return; }
  if (skill.name === 'Sunder Armor') { _useSunderArmor(m, memberIndex); return; }
  if (skill.name === 'Berserk') { _useBerserk(m, memberIndex); return; }

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

  _huntersEyeCooldownEnd = now + HUNTERS_EYE_COOLDOWN_MS;
  setHuntersEyeTarget(target.id);
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

  skillsState.entangle.active = true;
  skillsState.entangle.targetId = target.id;
  skillsState.entangle.expiresAt = now + ENTANGLE_DURATION_MS;
  _entangleCooldownEnd = now + ENTANGLE_COOLDOWN_MS;

  showMessage(
    `<span style="color:#80ff80">✦ Entangle</span> — ${member.name} roots the ${target.name}! Attack speed halved for 30s.`,
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

  skillsState.sunderArmor.active = true;
  skillsState.sunderArmor.targetId = target.id;
  skillsState.sunderArmor.expiresAt = now + SUNDER_ARMOR_DURATION_MS;
  _sunderArmorCooldownEnd = now + SUNDER_ARMOR_COOLDOWN_MS;

  showMessage(
    `<span style="color:#ff8080">✦ Sunder Armor</span> — ${member.name} crushes the ${target.name}! Defence halved for 30s.`,
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
const BERSERK_COOLDOWN_MS = 60_000;
const BERSERK_DURATION_MS = 30_000;
let _berserkCooldownEnd = 0;
let _berserkExpireTimer = null;

function _useBerserk(member, memberIndex) {
  const now = performance.now();
  if (now < _berserkCooldownEnd) {
    const remaining = Math.ceil((_berserkCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#ff5050">Berserk</span> — ready in ${remaining}s`, 2000);
    return;
  }

  skillsState.berserk.active = true;
  skillsState.berserk.actorName = member.name;
  skillsState.berserk.expiresAt = now + BERSERK_DURATION_MS;
  _berserkCooldownEnd = now + BERSERK_COOLDOWN_MS;

  showMessage(
    `<span style="color:#ff5050">✦ Berserk</span> — ${member.name} roars in fury! Damage +20% for 30s.`,
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

// ── Sanctuary (Alaric) ────────────────────────────────────────────────────
function _useSanctuary(member, memberIndex) {
  const now = performance.now();
  if (now < _sanctuaryCooldownEnd) {
    const remaining = Math.ceil((_sanctuaryCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#f0d080">Sanctuary</span> — ready in ${remaining}s`, 2000);
    return;
  }

  // Activate the buff
  skillsState.sanctuary.active = true;
  skillsState.sanctuary.expiresAt = now + SANCTUARY_DURATION_MS;
  _sanctuaryCooldownEnd = now + SANCTUARY_COOLDOWN_MS;

  // Golden glow on the party panel while the shield holds
  document.getElementById('party-panel')?.classList.add('sanctuary-active');

  showMessage(
    `<span style="color:#f0d080">✦ Sanctuary</span> — ${member.name} shields the party! Damage −10% for 60s.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Sanctuary' });

  // Auto-expire the visual when the 60s buff ends
  if (_sanctuaryExpireTimer) clearTimeout(_sanctuaryExpireTimer);
  _sanctuaryExpireTimer = setTimeout(() => {
    skillsState.sanctuary.active = false;
    document.getElementById('party-panel')?.classList.remove('sanctuary-active');
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

  _holyRadianceCooldownEnd = now + HOLY_RADIANCE_COOLDOWN_MS;

  let healed = 0;
  party.forEach((m) => {
    if (!m.isEmpty && !m.isDead && m.hp < m.hpMax) {
      setHp(m.id, Math.min(m.hp + HOLY_RADIANCE_HEAL, m.hpMax));
      healed++;
    }
  });

  if (healed > 0) {
    showMessage(
      `<span style="color:#f8f8a0">✦ Holy Radiance</span> — ${member.name} calls down divine light! Each member heals ${HOLY_RADIANCE_HEAL} HP.`,
      3000
    );
    addLogEntry({ type: 'skill', actor: member.name, skillName: 'Holy Radiance' });
  } else {
    showMessage(`<span style="color:#f8f8a0">Holy Radiance</span> — the party is already at full health.`, 2000);
  }

  _startSkillCooldownUI(memberIndex, _holyRadianceCooldownEnd);
}

// ── Arcane Lantern (Merlin) ───────────────────────────────────────────────
const ARCANE_LANTERN_COOLDOWN_MS = 60_000;
const ARCANE_LANTERN_DURATION_MS = 60_000;
let _arcaneLanternCooldownEnd = 0;
let _arcaneLanternExpireTimer = null;

function _useArcaneLantern(member, memberIndex) {
  const now = performance.now();
  if (now < _arcaneLanternCooldownEnd) {
    const remaining = Math.ceil((_arcaneLanternCooldownEnd - now) / 1000);
    showMessage(`<span style="color:#a0d8ff">Arcane Lantern</span> — ready in ${remaining}s`, 2000);
    return;
  }

  skillsState.arcaneLight.active = true;
  skillsState.arcaneLight.expiresAt = now + ARCANE_LANTERN_DURATION_MS;
  _arcaneLanternCooldownEnd = now + ARCANE_LANTERN_COOLDOWN_MS;

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
  refreshPartyCards(); // immediately lights up the skill slot glow

  showMessage(
    `<span style="color:#c080ff">✦ Runic Scholar</span> — ${member.name} channels the runes! Next spell deals ×2 damage.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Runic Scholar' });
}

// ── Mana Tap (Merlin) ─────────────────────────────────────────────────────
const MANA_TAP_COOLDOWN_MS = 120_000;
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

  _manaTapCooldownEnd = now + MANA_TAP_COOLDOWN_MS;
  setMp(member.id, member.mpMax);

  showMessage(
    `<span style="color:#40c0ff">✦ Mana Tap</span> — ${member.name} draws on hidden reserves! Mana fully restored.`,
    3000
  );
  addLogEntry({ type: 'skill', actor: member.name, skillName: 'Mana Tap' });
  _startSkillCooldownUI(memberIndex, _manaTapCooldownEnd);
}

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

  // Escape key — close context menu first, then modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
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

  // Click outside the context menu → dismiss it
  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('inv-context-menu');
    if (!menu.classList.contains('inv-ctx-hidden') && !menu.contains(e.target)) {
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

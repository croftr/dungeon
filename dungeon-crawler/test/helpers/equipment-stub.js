/**
 * test/helpers/equipment-stub.js
 *
 * Stub for src/equipment.js used only in the test environment.
 *
 * equipment.js registers DOM event listeners at module-load time (e.g. on the
 * spell-selection-overlay element) which crash under jsdom unless the full HTML
 * shell is present. The save-relevant modules (party.js, recruits.js, etc.) only
 * need a handful of functions from equipment.js — everything else is UI glue.
 *
 * This stub provides those functions as minimal, side-effect-free implementations
 * so restorePartyState → updateEffectiveStats works correctly in tests, while all
 * the DOM-heavy rendering functions are replaced with no-ops.
 */

// ── Functions actually called on the save/restore path ───────────────────────

/**
 * updateEffectiveStats(m) — called by restorePartyState for each non-empty member.
 * In the real module this derives hp/mp/sp maxes from stats. We provide a minimal
 * version that sets safe defaults so tests don't error on missing fields.
 */
export function updateEffectiveStats(m) {
  if (!m || m.isEmpty) return;
  const s = m.stats ?? {};
  // Minimal derivation — mirrors the real formula enough that numbers are non-zero.
  m.hpMax = m.hpMax ?? (10 + (s.vitality ?? 10) * 5);
  m.mpMax = m.mpMax ?? (10 + (s.intelligence ?? 10) * 3);
  m.spMax = m.spMax ?? 100;
  m.hp    = m.hp    ?? m.hpMax;
  m.mp    = m.mp    ?? m.mpMax;
  m.sp    = m.sp    ?? m.spMax;
}

/**
 * extendPartyData() — called by recruitCharacter; safe no-op in tests since
 * we never call recruitCharacter in our test suite.
 */
export function extendPartyData() {}

// ── No-op stubs for all other named exports ───────────────────────────────────

export const STRENGTH_TO_CARRY_KG  = 5;
export const ENCUMBERED_THRESHOLD  = 1.0;
export const OVERLOADED_THRESHOLD  = 2.0;

export function calcDerivedMaxStats()       { return {}; }
export function consumeItemAt()             {}
export function removeItemsByName()         {}
export function formatSetBonusText()        { return ''; }
export function getMemberCarryWeight()      { return 0; }
export function getMemberMaxCarry()         { return 999; }
export function getMemberEncumbranceLevel() { return 'normal'; }
export function getPartyEncumbranceLevel()  { return 'normal'; }
export function getPartyMoveMs()            { return 300; }
export function renderItemIcon()            {}
export function showTooltip()               {}
export function hideTooltip()               {}
export function attachTooltipListeners()    {}
export function useQuickslotPotion()        {}
export function rotateAmmo()                {}
export function refreshEquipmentModal()     {}
export function openCharDevModal()          {}
export function closeCharDevModal()         {}
export function useHand()                   {}
export function tickAutoAttack()            {}
export function clearAutoAttackTimers()     {}
export function tickAutoRangeAttack()       {}
export function clearAutoRangeAttackTimers() {}
export function _getItemSortPriority()      { return 0; }
export function addItemToInventory()        { return false; }
export function inventoryFreeSlots()        { return 0; }
export function initEquipment()             {}

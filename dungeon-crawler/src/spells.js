// ─────────────────────────────────────────────────────────────────────────────
//  SPELL DEFINITIONS
//
//  target field controls who the spell is cast on:
//    'monster'      — nearest enemy in range (Fireball)
//    'self-party'   — entire party simultaneously (Regeneration)
//    'party-member' — triggers the party member target picker before casting
// ─────────────────────────────────────────────────────────────────────────────

import spellData from './data/spells.json';

export const SPELLS = spellData;

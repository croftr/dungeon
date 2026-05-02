/**
 * Canonical Job/Class identifiers for the game.
 * Used for item restrictions and skill trees.
 * 
 * When used in JSON data (like items/chest.json), these can be written with spaces
 * and mixed case; the engine normalizes them to lowercase-hyphenated forms 
 * (e.g., "War Dancer" becomes "war-dancer").
 */
export const JOBS = Object.freeze({
    BARBARIAN: 'Barbarian',
    HUNTER: 'Hunter',
    PALADIN: 'Paladin',
    RANGER: 'Ranger',
    WAR_DANCER: 'War Dancer',
    WARRIOR: 'Warrior',
    WHITE_MAGE: 'White Mage',
    WIZARD: 'Wizard'
});

export const JOB_KEYS = Object.values(JOBS);

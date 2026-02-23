// ─────────────────────────────────────────────────────────────────────────────
//  SPELL DEFINITIONS
//
//  target field controls who the spell is cast on:
//    'monster'      — nearest enemy in range (Fireball)
//    'self-party'   — entire party simultaneously (Regeneration)
//    'party-member' — triggers the party member target picker before casting
// ─────────────────────────────────────────────────────────────────────────────

export const SPELLS = [
    {
        name: 'Fireball',
        type: 'direct-damage',
        target: 'monster',
        slot: 'spell',
        attackType: 'fireball',
        baseDamage: 12,
        delay: 4,
        mpCost: 10,
        icon: '/icons/fireball.svg',
        description: 'A blazing orb of magical fire. Cast to roast your enemies.',
        value: 0,
        weight: 0,
    },
    {
        name: 'Regeneration',
        type: 'buff',
        target: 'self-party',
        slot: 'spell',
        attackType: 'regenerate',
        baseDamage: 0,
        delay: 30,
        mpCost: 15,
        icon: '/icons/regeneration.png',
        description: 'A restorative blessing. Once cast, slowly heals the entire party of 1 HP every 2 seconds for 30 seconds.',
        value: 0,
        weight: 0,
    },
    {
        name: 'Cure Poison',
        type: 'debuff-cure',
        target: 'party-member',
        slot: 'spell',
        attackType: 'cure-poison',
        baseDamage: 0,
        delay: 4,
        mpCost: 8,
        icon: '/icons/cure-poison.png',
        description: 'A purifying incantation that draws venom from the body of the afflicted. Cures Poison from one party member.',
        value: 0,
        weight: 0,
    },
    {
        name: 'Heal',
        type: 'healing',
        target: 'party-member',
        slot: 'spell',
        attackType: 'heal',
        baseDamage: 0,
        delay: 5,
        mpCost: 12,
        icon: '/icons/heal.png', // Placeholder icon
        description: 'A wave of restorative energy that mends wounds. Restores HP equal to the casters Intelligence to one party member.',
        value: 0,
        weight: 0,
    },
];

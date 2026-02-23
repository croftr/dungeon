export const SPELLS = [
    {
        name: 'Fireball',
        type: 'direct-damage',
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
        slot: 'spell',
        attackType: 'regenerate',
        baseDamage: 0,
        delay: 30,
        mpCost: 15,
        icon: '/icons/regeneration.png',
        description: 'A restorative blessing. Once cast, slowly heals the entire party of 1 HP every 2 seconds for 30 seconds.',
        value: 0,
        weight: 0,
    }
];

// ─────────────────────────────────────────────────────────────────────────────
//  ITEM SCHEMA
//
//  Each item has:
//    name        {string}  — display name
//    slot        {string}  — which equipment slot it belongs to; must be one of
//                            SLOT_KEYS or 'bothHands' (occupies leftHand+rightHand)
//    attackType  {string|null} — combat action when used from the party panel
//                            one of: 'swipe' | 'bash' | 'shoot' | 'punch' | null
//                            (block is passive — no attackType)
//    baseDamage  {number|null} — base damage dealt per hit; null for non-weapons
//    description {string}  — flavour text shown in the item detail panel
//    value       {number}  — base gold value
//    weight      {number}  — encumbrance (future use)
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIONS = Object.freeze({
  SWIPE: 'swipe',
  BASH: 'bash',
  SHOOT: 'shoot',
  PUNCH: 'punch',
});

export const ITEMS = [

  // ── Head ──────────────────────────────────────────────────────────────────
  {
    name: 'Shawl',
    slot: 'head',
    attackType: null,
    baseDamage: null,
    description: 'A worn cloth shawl pulled over the head. Offers little protection but keeps out the chill.',
    value: 2,
    weight: 0.2,
  },
  {
    name: 'Leather Cap',
    slot: 'head',
    attackType: null,
    baseDamage: null,
    description: 'A simple cap of boiled leather. Better than nothing.',
    value: 12,
    weight: 0.5,
  },
  {
    name: 'Iron Helm',
    slot: 'head',
    attackType: null,
    baseDamage: null,
    description: 'A sturdy iron helmet that covers the skull and cheeks.',
    value: 40,
    weight: 2.5,
  },

  // ── Cloak ─────────────────────────────────────────────────────────────────
  {
    name: 'Travelling Cloak',
    slot: 'cloak',
    attackType: null,
    baseDamage: null,
    description: 'A heavy wool cloak that keeps wind and rain at bay.',
    value: 8,
    weight: 1.0,
  },
  {
    name: 'Shadow Cloak',
    slot: 'cloak',
    attackType: null,
    baseDamage: null,
    description: 'A dark cloak woven with shadow-silk. Hard to see in dim light.',
    value: 80,
    weight: 0.4,
  },

  // ── Neck ──────────────────────────────────────────────────────────────────
  {
    name: 'Amulet of Warding',
    slot: 'neck',
    attackType: null,
    baseDamage: null,
    description: 'A silver amulet engraved with protective runes.',
    value: 60,
    weight: 0.1,
  },
  {
    name: 'Pendant of Focus',
    slot: 'neck',
    attackType: null,
    baseDamage: null,
    description: 'A crystal pendant that sharpens the mind and aids concentration.',
    value: 75,
    weight: 0.1,
  },

  // ── Chest ─────────────────────────────────────────────────────────────────
  {
    name: 'Padded Vest',
    slot: 'chest',
    attackType: null,
    baseDamage: null,
    description: 'Thick quilted padding stitched into a vest. Absorbs blows.',
    value: 15,
    weight: 2.0,
  },
  {
    name: 'Chain Shirt',
    slot: 'chest',
    attackType: null,
    baseDamage: null,
    description: 'Interlocking iron rings form a flexible shirt of armour.',
    value: 90,
    weight: 5.0,
  },
  {
    name: 'Plate Cuirass',
    slot: 'chest',
    attackType: null,
    baseDamage: null,
    description: 'Heavy forged steel chest plate. Near impenetrable — if you can move in it.',
    value: 250,
    weight: 12.0,
  },

  // ── Belt ──────────────────────────────────────────────────────────────────
  {
    name: 'Leather Belt',
    slot: 'belt',
    attackType: null,
    baseDamage: null,
    description: 'A plain leather belt with iron buckle. Holds pouches and scabbards.',
    value: 5,
    weight: 0.3,
  },
  {
    name: 'Adventurer\'s Belt',
    slot: 'belt',
    attackType: null,
    baseDamage: null,
    description: 'A wide belt with multiple loops and pouches for quick-draw access.',
    value: 25,
    weight: 0.5,
  },

  // ── Hands (Gauntlets) ─────────────────────────────────────────────────────
  {
    name: 'Leather Gloves',
    slot: 'hands',
    attackType: null,
    baseDamage: null,
    description: 'Soft leather gloves. Improve grip and protect the knuckles.',
    value: 8,
    weight: 0.3,
  },
  {
    name: 'Iron Gauntlets',
    slot: 'hands',
    attackType: null,
    baseDamage: null,
    description: 'Articulated iron gauntlets. Protect the hands from blade and fire.',
    value: 50,
    weight: 2.0,
  },

  // ── Rings ─────────────────────────────────────────────────────────────────
  {
    name: 'Gold Ring',
    slot: 'ring1',
    attackType: null,
    baseDamage: null,
    description: 'A plain gold ring. Valuable, but otherwise unremarkable.',
    value: 30,
    weight: 0.05,
  },
  {
    name: 'Ring of Vigour',
    slot: 'ring1',
    attackType: null,
    baseDamage: null,
    description: 'A carved bone ring that pulses with vitality. Bolsters the wearer\'s constitution.',
    value: 120,
    weight: 0.05,
  },
  {
    name: 'Signet Ring',
    slot: 'ring2',
    attackType: null,
    baseDamage: null,
    description: 'A heavy signet ring bearing a forgotten noble crest.',
    value: 45,
    weight: 0.05,
  },
  {
    name: 'Ring of Swiftness',
    slot: 'ring2',
    attackType: null,
    baseDamage: null,
    description: 'A thin silver band engraved with speed runes. The wearer moves with uncanny quickness.',
    value: 140,
    weight: 0.05,
  },

  // ── Legs ──────────────────────────────────────────────────────────────────
  {
    name: 'Cloth Trousers',
    slot: 'legs',
    attackType: null,
    baseDamage: null,
    description: 'Sturdy travelling trousers. Not much protection but allow easy movement.',
    value: 4,
    weight: 0.5,
  },
  {
    name: 'Chainmail Leggings',
    slot: 'legs',
    attackType: null,
    baseDamage: null,
    description: 'Riveted chain leggings that protect the thighs and shins.',
    value: 70,
    weight: 4.0,
  },

  // ── Feet ──────────────────────────────────────────────────────────────────
  {
    name: 'Worn Boots',
    slot: 'feet',
    attackType: null,
    baseDamage: null,
    description: 'A pair of well-worn leather boots. Comfortable for long marches.',
    value: 6,
    weight: 0.8,
  },
  {
    name: 'Iron-Shod Boots',
    slot: 'feet',
    attackType: null,
    baseDamage: null,
    description: 'Reinforced leather boots with iron toe-caps. Sturdy and intimidating.',
    value: 35,
    weight: 2.0,
  },

  // ── Left Hand ─────────────────────────────────────────────────────────────
  {
    name: 'Torch',
    slot: 'rightHand',
    attackType: ACTIONS.BASH,
    baseDamage: 5,
    icon: '/icons/torch.png',
    description: 'A burning torch. Lights the way and can be thrust into an enemy\'s face.',
    value: 1,
    weight: 0.6,
  },
  {
    name: 'Shield',
    slot: 'leftHand',
    attackType: null,
    baseDamage: null,
    description: 'A round iron-banded shield. Passively deflects incoming blows.',
    value: 55,
    weight: 4.5,
  },
  {
    name: 'Bow',
    slot: 'bothHands',
    attackType: ACTIONS.SHOOT,
    baseDamage: 10,
    description: 'A recurve hunting bow requiring both hands to draw. Loose to strike enemies at range.',
    value: 40,
    weight: 1.2,
  },
  {
    name: 'Dagger',
    slot: 'leftHand',
    attackType: ACTIONS.SWIPE,
    baseDamage: 10,
    description: 'A short, double-edged blade. Quick and easy to slip past armour.',
    value: 20,
    weight: 0.4,
  },

  // ── Right Hand ────────────────────────────────────────────────────────────
  {
    name: 'Sword',
    slot: 'rightHand',
    attackType: ACTIONS.SWIPE,
    baseDamage: 10,
    icon: '/icons/sword.png',
    description: 'A straight iron sword. The classic weapon of choice for adventurers.',
    value: 65,
    weight: 1.8,
  },
  {
    name: 'Staff',
    slot: 'bothHands',
    attackType: ACTIONS.BASH,
    baseDamage: 10,
    description: 'A gnarled wooden staff requiring both hands. Useful for walking — and for cracking skulls.',
    value: 18,
    weight: 1.5,
  },
  {
    name: 'Axe',
    slot: 'rightHand',
    attackType: ACTIONS.SWIPE,
    baseDamage: 10,
    icon: '/icons/axe.png',
    description: 'A heavy war axe. Slower than a sword but hits with devastating force.',
    value: 50,
    weight: 2.8,
  },
  {
    name: 'Mace',
    slot: 'rightHand',
    attackType: ACTIONS.BASH,
    baseDamage: 10,
    description: 'An iron mace with a flanged head. Excellent against armoured foes.',
    value: 45,
    weight: 2.2,
  },
  {
    name: 'Crossbow',
    slot: 'rightHand',
    attackType: ACTIONS.SHOOT,
    baseDamage: 10,
    description: 'A compact crossbow with a steel prod. Deadly at short to medium range.',
    value: 90,
    weight: 3.0,
  },

  // ── Both Hands ────────────────────────────────────────────────────────────
  {
    name: 'Greatsword',
    slot: 'bothHands',
    attackType: ACTIONS.SWIPE,
    baseDamage: 10,
    description: 'A massive two-handed blade that cleaves through enemies in a single arc.',
    value: 150,
    weight: 5.5,
  },
  {
    name: 'War Hammer',
    slot: 'bothHands',
    attackType: ACTIONS.BASH,
    baseDamage: 10,
    description: 'A two-handed war hammer. Slow to swing but crushes stone and bone alike.',
    value: 130,
    weight: 7.0,
  },
  {
    name: 'Longbow',
    slot: 'bothHands',
    attackType: ACTIONS.SHOOT,
    baseDamage: 10,
    description: 'A tall yew longbow requiring both hands. Tremendous range and power.',
    value: 75,
    weight: 1.8,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  LOOKUP HELPER
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the item definition for a given name, or null if not found. */
export function getItemDef(name) {
  return ITEMS.find((item) => item.name === name) ?? null;
}

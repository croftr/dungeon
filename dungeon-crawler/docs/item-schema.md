# Item Schema

This document is the authoritative reference for the item data format used in `src/items.js`.
All items in the game must conform to this schema.

---

## Fields

### `name` · `string` · **required**

The display name of the item. Shown in inventory cells, paperdoll slots, and the tooltip.
Must be unique across all items — it is used as the primary lookup key by `getItemDef(name)`.

```
'Sword'
'Iron Helm'
'Ring of Vigour'
```

---

### `slot` · `string` · **required**

Which equipment slot the item belongs to. Determines where it can be equipped on the paperdoll.

| Value        | Description                                                       |
|--------------|-------------------------------------------------------------------|
| `head`       | Helmet, hat, hood, or head covering                               |
| `cloak`      | Back-worn cloak or cape                                           |
| `neck`       | Necklace, amulet, or pendant                                      |
| `chest`      | Body armour, vest, or shirt                                       |
| `belt`       | Belt or sash worn at the waist                                    |
| `hands`      | Gauntlets or gloves (armour, not held weapons)                    |
| `ring1`      | First ring finger slot                                            |
| `ring2`      | Second ring finger slot                                           |
| `legs`       | Leg armour or trousers                                            |
| `feet`       | Boots or foot armour                                              |
| `leftHand`   | Item held in the left hand only                                   |
| `rightHand`  | Item held in the right hand only                                  |
| `bothHands`  | Two-handed item; occupies **both** `leftHand` and `rightHand` simultaneously |

> **Note:** `bothHands` items fill both hand slots when equipped. Equipping one
> displaces any single-hand items already in either slot.

---

### `attackType` · `string | null` · **required**

The combat action triggered when a party member uses this item from the dungeon
view by clicking their L or R hand slot. Controls both the on-screen animation
and the synthesised sound effect.

Set to `null` for items with no active use (armour, passive accessories, etc.).

| Value     | Animation                                    | Sound                              | Typical items              |
|-----------|----------------------------------------------|------------------------------------|----------------------------|
| `'swipe'` | Diagonal blade arc sweeping corner to corner | Whooshing air sweep                | Sword, Axe, Dagger, Greatsword |
| `'bash'`  | Straight thrust with expanding impact rings  | Heavy blunt thud                   | Staff, Mace, Torch, War Hammer |
| `'shoot'` | Arrow/bolt flying diagonally across screen   | Bowstring twang + projectile zip   | Bow (bothHands), Crossbow, Longbow |
| `'punch'` | Fist driving in from the side with starburst | Flesh impact thud + knuckle crack  | Bare hands (no weapon)     |
| `null`    | No animation                                 | No sound                           | All armour, Shield, rings  |

> **Block is passive.** A Shield equipped in the left hand provides its defensive
> benefit automatically — it has no active `attackType`. Do not assign `'block'` to any item.

---

### `baseDamage` · `number | null` · **required**

The base damage dealt per hit when this item is used. Only applies to items with
a non-null `attackType` — all other items must set this to `null`.
Must be a positive integer when present.

```
baseDamage: 10   // weapon deals 10 base damage
baseDamage: null // armour / passive item — no damage
```

---

### `description` · `string` · **required**

Flavour text shown in the hover tooltip when the item is inspected in the inventory
or on the paperdoll. Should be one or two sentences in a fantasy/medieval register.
Describe what the item is and any notable property.

```
'A straight iron sword. The classic weapon of choice for adventurers.'
'A round iron-banded shield. Passively deflects incoming blows.'
```

---

### `value` · `number` · **required**

Base gold piece value of the item. Used for shop pricing and loot calculations.
Must be a positive integer.

```
value: 65    // Sword costs 65 gp
value: 1     // Torch costs 1 gp
```

---

### `weight` · `number` · **required**

Encumbrance in kilograms. Used for carry-weight calculations (future feature).
Expressed as a decimal with one decimal place of precision.

```
weight: 1.8   // Sword weighs 1.8 kg
weight: 0.05  // Ring weighs 0.05 kg
```

---

## Full Example

```js
{
  name        : 'Sword',
  slot        : 'rightHand',
  attackType  : 'swipe',
  baseDamage  : 10,
  description : 'A straight iron sword. The classic weapon of choice for adventurers.',
  value       : 65,
  weight      : 1.8,
}
```

```js
{
  name        : 'Staff',
  slot        : 'bothHands',
  attackType  : 'bash',
  baseDamage  : 10,
  description : 'A gnarled wooden staff requiring both hands. Useful for walking — and for cracking skulls.',
  value       : 18,
  weight      : 1.5,
}
```

```js
{
  name        : 'Iron Helm',
  slot        : 'head',
  attackType  : null,
  baseDamage  : null,
  description : 'A sturdy iron helmet that covers the skull and cheeks.',
  value       : 40,
  weight      : 2.5,
}
```

---

## Valid Slot Values (quick reference)

```
head · cloak · neck · chest · belt · hands · ring1 · ring2 · legs · feet
leftHand · rightHand · bothHands
```

## Valid Attack Type Values (quick reference)

```
'swipe' · 'bash' · 'shoot' · 'punch' · null
```

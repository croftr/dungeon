# Skills

This document is the authoritative reference for all available character skills.
Each character can hold up to **2 skills**. Skills are stored on the party member
object as `skills: [{ name, description }, ...]`.

---

## Available Skills

### Lockpicking
**Description:** Allows the character to open iron doors or chests without a key, or by consuming a "Lockpick" item.

**JS Logic:**
```js
if (character.hasSkill('Lockpicking')) { targetDoor.state = 'unlocked'; }
```

---

### Trap Disarming
**Description:** Automatically highlights floor pressure plates within a 2-tile radius and allows the player to right-click to disable them before triggering.

---

### Shadow-Step
**Description:** When the character moves backwards or sideways, they have a 25% chance to not trigger enemy aggression.

---

### Dual-Wielding
**Description:** Allows the character to equip a weapon in the off-hand slot. When the Attack button is clicked, the game triggers two cooldowns — one for each weapon.

---

### Whirlwind (Great Weapons)
**Description:** When attacking with a two-handed weapon, the character hits the enemy directly in front and the enemies in the two diagonal tiles simultaneously.

---

### Point-Blank Shot
**Description:** Removes the accuracy penalty when using a Bow or Crossbow against an enemy in the tile directly adjacent to the player.

---

### Botanist
**Description:** Whenever the player clicks on a Herb item on the ground, there is a 50% chance to find two instead of one.

---

### Field Medic
**Description:** Allows the use of Bandages or Heal actions during combat. Normally these actions are only permitted while resting.

---

### Runic Scholar
**Description:** Allows the character to read ancient wall inscriptions that provide hints to puzzles or grant permanent stat buffs.

---

## Skill Object Schema

```js
{
  name        : 'Lockpicking',          // {string} display name
  description : 'Allows the player...',  // {string} short flavour/mechanic description
}
```

## Quick Reference

```
Lockpicking · Trap Disarming · Shadow-Step · Dual-Wielding
Whirlwind (Great Weapons) · Point-Blank Shot · Botanist · Field Medic · Runic Scholar
```

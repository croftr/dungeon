# Dungeon Crawler — Development Guidelines

## Save Game System (v4)

Auto-saves on every level transition. World state is **not** persisted — it always spawns fresh on load. Only party state is saved.

### Save schema
```js
{ version: 4, savedAt, targetLevel, levelName, partyGold, party[], recruits{}, autoAttack, autoRangeAttack }
```

### How it works
- `autoSave(levelNum)` is called in `loadLevel()` (guarded by `!window._isRestoring`)
- Saves are stored in `localStorage` with keys `dungeon-save-<level>-<timestamp>`
- Esc → Load Game lists all saves newest-first; clicking one reloads the page into that save
- On load: party/gold/recruits/auto-attack restored, target level loaded fresh (monsters alive, chests full)

### Adding new persistent party state
If a new field is added to party members, it will be saved automatically via `_serializeMember`. No checklist needed — party is deep-cloned.

### Adding new non-party persistent state (e.g. a global quest flag)
Add it explicitly to the save object in `autoSave()` and restore it in `_applyPendingLoad()` in `main.js`.

### Key files
- `src/save-game.js` — `autoSave`, `listSaves`, `triggerLoad`, `consumePendingLoad`
- `src/main.js` — `_applyPendingLoad` (post-init restore), pre-init recruit restore

## Architecture Quick Reference

- Party: 4 members in `party[]` array (`party.js`), HUD cards `member-0` through `member-3`
- Equipment: `extendPartyData()` in `equipment.js`, always call `updateEffectiveStats(m)` after changes
- Loadout B: `m.loadoutB = { leftHand, rightHand, potion, skill }`, swap with `rotateLoadout(memberIndex)`
- Keys 1-4: rotate loadout for member 0-3
- Monsters: `monsters[]` array in `monster.js`, each has `level` property (1/2/3)
- Objects: spawned fresh each level load by `spawnObjectsForLevel()` in `objects.js`
- `bothHands` weapons: mirror to both leftHand+rightHand; when storing to loadoutB only store in leftHand

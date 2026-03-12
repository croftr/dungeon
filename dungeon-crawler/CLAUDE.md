# Dungeon Crawler — Development Guidelines

## Save Game System (v2)

The save system persists full world state to `localStorage`. Any new feature that introduces **mutable game state** must be wired into the save/load system.

### Checklist for new features

**New global flag** (e.g. a new gate, cutscene seen, quest progression):
1. Add the flag variable in `objects.js` (or wherever it lives)
2. Add it to `getWorldFlags()` / `setWorldFlags()` in `objects.js`
3. Add it to the `flags` section of the save schema in `save-game.js` → `saveGame()`
4. If it affects object spawning, use it in `spawnObjectsForLevel()` (e.g. portcullis `startOpen` param)

**New monster type**:
- Automatic — `getMonsterStates()` iterates the `monsters[]` array by level

**New container** (chest, rack, cabinet, anvil, bone pile):
1. Call `_nextContainerId++` at the top of your `add*()` function
2. Check `_pendingContainerOverrides` for saved contents override
3. Assign `child.userData.containerId = cid` on interactive meshes
4. Follow the existing pattern in `addChest`, `addWeaponRack`, etc.

**New per-level state** (e.g. new shop, new interactive system):
1. Add getter/setter exports in the relevant module
2. Update `snapshotCurrentLevel()` in `save-game.js` to capture it
3. Update `loadLevel()` in `main.js` to restore it from accumulated state
4. Update `_checkPendingLoad()` in `main.js` to restore it on load

**Breaking schema changes**: Bump the `version` number in `saveGame()` and add migration logic in `consumePendingLoad()`.

### Key files
- `src/save-game.js` — Central save/load orchestration, accumulated world state
- `src/objects.js` — Gate flags, container state, merchant stock serialization
- `src/monster.js` — Monster alive/hp serialization
- `src/main.js` — Restore orchestration in `_checkPendingLoad()`, level transition hooks

### Video flags bridge
Video-seen flags in `main.js` are bridged to the save system via `window._saveFlags`. When adding a new video flag, update `window._saveFlags` when setting it to true, and restore it in `_checkPendingLoad()`.

## Architecture Quick Reference

- Party: 4 members in `party[]` array (`party.js`), HUD cards `member-0` through `member-3`
- Equipment: `extendPartyData()` in `equipment.js`, always call `updateEffectiveStats(m)` after changes
- Loadout B: `m.loadoutB = { leftHand, rightHand, potion, skill }`, swap with `rotateLoadout(memberIndex)`
- Keys 1-4: rotate loadout for member 0-3
- Monsters: `monsters[]` array in `monster.js`, each has `level` property (1/2/3)
- Objects: spawned fresh each level load by `spawnObjectsForLevel()` in `objects.js`
- `bothHands` weapons: mirror to both leftHand+rightHand; when storing to loadoutB only store in leftHand

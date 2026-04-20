# Dungeon Crawler — Development Guidelines

## Save Game System (v7 — Checkpoint / Level-State)

Saves fire automatically on dungeon-level transitions. No manual save, no mid-level save. The saved payload describes *progression*, not a snapshot of every game object — world state is rebuilt by re-running the level spawn code with the right flags.

### Core model
- Dungeon levels 1–5 have two canonical states: **start** (pristine) and **end** (all gates open, all chests empty; non-boss monsters respawned to full HP; bosses stay dead only if previously killed — see "Boss monsters" below).
- Level 0 is the hub and never "clears." The Level 0 starter stash is the only persistent bank.
- `currentLevelReached` is the highest dungeon level the player has entered. On load, every dungeon level `< currentLevelReached` (and ≠ `currentLevel`) is rebuilt in end state; `currentLevel` is rebuilt in start state and the player spawns at its entry portal (`findCell(CELL_START)`).
- Items left in chests on a level that flips to end state are **lost** (by design).

### Key files
- `src/save-checkpoint.js` — `captureCheckpoint`, `loadCheckpoint`, `autoSaveCheckpoint`, `SAVE_VERSION = 7`
- `src/save-level-state.js` — `buildEndStateFlags(clearedLevels)`, per-level flag whitelist
- `src/monster.js` — `applyClearedLevelMonsters(n)` implements the cleared-level monster transform
- `src/save-game.js` — thin shim: `listSaves`, `triggerLoad`, `consumePendingLoad`, `deleteSave` + startup purge of pre-v7 keys
- `src/main.js` — `loadLevel()` calls `autoSaveCheckpoint()` on transitions; `setEmptyAllContainers` + `applyClearedLevelMonsters` apply the end-state transform on cleared levels
- `src/objects.js` — `setEmptyAllContainers` sentinel + `snapshotStarterStash` / `getPersistedStarterStashItems` for the stash bank

### How state is captured
Instead of a registry, `captureCheckpoint()` calls explicit `capture*` / `restore*` helpers on each module:
| Module | Captures |
|--------|----------|
| `party.js` | `capturePartyState` / `restorePartyState` — members, gold, autoAttack flags |
| `quest.js` | `getQuestLog` / `setQuestLog` |
| `recruits.js` | `captureRecruits` / `restoreRecruits` — recruit isRecruited map |
| `monster.js` | `captureMonsterState` / `restoreMonsterState` — droppedBossEssences, killedBosses |
| `essentiary.js` | `captureEssentiary` / `restoreEssentiary` — arena monster tiers |
| `objects.js` | `captureWorldState` / `restoreWorldState` — flags, merchant/potion stock, known recipes |
| `main.js` | `captureVideoFlags` / `restoreVideoFlags` — cutscene seen flags |

Player position and facing are NOT saved — they derive from the current level's entry portal.

### Save slots
Keyed by `currentLevelReached` (`dungeon-save-lvl-<n>`). Each new checkpoint overwrites the slot for that level tier — so the player has coarse undo between level milestones.

### Adding new persistent state
1. **New party member field** — automatic (party is deep-cloned by `capturePartyState`).
2. **New module state** — add `captureFoo` / `restoreFoo` exports and call them from `captureCheckpoint` / `loadCheckpoint` in `save-checkpoint.js`.
3. **New flag that applies to a specific dungeon level in end state** — add it to the whitelist in `getEndStateFlagsForLevel(n)` in `save-level-state.js`.

### What NOT to save
- Per-level gate flags — derived from the end-state rule.
- Container contents outside the starter stash — chests on cleared levels are forced empty; chests on the current level are re-spawned fresh.
- Per-monster HP / alive on cleared levels — `applyClearedLevelMonsters` respawns non-bosses and leaves killed bosses dead on load. Only the global `killedBosses` set is persisted.
- Player position — derived from `findCell(CELL_START)` on current level.

### Save-load flow
1. Startup: `save-game.js` purges any pre-v7 keys from localStorage.
2. Player clicks a save in the Esc menu → `triggerLoad` copies it to `sessionStorage` and reloads the page.
3. On reload, main.js reads `consumePendingLoad()` → hydrates recruits pre-init → `loadCheckpoint(save)` after init:
   - Restore party / quests / recruits / monster / essentiary / video.
   - Build flag payload = saved `worldFlags` ∪ `buildEndStateFlags(cleared levels)`; apply with `setWorldFlags`.
   - `applyClearedLevelMonsters(l)` for each cleared level.
   - `window.loadLevel(save.currentLevel)` — spawns start state.

### Boss monsters
A monster is a "boss" iff its entry in `src/data/monsters.json` has an `image` field. On kill, `_applyDamage` in `monster.js` adds its `${level}:${id}` to the global `_killedBosses` set (captured in the save). On cleared-level rebuild, bosses in that set stay dead; all other monsters respawn to full HP. Summoned monsters (e.g. Treeman treekin, flagged `m.summoned = true`) are skipped entirely.

## Architecture Quick Reference

- Party: 4 members in `party[]` array (`party.js`), HUD cards `member-0` through `member-3`
- Equipment: `extendPartyData()` in `equipment.js`, always call `updateEffectiveStats(m)` after changes
- Loadout B: `m.loadoutB = { leftHand, rightHand, potion, skill }`, swap with `rotateLoadout(memberIndex)`
- Keys 1-4: rotate loadout for member 0-3
- Monsters: `monsters[]` array in `monster.js`, each has `level` property (1/2/3)
- Objects: spawned fresh each level load by `spawnObjectsForLevel()` in `objects.js`
- `bothHands` weapons: mirror to both leftHand+rightHand; when storing to loadoutB only store in leftHand

# Dungeon Crawler — Development Guidelines

## Save Game System (v6 — Registry Pattern)

Each module registers its own `serialize`/`restore` callbacks with `src/save-registry.js`. Auto-saves on level transitions, manual save via Esc menu.

### How it works
- `src/save-registry.js` — `registerSaveHandler(key, { serialize, restore })`, `serializeAll()`, `restoreAll(data)`
- Each module registers a handler at the bottom of its file (party.js, player.js, objects.js, quest.js, recruits.js, main.js)
- `autoSave(levelNum)` in `loadLevel()` calls `serializeAll()` to capture all state
- Esc → Save Game creates a manual save; Esc → Load Game lists saves newest-first
- On load: `restoreAll(save)` calls every registered restore, then `loadLevel(targetLevel)` re-spawns the level

### Registered handlers
| Key | Module | What it saves |
|-----|--------|---------------|
| `party` | `party.js` | members[], gold, autoAttack, autoRangeAttack |
| `player` | `player.js` | gridRow, gridCol, facing |
| `world` | `objects.js` | world flags, merchant stock, potion merchant stock |
| `quests` | `quest.js` | quest log |
| `recruits` | `recruits.js` | recruit isRecruited map |
| `video` | `main.js` | cutscene seen flags |
| `level` | `main.js` | currentLevel, visited container states |

### Adding new persistent state
1. If it's a **party member field** — it's saved automatically (party is deep-cloned)
2. If it's **new module state** — add `registerSaveHandler` at the bottom of your module with `serialize`/`restore`
3. If it's **new state in an existing module** — update that module's existing handler

### Key files
- `src/save-registry.js` — the registry
- `src/save-game.js` — `autoSave`, `manualSave`, `listSaves`, `triggerLoad`, `consumePendingLoad`
- `src/main.js` — `_applyPendingLoad` (calls `restoreAll`), pre-init recruit restore

## Architecture Quick Reference

- Party: 4 members in `party[]` array (`party.js`), HUD cards `member-0` through `member-3`
- Equipment: `extendPartyData()` in `equipment.js`, always call `updateEffectiveStats(m)` after changes
- Loadout B: `m.loadoutB = { leftHand, rightHand, potion, skill }`, swap with `rotateLoadout(memberIndex)`
- Keys 1-4: rotate loadout for member 0-3
- Monsters: `monsters[]` array in `monster.js`, each has `level` property (1/2/3)
- Objects: spawned fresh each level load by `spawnObjectsForLevel()` in `objects.js`
- `bothHands` weapons: mirror to both leftHand+rightHand; when storing to loadoutB only store in leftHand

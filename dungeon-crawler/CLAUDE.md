# Dungeon Crawler — Development Guidelines

## Git Workflow

- Always work directly on `main`. Do not create new branches unless explicitly asked.
- Commit changes directly to `main` and do not open PRs unless asked.

## Save Game

The game has a working save/load system. **Any code change that introduces new mutable state must be save-compatible.** The rules below are non-negotiable; full guide and common pitfalls are in [SAVE_GAME.md](SAVE_GAME.md) — read it before adding any persistent flag, set, container, or NPC state.

### The two rules

1. **No hidden state.** Mutable game state must live on a known canonical root (listed below). Never put save-relevant state in module-local `let` bindings, closures, mesh `userData`, DOM attributes, or `window._*` ad-hoc bags — none of these survive a page reload.
2. **JSON-able values only.** Numbers, strings, booleans, plain objects/arrays. Sets and Maps must be converted at the capture/restore boundary (`[...set]` on capture, `new Set(arr)` on restore). No class instances, THREE.js refs, DOM nodes, or functions.

### Canonical state roots

| Root | What it holds | Module |
|---|---|---|
| `party[]` | members, equipment, inventory, skills, gold | `party.js` |
| `monsters[]` | per-monster alive/hp/hpMax/position/buffs/corpse contents | `monster.js` |
| `_state` | gate / portal / NPC progression flags, crystal shrine state | `objects.js` |
| `_collections` (objects.js) | Sets of "things that happened" — known recipes, seen essences, disarmed traps, opened trial gates, spoken-to NPCs, etc. | `objects.js` |
| `_collections` (monster.js) | dropped boss essences, killed bosses | `monster.js` |
| `_containerContentsPersistence` | chest/rack/cabinet/anvil/bone-pile contents, keyed by `"<type>:<level>,<col>,<row>"` | `objects.js` |
| `_persistedStarterStashItems` | Level 0 stash contents (separate channel from the dict above) | `objects.js` |
| `window.videoFlags` | cutscene seen flags | `main.js` |
| `window.currentLevel`, `currentLevelReached`, `easyMode`, `helpEnabled` | session settings | `main.js` |
| `window.arenaState` | ephemeral arena session state — **intentionally NOT saved** | `main.js` |

If your new state doesn't fit any existing root, add a new `capture*` / `restore*` pair to the owning module and wire it into `src/save.js`. **Do not** add free-floating fields to the bundle.

### Capture / restore boundary

Every owning module exposes a pair. `src/save.js`'s `captureSave()` calls them all in order; `applySavePreInit` + `applySavePostInit` mirror on the way back:

| Module | Captures / restores |
|--------|---------------------|
| `party.js` | `capturePartyState` / `restorePartyState` |
| `player.js` | `capturePlayerState` / `restorePlayerState` |
| `monster.js` | `captureMonsterState` / `restoreMonsterState` |
| `objects.js` | `captureWorldState` / `restoreWorldState` (and `getWorldFlags` / `setWorldFlags` underneath) |
| `quest.js` | `getQuestLog` / `setQuestLog` |
| `recruits.js` | `captureRecruits` / `restoreRecruits` |
| `essentiary.js` | `captureEssentiary` / `restoreEssentiary` |
| `help.js` | `captureHelpState` / `restoreHelpState` |
| `main.js` | `window.videoFlags` (in-place); inline session bag |

### Workflow when adding state

1. Pick the canonical root from the table above. If none fits, add a new module pair.
2. Make sure your value is JSON-able. Sets/Maps → convert at the boundary.
3. If level spawn code reads it, your restore must run *before* `loadLevel` in `applySavePostInit` (the current order already does this — mirror it).
4. If you add a new container spawner or `loader.load` callback that pushes to `interactables`, **add the spawn-generation guard** (see SAVE_GAME.md "Async loader callbacks").
5. Test: save → reload → confirm state persists. Especially across level transitions.

### Bundle mechanics (one paragraph)

`captureSave()` builds a JSON bundle from each module's `capture*` and writes it to `localStorage` under `dungeon-save-<timestamp>`. Saving is blocked in the arena and schematic trials (`whyCantSave()` in `src/save.js`). Loading copies the bundle into `sessionStorage` and reloads the page — this is the cleanup pass; every in-flight tween/scene-object/animation is thrown away by definition, so save only captures durable state. On the new page, `applySavePreInit` runs before `initRecruits`/`initObjects` (so the level spawner uses restored recruit + session state); `applySavePostInit` runs at the end (after `window.loadLevel` is defined) to apply everything else and trigger the loaded level.

## Architecture Quick Reference

- Party: 4 members in `party[]` array (`party.js`), HUD cards `member-0` through `member-3`
- Equipment: `extendPartyData()` in `equipment.js`, always call `updateEffectiveStats(m)` after changes
- Ammo B: `m.ammoB` holds an alternate ammo item, swapped with `m.equipment.ammo` via `rotateAmmo(memberIndex)`
- Keys 1-4: swap active ammo with ammo B for member 0-3
- Relic slot: `m.equipment.relic` (paperdoll bottom-right) — placeholder for upcoming relic items, no effects yet
- Monsters: `monsters[]` array in `monster.js`, each has `level` property (1/2/3)
- Objects: spawned fresh each level load by `spawnObjectsForLevel()` in `objects.js`
- `bothHands` weapons: mirror to both leftHand+rightHand

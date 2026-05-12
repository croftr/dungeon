# Dungeon Crawler — Development Guidelines

## Git Workflow

- Always work directly on `main`. Do not create new branches unless explicitly asked.
- Commit changes directly to `main` and do not open PRs unless asked.

## Save Game System

**There is currently no save system.** The previous v7 checkpoint / "cleared-levels-go-empty" design was scrapped — it was brittle, hard to test, and lost player items by design. A replacement will be designed later.

Current focus is **state-cleanup groundwork** so a future save system can serialize the game cleanly. Two rules:

1. **No hidden state.** Mutable game state must live on a known root (e.g. `party[]`, `monsters[]`, `_state` in objects.js, `window.videoFlags`) — not in module-local `let` bindings, closures, or the DOM. New flags go on existing roots.
2. **JSON-able values.** Pure numbers/strings/booleans/arrays/plain objects. Sets and Maps need explicit conversion at the boundary.

### Capture / restore helpers (kept for the future save system)
These are pure getters/setters — no orchestration, no I/O. They give a future save layer one entry point per module:

| Module | Helpers |
|--------|---------|
| `party.js` | `capturePartyState` / `restorePartyState` |
| `quest.js` | `getQuestLog` / `setQuestLog` |
| `recruits.js` | `captureRecruits` / `restoreRecruits` |
| `monster.js` | `captureMonsterState` / `restoreMonsterState` |
| `essentiary.js` | `captureEssentiary` / `restoreEssentiary` |
| `objects.js` | `captureWorldState` / `restoreWorldState` (and `getWorldFlags` / `setWorldFlags` underneath) |
| `main.js` | `captureVideoFlags` / `restoreVideoFlags` (operate on `window.videoFlags`) |

### Canonical world state
`objects.js` declares its save-relevant state on a single `_state` object near the top of the file (gate/portal/NPC progression flags, crystal shrine state). Adding a new world flag = one line on `_state`; `getWorldFlags` spreads it, `setWorldFlags` overlays onto it.

### Cutscene flags
`window.videoFlags` is the single object holding "have we seen this video" flags. Add new keys directly to its initializer in `main.js`.

## Architecture Quick Reference

- Party: 4 members in `party[]` array (`party.js`), HUD cards `member-0` through `member-3`
- Equipment: `extendPartyData()` in `equipment.js`, always call `updateEffectiveStats(m)` after changes
- Ammo B: `m.ammoB` holds an alternate ammo item, swapped with `m.equipment.ammo` via `rotateAmmo(memberIndex)`
- Keys 1-4: swap active ammo with ammo B for member 0-3
- Relic slot: `m.equipment.relic` (paperdoll bottom-right) — placeholder for upcoming relic items, no effects yet
- Monsters: `monsters[]` array in `monster.js`, each has `level` property (1/2/3)
- Objects: spawned fresh each level load by `spawnObjectsForLevel()` in `objects.js`
- `bothHands` weapons: mirror to both leftHand+rightHand

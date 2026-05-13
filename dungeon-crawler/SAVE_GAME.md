# Save Game — Author's Guide

This doc is for anyone adding a feature to the game. **Every code change that introduces new mutable state must be save-compatible** — otherwise the player will lose that state on reload. Two minutes here will save hours of "why does my flag reset?" debugging later.

## How save works (in one paragraph)

A save bundle is a JSON snapshot of the game produced by `captureSave()` in `src/save.js`. It calls a `capture*` helper on every module that owns save-relevant state, gathers the results into a flat object, and writes it to `localStorage` under a timestamped key (`dungeon-save-<ms>`). Loading reads the bundle out of `sessionStorage` after a page reload, then `applySavePreInit` + `applySavePostInit` call the matching `restore*` helpers in the right order. The page reload is the cleanup pass — every in-flight tween/animation/scene-object is thrown away by definition, so save only needs to capture *durable* state.

## The capture/restore boundary

| Module | Captures | Restores |
|--------|----------|----------|
| `party.js` | `capturePartyState` | `restorePartyState` |
| `player.js` | `capturePlayerState` | `restorePlayerState` |
| `monster.js` | `captureMonsterState` | `restoreMonsterState` |
| `objects.js` | `captureWorldState` | `restoreWorldState` |
| `quest.js` | `getQuestLog` | `setQuestLog` |
| `recruits.js` | `captureRecruits` | `restoreRecruits` |
| `essentiary.js` | `captureEssentiary` | `restoreEssentiary` |
| `help.js` | `captureHelpState` | `restoreHelpState` |
| `main.js` (videoFlags) | `{ ...window.videoFlags }` | in-place restore in `save.js` |
| `main.js` (session) | inline (`session: { currentLevel, currentLevelReached, easyMode, helpEnabled }`) | inline |

If you find yourself wanting to add a new top-level field to the bundle, **stop**. Add a `capture*`/`restore*` pair to the owning module and call it from `save.js`. Don't smuggle state in via random side-bags.

## The two rules of state

### 1. No hidden state

Mutable game state must live on a **known root**:

- `party[]` (members, equipment, inventory, skills)
- `monsters[]` (alive/hp/position/buffs)
- `_state` in `objects.js` (gate / portal / NPC progression flags)
- `_collections` in `objects.js` and `monster.js` (Sets of "things that happened")
- `window.videoFlags` (cutscene seen flags)
- `window.currentLevel`, `window.currentLevelReached`, `window.easyMode`, `window.helpEnabled`
- `window.arenaState` (ephemeral, intentionally NOT saved)

Do **not** put save-relevant state in:

- Module-local `let` bindings (they reset on page reload; saves can't see them)
- Closures
- DOM attributes (`userData`, `data-*`, classList) — these are scene-only and die on `clearObjects`
- `window._*` ad-hoc bags

If you need a new "have we done X yet?" flag, put it on the right existing root. Examples:

- World/level/NPC progression flag → add a key to `_state` in `objects.js`. Adding it is one line.
- "Player has seen this cutscene" → add a key to `window.videoFlags` in `main.js`.
- "Player has interacted with NPC N" / "level-50 gate G is open" / etc. (a set-membership thing) → add a Set to `_collections` in `objects.js`, plus one line in capture/restoreWorldState.
- New per-monster field → add it to `captureMonsterState` / `restoreMonsterState` (and snapshot it from `m.<field>`).
- New per-party-member field → automatic, since `capturePartyState` deep-clones the member object.

### 2. JSON-able values only

The bundle goes through `JSON.stringify` / `JSON.parse`. Anything that doesn't survive that round-trip is broken:

- ✅ numbers, strings, booleans, `null`
- ✅ plain objects, plain arrays
- ❌ `Set`, `Map` — convert at the boundary (`[...set]` on capture, `new Set(arr)` on restore)
- ❌ class instances with methods, THREE.js meshes, DOM nodes, functions — these are presentation, not state. Throw away.
- ❌ circular references

## Common pitfalls (each one bit us)

### Container persistence keys must be unique per container

`_containerContentsPersistence` in `objects.js` is keyed by `"<type>:<level>,<col>,<row>[,<offsetX>]"`. Every container spawner (`addChest`, `addWeaponRack`, `addSpellCabinet`, `addAnvil`, `addBonePile`, `addPortalActivatorStatue`) prefixes the key with its type (`chest:`, `rack:`, etc) so different container kinds at the same grid cell don't collide. Two chests at the same cell with different `offsetX` get distinct keys via the offset suffix.

**If you add a new container type:** give it its own type prefix. Don't use a bare `${level},${col},${row}` key.

### Async loader callbacks need spawn-generation guards

`loader.load(...)` is async. If the player triggers a level transition before a GLB finishes loading, the callback can fire on the *next* level and push orphan meshes into `interactables`. Every container spawner captures `_spawnGeneration` at call time and bails in the callback if it's stale. Pattern:

```js
const _spawnGen = _spawnGeneration;
loader.load(url, (gltf) => {
  if (_spawnGen !== _spawnGeneration) return; // stale; aborted
  ...
});
```

**If you add a new spawner that uses `loader.load` and pushes to `interactables`:** wrap the callback with this guard.

### State driven by `m.hpMax`-style derived stats must also be captured

If a mechanic mutates a "looks immutable" stat (like easy-mode halving `m.hpMax`), the mutated value must be captured, not just the runtime value. Otherwise restore reinits the stat from the def, gives you a mismatched `hp` / `hpMax`, and the HP bar shows wrong.

**Rule of thumb:** if your feature ever writes to `m.<somethingMax>` or a similar derived-looking field, add it to `captureMonsterState`.

### "First-time vs subsequent" interactions

A few NPCs play a different audio line the first time you talk to them. The first-vs-subsequent state lives in `_collections.spokenToNpcs` (Set keyed by `"<level>,<col>,<row>"`), captured/restored as part of world state. Don't store this kind of "have we triggered yet?" toggle only on the mesh's `userData` — it gets wiped on level reload.

**If you add a new one-shot interaction:** put the marker in `_collections` on the right side, or on the canonical root that owns the entity.

### Player position is captured; spawn position is not

`restorePlayerState` overrides whatever `loadLevel` does for player position — but only when restoring a save. Normal level transitions still use the per-level entry-portal logic in `loadLevel`. If you add new level entry positions, do it in `loadLevel`'s transition logic; don't try to bake it into save data.

### Special levels (arena 99, schematic trials 50) block saving

`whyCantSave()` in `save.js` refuses to save while the player is in the arena or in the schematic trials. Their internal state is ephemeral by design — a save snapshot mid-arena would be ill-defined. If you add another zone with similar properties, extend `whyCantSave()`.

## Workflow when adding a feature

A quick mental checklist:

1. **Where does the state live?** Pick a canonical root from the list above. If none fits, you probably need a new module with its own `capture*`/`restore*` pair — wire it up in `save.js`.
2. **Is the value JSON-able?** If it's a Set/Map/class instance/THREE.js ref, decide: is it state (convert at the boundary) or presentation (throw away on reload)?
3. **Does the level spawn code need to read it on level entry?** Then `setWorldFlags` (or your module's `restore*`) must run *before* `loadLevel` in `applySavePostInit`. Currently it does — but if you add a new boundary that's read during spawn, mirror this ordering.
4. **Does it interact with `clearObjects` / `loader.load`?** Add the spawn-generation guard.
5. **Test:** save → reload → confirm state persists. Save on each of L0/L1/L2/etc and reload there. The bug is almost always "I forgot field X" — easier to find now than a week later.

## Files at a glance

- `src/save.js` — the orchestrator. Bundle shape, list/delete/load helpers, UI, page-reload handoff, post-init progress overlay, audio-context unlock-on-first-gesture.
- `src/main.js` — `applySavePostInit` is wired at the bottom (around the "SAVE RESTORE — POST-INIT PHASE" comment). `applySavePreInit` near the top of init (for recruits + session settings that must apply before `initRecruits` / `initObjects`).
- `src/objects.js` — `_state` (flags), `_collections` (membership sets), `_containerContentsPersistence` (dict by typed key), `captureWorldState` / `restoreWorldState`, `_spawnGeneration`.
- Per-module: every other module listed in the boundary table has its `capture*` / `restore*` near its existing save section.

## When in doubt

Save the game, reload, and look for the symptom. If a flag/item/state didn't survive the round-trip, it's not on a canonical root. Find where it actually lives and move it.

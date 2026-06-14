---
name: project-chasm-bridge
description: Level 2 east chasm bridge + reusable CELL_CHASM/CELL_BRIDGE open-air cell types
metadata:
  type: project
---

Level 2 has an open-air bridge spanning a black chasm, reached by heading EAST out of Room C's east edge (status readout `(21,12)` = col 21, row 12). Layout (row,col): thin passage (12, 22-24) → bridge (12, 25-30) → door (12,31) → empty far room (10-14, 32-36). Far room has an empty magic chest against the east wall (`addChest` col 36, row 12, rotY -Math.PI/2, offsetX -0.5, scale 0.44) in `src/levels/level2/objects.js`. Chasm void fills rows 10-15 × cols 25-30 minus the bridge row. Carved via a mutation block at the bottom of `src/levels/level2/map.js` (runs AFTER the crow-realm walling so it wins). Bridge texture overlay is in `applyLevel2Textures()` (main.js) using `/textures/bridge-floor.png`, registered as floor zone `'bridge'` so walking on it plays `/sounds/floor-creak.mp3` (see `FLOOR_ZONE_DEFS` in player.js — `ringOut: true` so the creak isn't cut on arrival; `speedFactor: 1` is required or `currentMoveMs` produces NaN).

Also reused on **Level 3**: a bridge (row 16, cols 19-21) heads east off the elemental-shrine corridor end (old Red Crystal egg spot col 18,row 16) over a chasm into a small room (rows 15-17, cols 23-25); the Red Crystal ethereal egg (`addPortalActivatorStatue`) was moved into that room at col 24,row 16. Carved via a mutation block at the bottom of `src/levels/level3/map.js`; bridge texture/zone added in `applyLevel3Textures()`.

Two reusable cell types added in `src/map.js`:
- `CELL_CHASM = 14` — passable but LETHAL. Renders nothing (no floor/ceiling/wall/boundary wall) → pure black. Stepping onto it drops every living member to 0 HP → game-over (handler near the top of `moved()` in main.js, keyed on `cell === CELL_CHASM`, works on any level).
- `CELL_BRIDGE = 15` — passable & safe. Renders a floor but NO ceiling (open air). Overlay a custom floor texture via `buildFloorZone`.

`buildLevel` instance counts must stay in sync with placements: chasm = nothing, bridge = floor only, hole = ceiling only. Minimap (`minimap.js`): chasm skipped (transparent like holes), bridge gets a warm plank color. No save migration needed — the carve is deterministic at module load. Reuses the [[project_runtime_map_changes]] rebuild path (`window.rebuildLevel2Geometry`).

Note: `bridge-floor.png` is ~7 MB — large; consider re-exporting as a smaller webp if load hitches.

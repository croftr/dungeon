// ─────────────────────────────────────────────────────────────────────────────
//  CROW REALM  — a self-contained, load-on-demand area (level 60).
//
//  Reached ONLY through the mist portal on Level 2; nothing here is loaded until
//  the party proceeds through the mist, and it is torn down again on return.
//
//  The geometry deliberately reuses Level 2's coordinate system (the crow region
//  used to live inside Level 2 at rows 1–11, cols 25–57) so the monster, object
//  and texture coordinates are unchanged. The same cell lists are exported so
//  Level 2 can wall the region off (it must not appear on the Level 2 map) and
//  so loadLevel() can paint the crow textures here instead.
//
//  Cell codes: 0 = floor, 1 = wall, 2 = start.
// ─────────────────────────────────────────────────────────────────────────────

// North wing (new): reached by punching a doorway in Small Room 1's north wall
// ([6,41]). A row-5 corridor runs west→east feeding four small rooms (rows 1–3);
// two of them hold chests. The wing lives in rows 0–5, cols 38–53 — solid wall in
// both this map and Level 2's grid, so Level 2's crow wall-off stays a no-op here.
const CROW_NORTH_WING_FLOORS = [
  // doorway up out of Small Room 1
  [6, 41],
  // north corridor (row 5)
  [5, 38], [5, 39], [5, 40], [5, 41], [5, 42], [5, 43], [5, 44],
  [5, 45], [5, 46], [5, 47], [5, 48], [5, 49], [5, 50], [5, 51],
  // room doorways (row 4)
  [4, 39], [4, 43], [4, 47], [4, 51],
  // Room A (cols 38–40)
  [1, 38], [1, 39], [1, 40], [2, 38], [2, 39], [2, 40], [3, 38], [3, 39], [3, 40],
  // Room B (cols 42–44)  ← chest
  [1, 42], [1, 43], [1, 44], [2, 42], [2, 43], [2, 44], [3, 42], [3, 43], [3, 44],
  // Room C (cols 46–48)
  [1, 46], [1, 47], [1, 48], [2, 46], [2, 47], [2, 48], [3, 46], [3, 47], [3, 48],
  // Room D (cols 50–52)  ← chest
  [1, 50], [1, 51], [1, 52], [2, 50], [2, 51], [2, 52], [3, 50], [3, 51], [3, 52],
];

// Walkable cells of the crow region.
export const CROW_FLOOR_CELLS = [
  // Stance NPC room (annex)
  [1, 32], [1, 33], [1, 34], [1, 35], [1, 36],
  [2, 32], [2, 33], [2, 34], [2, 35], [2, 36],
  [3, 32], [3, 33], [3, 34], [3, 35], [3, 36],
  // Corridor between annex and Crow Wizard room
  [4, 34], [5, 34], [6, 34],
  // Crow Wizard room
  [7, 30], [7, 31], [7, 32], [7, 33], [7, 34], [7, 35],
  [8, 30], [8, 31], [8, 32], [8, 33], [8, 34], [8, 35],
  [9, 30], [9, 31], [9, 32], [9, 33], [9, 34], [9, 35],
  // Entry corridor (west dead-end at col 25 holds the return mist)
  [8, 25], [8, 26], [8, 27], [8, 28], [8, 29],
  // Passage 1
  [8, 36], [8, 37], [8, 38], [8, 39],
  // Small Room 1
  [7, 40], [7, 41], [7, 42],
  [8, 40], [8, 41], [8, 42],
  [9, 40], [9, 41], [9, 42],
  // Passage 2
  [8, 43], [8, 44], [8, 45],
  // Small Room 2
  [7, 46], [7, 47], [7, 48],
  [8, 46], [8, 47], [8, 48],
  [9, 46], [9, 47], [9, 48],
  // Passage 3
  [8, 49], [8, 50], [8, 51],
  // Bigger Room
  [6, 52], [6, 53], [6, 54], [6, 55], [6, 56], [6, 57],
  [7, 52], [7, 53], [7, 54], [7, 55], [7, 56], [7, 57],
  [8, 52], [8, 53], [8, 54], [8, 55], [8, 56], [8, 57],
  [9, 52], [9, 53], [9, 54], [9, 55], [9, 56], [9, 57],
  [10, 52], [10, 53], [10, 54], [10, 55], [10, 56], [10, 57],
  // North wing floors (corridor + four rooms) — see CROW_NORTH_WING_FLOORS above.
  ...CROW_NORTH_WING_FLOORS,
];

// Perimeter / inner wall cells that take the crow-wall texture.
export const CROW_WALL_CELLS = [
  // approach corridor walls
  [7, 25], [7, 26], [7, 27], [7, 28], [7, 29],
  [9, 25], [9, 26], [9, 27], [9, 28], [9, 29],
  // crow room perimeter ([6,34] is the north doorway; [8,36] the east exit)
  [6, 30], [6, 31], [6, 32], [6, 33], [6, 35],
  [10, 30], [10, 31], [10, 32], [10, 33], [10, 34], [10, 35],
  [7, 36], [9, 36],
  // annex corridor sides (col 34, rows 4–6)
  [4, 33], [4, 35],
  [5, 33], [5, 35],
  // annex room perimeter
  [0, 32], [0, 33], [0, 34], [0, 35], [0, 36],   // north (map edge)
  [1, 31], [2, 31], [3, 31],                     // west wall
  [1, 37], [2, 37], [3, 37],                     // east wall
  [3, 32], [3, 33], [3, 35], [3, 36],            // south wall (doorway at [3,34])
  // extended east passages & rooms walls
  [7, 37], [7, 38], [7, 39],
  [9, 37], [9, 38], [9, 39],
  [6, 40], [6, 42],   // [6,41] opened as the north-wing doorway
  [10, 40], [10, 41], [10, 42],
  [7, 43], [7, 44], [7, 45],
  [9, 43], [9, 44], [9, 45],
  [6, 46], [6, 47], [6, 48],
  [10, 46], [10, 47], [10, 48],
  [7, 49], [7, 50], [7, 51],
  [9, 49], [9, 50], [9, 51],
  // bigger room perimeter
  [5, 52], [5, 53], [5, 54], [5, 55], [5, 56], [5, 57],
  [11, 52], [11, 53], [11, 54], [11, 55], [11, 56], [11, 57],
  [6, 51], [7, 51], [9, 51], [10, 51],
  [6, 58], [7, 58], [8, 58], [9, 58], [10, 58],
];

// Where the party materialises after stepping through the mist (and the cell the
// return mist faces back out from).
export const CROW_ENTRY = { row: 8, col: 26, facing: 1 }; // facing East
export const CROW_RETURN_MIST = { row: 8, col: 25 };      // west dead-end of the entry corridor

// Build the grid: all walls, then carve the floor cells and drop the start tile.
const ROWS = 12;   // rows 0–11 cover the whole region (max floor row 10, wall row 11)
const COLS = 58;   // cols 0–57 (col-58 east wall is added by the texture zone)

// Auto-texture the north wing's surrounding walls so they pick up the crow-wall
// texture like the hand-listed perimeter above. Any wall cell touching a wing
// floor (8-neighbour) that isn't itself a floor gets added to CROW_WALL_CELLS.
{
  const floorKeys = new Set(CROW_FLOOR_CELLS.map(([r, c]) => `${r},${c}`));
  const wallKeys = new Set(CROW_WALL_CELLS.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of CROW_NORTH_WING_FLOORS) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (floorKeys.has(k) || wallKeys.has(k)) continue;
        CROW_WALL_CELLS.push([nr, nc]);
        wallKeys.add(k);
      }
    }
  }
}

function _buildCrowRealmMap() {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(1));
  for (const [r, c] of CROW_FLOOR_CELLS) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = 0;
  }
  grid[CROW_ENTRY.row][CROW_ENTRY.col] = 2; // CELL_START
  return grid;
}

export const crowRealmMap = _buildCrowRealmMap();

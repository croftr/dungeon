/**
 * test/round-trip-player.test.js
 *
 * Round-trip tests for player.js: capturePlayerState / restorePlayerState.
 *
 * State owned by player.js:
 *   player.gridRow   number
 *   player.gridCol   number
 *   player.facing    number (0-3)
 *
 * capturePlayerState returns { gridRow, gridCol, facing }.
 * restorePlayerState(data, camera?) applies the snapshot. Camera arg is
 * skipped in tests (no THREE.js camera available in jsdom).
 *
 * Note: player.js imports map.js (isPassable, cellToWorld, etc.) and
 * @tweenjs/tween.js. Those don't need stubs — they're pure JS that works in jsdom.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('round-trip: player.js', () => {
  it('default player state survives round-trip', async () => {
    const mod = await freshImport('src/player.js');
    const snap1 = jsonRoundTrip(mod.capturePlayerState());

    const mod2 = await freshImport('src/player.js');
    mod2.restorePlayerState(snap1); // no camera arg — skipped in tests
    const snap2 = mod2.capturePlayerState();

    expect(snap2).toEqual(snap1);
  });

  it('mutated position and facing survive round-trip', async () => {
    const mod = await freshImport('src/player.js');

    // Mutate directly — the public API (moveForward/turnPlayer) requires a camera
    mod.player.gridRow = 15;
    mod.player.gridCol = 8;
    mod.player.facing = 3; // West

    const snap1 = jsonRoundTrip(mod.capturePlayerState());
    expect(snap1).toEqual({ gridRow: 15, gridCol: 8, facing: 3 });

    const mod2 = await freshImport('src/player.js');
    // Default state
    expect(mod2.capturePlayerState().gridRow).toBe(1);

    mod2.restorePlayerState(snap1); // skip camera
    const snap2 = mod2.capturePlayerState();

    expect(snap2).toEqual(snap1);
    expect(mod2.player.gridRow).toBe(15);
    expect(mod2.player.gridCol).toBe(8);
    expect(mod2.player.facing).toBe(3);
  });

  it('all four facing directions survive round-trip', async () => {
    for (const facing of [0, 1, 2, 3]) {
      const mod = await freshImport('src/player.js');
      mod.player.gridRow = 5;
      mod.player.gridCol = 5;
      mod.player.facing = facing;

      const snap1 = jsonRoundTrip(mod.capturePlayerState());

      const mod2 = await freshImport('src/player.js');
      mod2.restorePlayerState(snap1);
      const snap2 = mod2.capturePlayerState();

      expect(snap2).toEqual(snap1);
    }
  });

  it('restorePlayerState(null) is a no-op', async () => {
    const mod = await freshImport('src/player.js');
    mod.player.gridRow = 7;

    mod.restorePlayerState(null);
    expect(mod.player.gridRow).toBe(7);
  });
});

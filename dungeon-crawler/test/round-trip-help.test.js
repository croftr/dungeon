/**
 * test/round-trip-help.test.js
 *
 * Round-trip tests for help.js: captureHelpState / restoreHelpState.
 *
 * State owned by help.js:
 *   _seenKeys  Set<string>  — keys of help dialogs the player has already dismissed.
 *
 * captureHelpState returns { seenKeys: string[] }.
 * restoreHelpState clears _seenKeys and repopulates from the array.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('round-trip: help.js', () => {
  it('empty seen-keys set survives round-trip', async () => {
    const mod = await freshImport('src/help.js');
    const snap1 = jsonRoundTrip(mod.captureHelpState());

    const mod2 = await freshImport('src/help.js');
    mod2.restoreHelpState(snap1);
    const snap2 = mod2.captureHelpState();

    expect(snap2).toEqual(snap1);
    expect(snap2.seenKeys).toEqual([]);
  });

  it('seen help keys survive round-trip', async () => {
    const mod = await freshImport('src/help.js');

    // Simulate the player having dismissed several inline-help dialogs.
    // restoreHelpState directly accepts the { seenKeys: [...] } shape,
    // so we use it to seed the state rather than fighting DOM requirements of showInlineHelp.
    mod.restoreHelpState({ seenKeys: ['first-recruit', 'party-full', 'chest-tutorial'] });

    const snap1 = jsonRoundTrip(mod.captureHelpState());
    expect(snap1.seenKeys.sort()).toEqual(['chest-tutorial', 'first-recruit', 'party-full']);

    const mod2 = await freshImport('src/help.js');
    expect(mod2.captureHelpState().seenKeys).toEqual([]);

    mod2.restoreHelpState(snap1);
    const snap2 = mod2.captureHelpState();

    // Order may differ — compare sorted arrays
    expect(snap2.seenKeys.sort()).toEqual(snap1.seenKeys.sort());
  });

  it('restoreHelpState(null) is a no-op', async () => {
    const mod = await freshImport('src/help.js');
    mod.restoreHelpState({ seenKeys: ['tutorial'] });

    // Should not throw, and state should be unchanged
    mod.restoreHelpState(null);
    expect(mod.captureHelpState().seenKeys).toEqual(['tutorial']);
  });

  it('restoreHelpState clears previously seen keys before applying payload', async () => {
    const mod = await freshImport('src/help.js');
    mod.restoreHelpState({ seenKeys: ['old-key'] });

    // Restore a completely different payload — old key should be gone
    mod.restoreHelpState({ seenKeys: ['new-key'] });
    const result = mod.captureHelpState();

    expect(result.seenKeys).not.toContain('old-key');
    expect(result.seenKeys).toContain('new-key');
  });
});

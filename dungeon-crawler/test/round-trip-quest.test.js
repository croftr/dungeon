/**
 * test/round-trip-quest.test.js
 *
 * Round-trip tests for quest.js: getQuestLog / setQuestLog.
 *
 * Pattern for every round-trip test:
 *  1. Import module fresh.
 *  2. Mutate state through public API.
 *  3. Capture.
 *  4. JSON.stringify → JSON.parse (simulates localStorage round-trip).
 *  5. Reset module (fresh import).
 *  6. Restore with parsed payload.
 *  7. Capture again.
 *  8. Assert second capture deep-equals first.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('round-trip: quest.js', () => {
  it('empty quest log survives round-trip', async () => {
    const mod = await freshImport('src/quest.js');
    const snap1 = jsonRoundTrip(mod.getQuestLog());

    const mod2 = await freshImport('src/quest.js');
    mod2.setQuestLog(snap1);
    const snap2 = mod2.getQuestLog();

    expect(snap2).toEqual(snap1);
  });

  it('accepted and completed quests survive round-trip', async () => {
    const mod = await freshImport('src/quest.js');

    // Mutate through the setter (mirrors what the game does when accepting/completing)
    mod.setQuestLog({
      'quest-fetch-healing-herbs':    'accepted',
      'quest-clear-basement-goblins': 'completed',
      'quest-retrieve-tome':          'accepted',
      'quest-deliver-iron':           'completed',
    });

    const snap1 = jsonRoundTrip(mod.getQuestLog());

    const mod2 = await freshImport('src/quest.js');
    // Verify clean state before restore
    expect(mod2.getQuestLog()).toEqual({});

    mod2.setQuestLog(snap1);
    const snap2 = mod2.getQuestLog();

    expect(snap2).toEqual(snap1);
  });

  it('setQuestLog replaces previous state (no key leakage)', async () => {
    const mod = await freshImport('src/quest.js');
    mod.setQuestLog({ 'q-old': 'accepted' });

    // Now restore a different payload — the old key must not survive
    const newPayload = { 'q-new': 'completed' };
    mod.setQuestLog(newPayload);

    const result = mod.getQuestLog();
    expect(result).not.toHaveProperty('q-old');
    expect(result).toHaveProperty('q-new', 'completed');
  });

  it('getQuestLog returns a shallow copy, not the internal ref', async () => {
    const mod = await freshImport('src/quest.js');
    mod.setQuestLog({ 'q1': 'accepted' });

    const log1 = mod.getQuestLog();
    log1['q1'] = 'completed'; // mutate the copy

    // Internal state should be unaffected
    const log2 = mod.getQuestLog();
    expect(log2['q1']).toBe('accepted');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isJewelry } from '../src/items.js';
import RINGS from '../src/data/items/rings.json';
import NECK from '../src/data/items/neck.json';

describe('isJewelry helper', () => {
  it('identifies rings as jewelry', () => {
    RINGS.forEach((ring) => {
      expect(isJewelry(ring.name)).toBe(true);
    });
  });

  it('identifies neck items as jewelry', () => {
    NECK.forEach((neckItem) => {
      expect(isJewelry(neckItem.name)).toBe(true);
    });
  });

  it('does not identify non-jewelry items as jewelry', () => {
    expect(isJewelry('Iron Sword')).toBe(false);
    expect(isJewelry('Minor Healing Potion')).toBe(false);
    expect(isJewelry('Gold Coins')).toBe(false);
    expect(isJewelry(null)).toBe(false);
    expect(isJewelry('')).toBe(false);
  });
});

describe('audio.js jewelry play logic', () => {
  let originalFetch;
  let originalAudioContext;
  let mockFetch;
  let mockDecodeAudioData;
  let mockCreateBufferSource;
  let mockCreateGain;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalAudioContext = global.AudioContext;

    mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      })
    );
    global.fetch = mockFetch;

    mockDecodeAudioData = vi.fn().mockImplementation(() => Promise.resolve({}));
    mockCreateBufferSource = vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      buffer: null,
    }));
    mockCreateGain = vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      gain: { value: 1.0 },
    }));

    class MockAudioContext {
      constructor() {
        this.state = 'running';
        this.destination = {};
      }
      resume() {
        return Promise.resolve();
      }
      decodeAudioData(ab) {
        return mockDecodeAudioData(ab);
      }
      createBufferSource() {
        return mockCreateBufferSource();
      }
      createGain() {
        return mockCreateGain();
      }
    }
    global.AudioContext = MockAudioContext;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.AudioContext = originalAudioContext;
    vi.restoreAllMocks();
  });

  it('plays jewelary.mp3 when a jewelry item is passed to playItemSound', async () => {
    // Import the actual audio module bypass alias
    const realAudio = await vi.importActual('../src/audio.js');

    await realAudio.playItemSound('Ring of Vigour');

    // Fetch should have been called with the jewelry sound URL
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/sounds/actions/jewelary.mp3');

    // It should have created the buffer and started playing it
    expect(mockCreateBufferSource).toHaveBeenCalled();
  });
});

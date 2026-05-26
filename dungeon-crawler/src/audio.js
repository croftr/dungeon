// ─────────────────────────────────────────────────────────────────────────────
//  AUDIO ENGINE
//
//  Exported functions:
//    playActionSound(action)  — plays the sound matching 'swipe' | 'bash' | 'shoot'
// ─────────────────────────────────────────────────────────────────────────────

import { asset } from './assets.js';
import { isJewelry } from './items.js';

export function prefetchActionSounds() {
  prefetchBuffer(asset('/sounds/actions/swipe.mp3'));
  prefetchBuffer(asset('/sounds/actions/bash.mp3'));
  prefetchBuffer(asset('/sounds/actions/shoot.mp3'));
  prefetchBuffer(asset('/sounds/crit1.mp3'));
  prefetchBuffer(asset('/sounds/actions/jewelary.mp3'));
}

let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

const SOUND_MAP = {
  // Add an 'offset' value (in seconds) to skip silence at the very start of the file.
  swipe: { url: asset('/sounds/actions/swipe.mp3'), offset: 0.05 },
  bash: { url: asset('/sounds/actions/bash.mp3'), offset: 0.05 },
  shoot: { url: asset('/sounds/actions/shoot.mp3'), offset: 0.05 },
  punch: { url: asset('/sounds/actions/bash.mp3'), offset: 0.05 },
  fireball: { url: asset('/sounds/actions/fireball.mp3'), offset: 0.0 },
  frostbolt: { url: asset('/sounds/elements/ice-attack.mp3'), offset: 0.0 },
  waterbolt: { url: asset('/sounds/elements/water.mp3'), offset: 0.0 },
  lightningbolt: { url: asset('/sounds/elements/lightening.mp3'), offset: 0.0 },
  holybolt: { url: asset('/sounds/actions/skills/holy.mp3'), offset: 0.0 },
  darkbolt: { url: asset('/sounds/elements/dark.mp3'), offset: 0.0 },
  banishment: { url: asset('/sounds/banishment.mp3'), offset: 0.0 },
  incinerate: { url: asset('/sounds/actions/inferno.mp3'), offset: 0.0 },
  'shield-bash': { url: asset('/sounds/actions/bash.mp3'), offset: 0.05 },
  death: { url: asset('/sounds/actions/monster-killed-1.mp3'), offset: 0.0 },
  hit: { url: asset('/sounds/actions/hit.mp3'), offset: 0.0 },
  'gold-coins': { url: asset('/sounds/items/gold-coins.mp3'), offset: 0.0 },
  'shield-block': { url: asset('/sounds/actions/shield-block.mp3'), offset: 0.0 },
  encumbered: { url: asset('/sounds/actions/encumbered.mp3'), offset: 0.0 },
  overloaded: { url: asset('/sounds/actions/encumbered.mp3'), offset: 0.0 },
  'set-bonus': { url: asset('/sounds/actions/set-bonus.mp3'), offset: 0.0 },
};

const ITEM_SOUNDS = {
  'Gold Coins': asset('/sounds/items/gold-coins.mp3'),
  'potion': asset('/sounds/items/alchemy-bubbles.mp3'),
  'scroll': asset('/sounds/items/scroll.mp3'),
  'tome': asset('/sounds/book.mp3'),
  'Torch': asset('/sounds/items/burn.mp3'),
  'Red Crystal': asset('/sounds/items/crystal.mp3'),
  'Blue Crystal': asset('/sounds/items/crystal.mp3'),
  'spell-assigned': asset('/sounds/actions/spell-assinged.mp3'),
  'berry': asset('/sounds/actions/inventory-item.mp3'),
  'fungus': asset('/sounds/actions/fungus.mp3'),
  'essence': asset('/sounds/actions/essence.mp3'),
};

const bufferCache = new Map();

// Raw-bytes cache — allows pre-fetching before AudioContext exists.
const rawCache = new Map();

/**
 * Pre-fetch an audio file as raw bytes (no AudioContext needed).
 * Safe to call before any user interaction.
 * Returns a Promise that resolves when the download is complete.
 */
export function prefetchBuffer(url) {
  if (rawCache.has(url)) return rawCache.get(url);
  const p = fetch(url).then(r => r.arrayBuffer()).catch(() => null);
  rawCache.set(url, p);
  return p;
}

const _decodeInFlight = new Map();
async function getBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  if (_decodeInFlight.has(url)) return _decodeInFlight.get(url);
  const promise = (async () => {
    try {
      // Use pre-fetched bytes if available, otherwise fetch now
      const arrayBuffer = rawCache.has(url)
        ? await rawCache.get(url)
        : await fetch(url).then(r => r.arrayBuffer());
      if (!arrayBuffer) return null;
      const audioBuffer = await getCtx().decodeAudioData(arrayBuffer);
      bufferCache.set(url, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.warn('[audio] Failed to load:', url, err);
      return null;
    } finally {
      _decodeInFlight.delete(url);
    }
  })();
  _decodeInFlight.set(url, promise);
  return promise;
}

/**
 * Play the sound for a given attack type.
 * @param {string|null} attackType — 'swipe' | 'bash' | 'shoot' | 'punch' | null
 */
export async function playActionSound(attackType) {
  if (!attackType) return;
  const def = SOUND_MAP[attackType];
  if (!def) return;

  const buffer = await getBuffer(def.url);
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.6; // Default Volume

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Play the sound!
    // The second parameter is the `offset` in seconds to start playing from.
    source.start(0, def.offset || 0);
  } catch (err) {
    console.warn('[audio] playActionSound failed:', err);
  }
}


/**
 * Play a critical-hit version of the attack sound — same buffer but at 1.5× playback rate,
 * giving a sharper, punchier crack without needing a separate audio file.
 * Additionally, plays the dedicated crit1.mp3 success sound for non-ranged attacks.
 * @param {string|null} attackType — 'swipe' | 'bash' | 'shoot' | 'punch' | 'fireball' | null
 */
export async function playCritSound(attackType) {
  const def = SOUND_MAP[attackType] ?? SOUND_MAP.swipe;
  const buffer = await getBuffer(def.url);
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1.5; // Pitch up for the sharper crit impact

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85; // Slightly louder than the normal 0.6

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0, def.offset || 0);

    // Also play the dedicated crit1 sound for non-ranged attacks.
    // The user suspects bows/crossbows might already have a crit sound;
    // they play a pitched-up 'shoot' sound, so we leave them as-is.
    if (attackType !== 'shoot') {
      const critBuffer = await getBuffer(asset('/sounds/crit1.mp3'));
      if (critBuffer) {
        const critSource = ctx.createBufferSource();
        critSource.buffer = critBuffer;
        const critGain = ctx.createGain();
        critGain.gain.value = 0.8;
        critSource.connect(critGain);
        critGain.connect(ctx.destination);
        critSource.start(0);
      }
    }
  } catch (err) {
    console.warn('[audio] playCritSound failed:', err);
  }
}

export async function playHealSound() {
  const buffer = await getBuffer(asset('/sounds/actions/life-crystal.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playHealSound failed:', err);
  }
}

export async function playPortalSound() {
  const buffer = await getBuffer(asset('/sounds/actions/portal.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playPortalSound failed:', err);
  }
}

export async function playFloorPortalSound() {
  const buffer = await getBuffer(asset('/sounds/actions/floor-portal.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playFloorPortalSound failed:', err);
  }
}

let _portalIdleAudio = null;
export function setPortalIdleLoop(on) {
  if (on) {
    if (_portalIdleAudio) return;
    _portalIdleAudio = new Audio(asset('/sounds/portal-idle.mp3'));
    _portalIdleAudio.loop = true;
    _portalIdleAudio.volume = 0.5;
    _portalIdleAudio.play().catch(() => {});
  } else {
    if (!_portalIdleAudio) return;
    try { _portalIdleAudio.pause(); } catch {}
    _portalIdleAudio = null;
  }
}

export async function playKeyLockSound() {
  const buffer = await getBuffer(asset('/sounds/actions/key-lock.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playKeyLockSound failed:', err);
  }
}

export async function playGateOpeningSound() {
  const buffer = await getBuffer(asset('/sounds/actions/gate-opening.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playGateOpeningSound failed:', err);
  }
}

export async function playHitSound() {
  const buffer = await getBuffer(asset('/sounds/actions/hit.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.7;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playHitSound failed:', err);
  }
}

export async function playPartyHitSound() {
  const buffer = await getBuffer(asset('/sounds/actions/party-hit.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    // Ensure the context is running — resume() is a no-op if already running.
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85; // Slightly louder to be audible over arena music

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playPartyHitSound failed:', err);
  }
}

export async function playShieldBlockSound() {
  const buffer = await getBuffer(asset('/sounds/actions/shield-block.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playShieldBlockSound failed:', err);
  }
}

export async function playGoldSound() {
  const buffer = await getBuffer(asset('/sounds/items/gold-coins.mp3'));
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.warn('[audio] playGoldSound failed:', err);
  }
}

/**
 * Synthesizes a dry, clattering bone sound.
 */
export async function playBoneSound() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Series of quick, short white-noise-like bursts with filtered pitch
    for (let i = 0; i < 5; i++) {
      const startTime = now + (i * 0.05);
      const duration = 0.03 + Math.random() * 0.04;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'square';
      osc.frequency.setValueAtTime(100 + Math.random() * 400, startTime);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800 + Math.random() * 1200, startTime);
      filter.Q.value = 5;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.1, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    }
  } catch (err) {
    console.warn('[audio] playBoneSound failed:', err);
  }
}

let currentMusicIndex = 0;
// Ambient playlists keyed by level number. Level 1 rotates two tracks;
// level 2+ have their own dedicated track(s).
const MUSIC_TRACKS_BY_LEVEL = {
  0: [asset('/sounds/back1.mp3')],
  1: [asset('/sounds/back1.mp3'), asset('/sounds/back2.mp3')],
  2: [asset('/sounds/backing/level-2-start.mp3')],
  3: [asset('/sounds/backing/minotaur-level.mp3')],
  4: [asset('/sounds/backing/level4.mp3')],
};

// Per-track volume overrides — default for all tracks is 0.3
const TRACK_VOLUME = {
  [asset('/sounds/backing/minotaur-level.mp3')]: 0.6,
  [asset('/sounds/backing/battle.mp3')]: 0.15,
  [asset('/sounds/backing/arena.mp3')]: 1.3,
};
let _ambientLevel = 0;
const BATTLE_TRACK = asset('/sounds/backing/battle.mp3');
const ARENA_LEVEL = 99;

let musicSource = null;
let musicGainNode = null;
let isCombatMusicPlaying = false;
let combatTimer = 0; // seconds

// ── Generation counter — increments every time intent changes. ──────────────
// A playTrack() call that started before the latest increment is stale and
// discards itself once its buffer resolves, preventing orphaned tracks.
let _musicGen = 0;

export async function startMusic() {
  if (musicSource) return; // already playing
  _playNextTrack();
}

/**
 * Switch the ambient music pool to match the given level.
 * Immediately interrupts the current ambient track and starts the new one.
 * Has no effect if combat music is playing (that will resolve naturally).
 * @param {number} level
 */
export function setAmbientLevel(level) {
  _ambientLevel = level;
  _zoneTrack = null;          // clear any room override when changing levels
  _zonePlaylist = null;
  _zonePlaylistIndex = 0;
  _zoneSilence = false;       // clear any room silence when changing levels
  currentMusicIndex = 0;

  // Level 3 and the Arena never play the generic combat track — switch to
  // ambient immediately even if combat music was playing.
  if (!isCombatMusicPlaying || _ambientLevel === 3 || _ambientLevel === ARENA_LEVEL) {
    if (isCombatMusicPlaying && (_ambientLevel === 3 || _ambientLevel === ARENA_LEVEL)) {
      isCombatMusicPlaying = false;
    }
    _musicGen++;
    _stopCurrent();
    _playNextTrack();
  }
}

/**
 * Override the ambient track with a specific URL (or array of URLs) for a room/zone.
 * Pass an array to rotate through tracks in order (playlist mode).
 * Pass null to leave the zone and revert to the level's normal ambient pool.
 * @param {string|string[]|null} urlOrArray
 */
let _zoneTrack = null;
let _zonePlaylist = null;
let _zonePlaylistIndex = 0;
let _zoneSilence = false;

/**
 * Silence all ambient/zone music for a specific room area.
 * Pass true to silence, false to restore normal playback.
 * Combat music is unaffected and will still play when combat starts.
 */
export function setZoneSilence(active) {
  if (_zoneSilence === active) return; // no change
  _zoneSilence = active;
  if (!isCombatMusicPlaying) {
    _musicGen++;
    _stopCurrent();
    if (!active) _playNextTrack();
  }
}

export function setZoneMusic(urlOrArray) {
  if (Array.isArray(urlOrArray)) {
    const key = urlOrArray.join('|');
    if (_zonePlaylist && _zonePlaylist.join('|') === key) return; // no change
    _zonePlaylist = urlOrArray;
    _zonePlaylistIndex = 0;
    _zoneTrack = null;
  } else {
    if (_zoneTrack === urlOrArray && !_zonePlaylist) return; // no change
    _zoneTrack = urlOrArray;
    _zonePlaylist = null;
    _zonePlaylistIndex = 0;
  }
  if (!isCombatMusicPlaying) {
    _musicGen++;
    _stopCurrent();
    _playNextTrack();
  }
}

/**
 * Call this when a combat event occurs (hit or attack).
 */
export function setInCombat(duration = 5.0) {
  combatTimer = Math.max(combatTimer, duration);
}

export function clearCombat() {
  combatTimer = 0;
}

const SKILL_SOUND_MAP = {
  'berserk': { url: asset('/sounds/actions/skills/berserk.mp3'), offset: 0.0 },
  'combust': { url: asset('/sounds/actions/fireball.mp3'), offset: 0.0 },
  'cure': { url: asset('/sounds/actions/skills/cure.mp3'), offset: 0.0 },
  'holy': { url: asset('/sounds/actions/skills/holy.mp3'), offset: 0.0 },
  'hunters-eye': { url: asset('/sounds/actions/skills/hunters-eye.mp3'), offset: 0.0 },
  'magic': { url: asset('/sounds/actions/skills/magic.mp3'), offset: 0.0 },
  'render': { url: asset('/sounds/actions/skills/render.mp3'), offset: 0.0 },
  'war-dance': { url: asset('/skills/war-dance.mp3'), offset: 0.0 },
  'heal': { url: asset('/sounds/actions/life-crystal.mp3'), offset: 0.0 },
  'alchemy': { url: asset('/sounds/items/alchemy-bubbles.mp3'), offset: 0.0 },
  'double-attack': { url: asset('/skills/double-attack.mp3'), offset: 0.0 },
  'miners-light': { url: asset('/sounds/actions/skills/miners-light.mp3'), offset: 0.0 },
  'rampart': { url: asset('/sounds/actions/skills/rampart.mp3'), offset: 0.0 },
  'sleep': { url: asset('/sounds/sleep.mp3'), offset: 0.0 },
};

/**
 * Play a sound for a specific item interaction.
 * @param {string} itemName
 * @param {string} slot - used to identify if it's a potion
 */
export async function playItemSound(itemName, slot = '') {
  if (!itemName) return;
  const lowerName = itemName.toLowerCase();
  let url = ITEM_SOUNDS[itemName];

  // Specific check for parchment/scroll sound
  if (!url && (lowerName.includes('parchment') || slot === 'parchment' || lowerName.includes('scroll'))) {
    url = ITEM_SOUNDS['scroll'];
  }

  if (!url && (lowerName.includes('potion') || lowerName.includes('elixir') || slot === 'potion')) {
    url = ITEM_SOUNDS['potion'];
  }

  if (!url && lowerName.includes('tome')) {
    url = ITEM_SOUNDS['tome'];
  }

  if (!url && itemName === 'Gold Coins') {
    url = ITEM_SOUNDS['Gold Coins'];
  }

  if (!url && (itemName === 'Mana Berry' || itemName === 'Life Berry' || itemName === 'Fermented Sugar')) {
    url = ITEM_SOUNDS['berry'];
  }

  if (!url && (itemName === 'Ice Cap' || itemName === 'Rag Cap')) {
    url = ITEM_SOUNDS['fungus'];
  }

  if (!url && lowerName.endsWith('essence')) {
    url = ITEM_SOUNDS['essence'];
  }

  if (!url && isJewelry(itemName)) {
    url = asset('/sounds/actions/jewelary.mp3');
  }

  if (!url) return;

  const buffer = await getBuffer(url);
  if (!buffer) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playItemSound failed:', err);
  }
}

/**
 * Play the alchemy bubbling sound.
 */
export async function playAlchemySound() {
  playSkillSound('alchemy', 0.8);
}

/**
 * Synthesizes a dull fizzle/sputter — played when a transmutation attempt
 * does not match any recipe (ingredients preserved, nothing produced).
 */
export async function playAlchemyFailSound() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Short burst of filtered noise that quickly dies out
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.07;

      const bufferSize = ctx.sampleRate * 0.12;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) data[j] = Math.random() * 2 - 1;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300 + i * 80, t);
      filter.Q.value = 3;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(t);
      source.stop(t + 0.13);
    }
  } catch (err) {
    console.warn('[audio] playAlchemyFailSound failed:', err);
  }
}

/**
 * Play a skill or spell sound by its short name.
 * @param {string} name — key from SKILL_SOUND_MAP, e.g. 'holy', 'berserk', 'magic'
 * @param {number} [volume=0.7]
 */
export async function playSkillSound(name, volume = 0.7) {
  const def = SKILL_SOUND_MAP[name];
  if (!def) return;
  const buffer = await getBuffer(def.url);
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0, def.offset);
  } catch (err) {
    console.warn('[audio] playSkillSound failed:', err);
  }
}

/**
 * Play the spell cabinet interaction sound.
 */
export async function playSpellCabinetSound() {
  const buffer = await getBuffer(asset('/sounds/items/scroll.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playSpellCabinetSound failed:', err);
  }
}

/**
 * Play the chest opening sound.
 */
export async function playChestOpenSound() {
  const buffer = await getBuffer(asset('/sounds/items/chest-open.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playChestOpenSound failed:', err);
  }
}

/**
 * Play the weapon rack interaction sound.
 */
export async function playWeaponRackSound() {
  const buffer = await getBuffer(asset('/sounds/items/weapon-rack.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playWeaponRackSound failed:', err);
  }
}

export async function playLevelUpSound() {
  const buffer = await getBuffer(asset('/sounds/actions/level-up1.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.9;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playLevelUpSound failed:', err);
  }
}

export async function playLevelUpConfirmSound() {
  const buffer = await getBuffer(asset('/sounds/actions/level-up2.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.9;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playLevelUpConfirmSound failed:', err);
  }
}

export async function playShopkeeperSound() {
  const buffer = await getBuffer(asset('/sounds/actions/shopkeeper.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playShopkeeperSound failed:', err);
  }
}

export async function playAnvilSound() {
  const buffer = await getBuffer(asset('/sounds/actions/anvil.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playAnvilSound failed:', err);
  }
}

export async function playCraftFailSound() {
  const buffer = await getBuffer(asset('/sounds/actions/craft-fail.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playCraftFailSound failed:', err);
  }
}

export async function playCraftHqSound() {
  const buffer = await getBuffer(asset('/sounds/actions/craft-hq.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.9;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playCraftHqSound failed:', err);
  }
}

export async function playSoundByUrl(url, volume = 0.8) {
  const buffer = await getBuffer(asset(url));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
    return source; // Return source so we can listen to onended
  } catch (err) {
    console.warn(`[audio] playSoundByUrl failed for ${url}:`, err);
  }
}

// ── Quest / NPC speech audio ─────────────────────────────────────────────────
let _questAudioSource = null;
let _questAudioGain   = null;
let _questSpeechId    = 0;
let _questSpeechEndTime = 0;

// Active NPC dialogue tracking
let _activeNpcId  = null;
let _activeNpcRow = null;
let _activeNpcCol = null;

/**
 * Play NPC quest speech audio. Replaces any currently playing quest audio.
 * Returns the source so callers can attach onended.
 */
export async function playQuestAudio(url, volume = 0.8) {
  const currentSpeechId = ++_questSpeechId;

  // Stop any previous quest audio immediately
  if (_questAudioSource) {
    fadeOutQuestAudio(0.5);
    _questSpeechEndTime = Date.now() + 1000;
  }

  const delay = _questSpeechEndTime - Date.now();
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  if (currentSpeechId !== _questSpeechId) return;

  const buffer = await getBuffer(asset(url));
  if (!buffer) return;
  if (currentSpeechId !== _questSpeechId) return;

  try {
    const ctx = getCtx();
    const source   = ctx.createBufferSource();
    source.buffer  = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.addEventListener('ended', () => {
      if (_questAudioSource === source) {
        _questAudioSource = null;
        _questAudioGain   = null;
      }
    });
    source.start(0);
    _questAudioSource = source;
    _questAudioGain   = gainNode;
    return source;
  } catch (err) {
    console.warn(`[audio] playQuestAudio failed for ${url}:`, err);
  }
}

/**
 * Fade out and stop any currently playing quest audio.
 * @param {number} durationSec  Fade duration in seconds (default 0.6s)
 */
export function fadeOutQuestAudio(durationSec = 0.6) {
  _activeNpcId  = null;
  _activeNpcRow = null;
  _activeNpcCol = null;
  if (!_questAudioSource || !_questAudioGain) return;
  const source   = _questAudioSource;
  const gainNode = _questAudioGain;
  _questAudioSource = null;
  _questAudioGain   = null;

  const ctx = getCtx();
  const now = ctx.currentTime;
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0, now + durationSec);
  try { source.stop(now + durationSec); } catch (_) {}
}

/**
 * Play NPC dialogue audio. If the same NPC is already speaking, the call is ignored
 * (prevents double-click audio stacking). If a different NPC is speaking, their audio
 * stops immediately and the new NPC's audio starts.
 */
export async function playNpcDialogue(row, col, url, volume = 0.8, onEnded = null) {
  const npcId = `${row},${col}`;
  if (npcId === _activeNpcId) return; // same NPC already talking — ignore

  // Stop any currently playing NPC audio immediately
  if (_questAudioSource) {
    fadeOutQuestAudio(0.3);
  }

  _activeNpcId  = npcId;
  _activeNpcRow = row;
  _activeNpcCol = col;
  const speechId = ++_questSpeechId;
  _questSpeechEndTime = 0;

  const buffer = await getBuffer(asset(url));
  if (!buffer) {
    if (_activeNpcId === npcId) { _activeNpcId = null; _activeNpcRow = null; _activeNpcCol = null; }
    return;
  }
  if (_questSpeechId !== speechId) return; // superseded

  try {
    const ctx = getCtx();
    const source   = ctx.createBufferSource();
    source.buffer  = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.addEventListener('ended', () => {
      if (_questAudioSource === source) {
        _questAudioSource = null;
        _questAudioGain   = null;
        _activeNpcId  = null;
        _activeNpcRow = null;
        _activeNpcCol = null;
      }
      if (onEnded) onEnded();
    });
    source.start(0);
    _questAudioSource = source;
    _questAudioGain   = gainNode;
    return source;
  } catch (err) {
    console.warn(`[audio] playNpcDialogue failed for ${url}:`, err);
  }
}

/** Returns true if audio is currently playing for the NPC at (row, col). */
export function isNpcDialoguePlaying(row, col) {
  return `${row},${col}` === _activeNpcId;
}

/**
 * Call on each player move. Fades out NPC dialogue if the player has moved
 * farther than maxDist cells from the active NPC.
 */
export function checkNpcDialogueProximity(playerRow, playerCol, maxDist = 4) {
  if (_activeNpcRow === null || !_questAudioSource) return;
  const dist = Math.max(
    Math.abs(playerRow - _activeNpcRow),
    Math.abs(playerCol - _activeNpcCol)
  );
  if (dist > maxDist) {
    fadeOutQuestAudio(0.5);
  }
}

export async function playFallSequence() {
  playSoundByUrl(asset('/sounds/fall-scream.mp3'), 0.9);
  // Start the land/thud sound after 1 second of screaming
  setTimeout(() => {
    playSoundByUrl(asset('/sounds/fall-land.mp3'), 0.9);
  }, 1000);
}

export function isInCombat() {
  return combatTimer > 0;
}

export function updateAudio(dt) {
  combatTimer = Math.max(0, combatTimer - dt);

  const shouldBeInCombat = combatTimer > 0;

  // Level 3 (Minotaur level) and the Arena have their own atmospheric music
  // that should not be interrupted by the generic battle track.
  if (shouldBeInCombat && !isCombatMusicPlaying && _ambientLevel !== 3 && !window.arenaState?.active) {
    _switchToCombatMusic();
  } else if (!shouldBeInCombat && isCombatMusicPlaying) {
    _switchToNormalMusic();
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _stopCurrent() {
  if (musicSource) {
    try { musicSource.stop(); } catch (_) { }
    musicSource = null;
  }
}

function _switchToCombatMusic() {
  if (isCombatMusicPlaying) return;
  isCombatMusicPlaying = true;
  _musicGen++;                  // invalidate any pending normal-track load
  _stopCurrent();
  // Level 4 has its own combat track; Level 99 (Arena) plays the arena track
  let track;
  if (_ambientLevel === 4) track = asset('/sounds/backing/level4-combat.mp3');
  else if (_ambientLevel === ARENA_LEVEL) track = asset('/sounds/backing/arena.mp3');
  else track = BATTLE_TRACK;
  _playTrack(track, true, _musicGen);
}

function _switchToNormalMusic() {
  if (!isCombatMusicPlaying) return;
  isCombatMusicPlaying = false;
  _musicGen++;                  // invalidate any pending battle-track load
  _stopCurrent();
  _playNextTrack();
}

function _playNextTrack() {
  if (isCombatMusicPlaying) return;
  if (_zoneSilence) return; // room silence — stay quiet until cleared
  // Zone playlist: rotate through tracks without looping
  if (_zonePlaylist) {
    _playTrack(_zonePlaylist[_zonePlaylistIndex], false, _musicGen);
    return;
  }
  // Zone music takes priority over the level ambient pool
  if (_zoneTrack) {
    _playTrack(_zoneTrack, true, _musicGen);
    return;
  }
  const tracks = MUSIC_TRACKS_BY_LEVEL[_ambientLevel];
  if (!tracks) return;
  const gen = _musicGen;
  const url = tracks[currentMusicIndex % tracks.length];
  _playTrack(url, false, gen);
}

async function _playTrack(url, loop, gen) {
  const buffer = await getBuffer(url);
  if (!buffer) return;

  // Check if the intent has changed while the buffer was loading — if so, abort.
  if (gen !== _musicGen) return;

  const ctx = getCtx();
  // No user gesture yet (e.g. immediately after a save-load page reload) —
  // calling source.start() now schedules playback at ctx.currentTime=0 with
  // our offset, and when the context later auto-resumes the stale source
  // plays back out-of-phase against the gesture-handler's retry, producing
  // audible comb-filter distortion (most noticeable on level 4, which has a
  // non-zero offset). Bail out; the first-gesture handler in save.js will
  // re-fire setAmbientLevel once the context is running.
  if (ctx.state !== 'running') return;

  // Stop whatever was playing (might have been set by a parallel call)
  _stopCurrent();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const gainNode = ctx.createGain();
  gainNode.gain.value = TRACK_VOLUME[url] ?? 0.3;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  source.onended = () => {
    // Only advance to the next track if we are still the active generation
    if (gen !== _musicGen) return;
    if (!isCombatMusicPlaying && !loop) {
      if (_zonePlaylist) {
        _zonePlaylistIndex = (_zonePlaylistIndex + 1) % _zonePlaylist.length;
      } else {
        const tracks = MUSIC_TRACKS_BY_LEVEL[_ambientLevel] ?? MUSIC_TRACKS_BY_LEVEL[1];
        currentMusicIndex = (currentMusicIndex + 1) % tracks.length;
      }
      _playNextTrack();
    }
  };

  musicSource = source;
  musicGainNode = gainNode;
  const delaySec = url.includes('level-2-start.mp3') ? 2 : 0;
  const offsetSec = url.includes('level4.mp3') ? 3 : 0;
  source.start(ctx.currentTime + delaySec, offsetSec);
}

// ── Title screen theme tune ──────────────────────────────────────────────────
let _themeTuneSource = null;
let _themeTuneGain = null;
let _themeTunePending = false;

export async function playThemeTune() {
  if (_themeTuneSource || _themeTunePending) return;
  _themeTunePending = true;
  // Unlock the AudioContext synchronously while still inside the user-gesture
  // call stack. Chrome requires resume() to be called before the first await,
  // otherwise the gesture is consumed and resume() silently does nothing.
  getCtx();
  const url = asset('/sounds/backing/theme-tune.mp3');
  const buffer = await getBuffer(url);
  _themeTunePending = false;
  if (!buffer) return;
  try {
    const ctx = getCtx();
    // Stop any already-playing theme
    if (_themeTuneSource) {
      try { _themeTuneSource.stop(); } catch (_) {}
      _themeTuneSource = null;
      _themeTuneGain = null;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 2);
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
    _themeTuneSource = source;
    _themeTuneGain = gainNode;
  } catch (err) {
    console.warn('[audio] playThemeTune failed:', err);
  }
}

export function fadeOutThemeTune(durationMs) {
  if (!_themeTuneGain || !_themeTuneSource) return;
  const ctx = getCtx();
  const durationS = durationMs / 1000;
  _themeTuneGain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationS);
  const src = _themeTuneSource;
  _themeTuneSource = null;
  _themeTuneGain = null;
  setTimeout(() => { try { src.stop(); } catch (_) {} }, durationMs + 100);
}

export async function playInventorySortSound() {
  const buffer = await getBuffer(asset('/sounds/actions/inventory-sort.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playInventorySortSound failed:', err);
  }
}

/**
 * Plays the wall button press sound.
 */
export function playButtonClickSound() {
  playSoundByUrl(asset('/sounds/actions/button-press.mp3'), 0.8);
}

export async function playTrapSound() {
  const buffer = await getBuffer(asset('/sounds/items/trap.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.9;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playTrapSound failed:', err);
  }
}

export async function playLearntSound() {
  const buffer = await getBuffer(asset('/sounds/learnt.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playLearntSound failed:', err);
  }
}

export async function playRelicSound() {
  const buffer = await getBuffer(asset('/sounds/items/relic.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playRelicSound failed:', err);
  }
}

export async function playSuccessSound() {
  const buffer = await getBuffer(asset('/sounds/items/success.mp3'));
  if (!buffer) return;
  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[audio] playSuccessSound failed:', err);
  }
}

let _elementFloorSource = null;
let _elementFloorGain = null;
let _elementFloorUrl = null;

export async function setElementFloorSound(url) {
  if (_elementFloorUrl === url) return;
  _elementFloorUrl = url;

  if (_elementFloorGain && _elementFloorSource) {
    const ctx = getCtx();
    const now = ctx.currentTime;
    _elementFloorGain.gain.cancelScheduledValues(now);
    _elementFloorGain.gain.setValueAtTime(_elementFloorGain.gain.value, now);
    _elementFloorGain.gain.linearRampToValueAtTime(0, now + 0.3);
    const src = _elementFloorSource;
    setTimeout(() => { try { src.stop(); } catch (_) {} }, 300);
    _elementFloorSource = null;
    _elementFloorGain = null;
  }

  if (!url) return;

  const buffer = await getBuffer(asset(url));
  if (!buffer || _elementFloorUrl !== url) return;

  try {
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.3);
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
    _elementFloorSource = source;
    _elementFloorGain = gainNode;
  } catch (err) {
    console.warn('[audio] setElementFloorSound failed:', err);
  }
}

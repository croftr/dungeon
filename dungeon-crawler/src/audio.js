// ─────────────────────────────────────────────────────────────────────────────
//  AUDIO ENGINE
//
//  Exported functions:
//    playActionSound(action)  — plays the sound matching 'swipe' | 'bash' | 'shoot'
// ─────────────────────────────────────────────────────────────────────────────

let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

const SOUND_MAP = {
  // Add an 'offset' value (in seconds) to skip silence at the very start of the file.
  swipe: { url: '/sounds/actions/swipe.mp3', offset: 0.05 },
  bash: { url: '/sounds/actions/bash.mp3', offset: 0.05 },
  shoot: { url: '/sounds/actions/shoot.mp3', offset: 0.05 },
  punch: { url: '/sounds/actions/bash.mp3', offset: 0.05 },
  fireball: { url: '/sounds/actions/fireball.mp3', offset: 0.0 },
  'shield-bash': { url: '/sounds/actions/bash.mp3', offset: 0.05 },
  death: { url: '/sounds/actions/monster-killed-1.mp3 ', offset: 0.0 },
  hit: { url: '/sounds/actions/hit.mp3', offset: 0.0 },
  'gold-coins': { url: '/sounds/items/gold-coins.mp3', offset: 0.0 },
};

const ITEM_SOUNDS = {
  'Gold Coins': '/sounds/items/gold-coins.mp3',
  'potion': '/sounds/items/alchemy-bubbles.mp3',
};

const bufferCache = new Map();

async function getBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await getCtx().decodeAudioData(arrayBuffer);
    bufferCache.set(url, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.warn('[audio] Failed to load:', url, err);
    return null;
  }
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
  } catch (err) {
    console.warn('[audio] playCritSound failed:', err);
  }
}

export async function playHealSound() {
  const buffer = await getBuffer('/sounds/actions/life-crystal.mp3');
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
  const buffer = await getBuffer('/sounds/actions/portal.mp3');
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

export async function playKeyLockSound() {
  const buffer = await getBuffer('/sounds/actions/key-lock.mp3');
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
  const buffer = await getBuffer('/sounds/actions/gate-opening.mp3');
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
  const buffer = await getBuffer('/sounds/actions/hit.mp3');
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

export async function playGoldSound() {
  const buffer = await getBuffer('/sounds/items/gold-coins.mp3');
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
  1: ['/sounds/back1.mp3', '/sounds/back2.mp3'],
  2: ['/sounds/level2-music.mp3'],
  3: ['/sounds/level2-music.mp3'],
};
let _ambientLevel = 1;
const BATTLE_TRACK = '/sounds/backing/battle.mp3';

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
  currentMusicIndex = 0;
  if (!isCombatMusicPlaying) {
    _musicGen++;
    _stopCurrent();
    _playNextTrack();
  }
}

/**
 * Override the ambient track with a specific URL for a room/zone.
 * Pass null to leave the zone and revert to the level's normal ambient pool.
 * @param {string|null} url
 */
let _zoneTrack = null;
export function setZoneMusic(url) {
  if (_zoneTrack === url) return;   // no change
  _zoneTrack = url;
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
  'berserk': { url: '/sounds/actions/skills/berserk.mp3', offset: 0.0 },
  'cure': { url: '/sounds/actions/skills/cure.mp3', offset: 0.0 },
  'holy': { url: '/sounds/actions/skills/holy.mp3', offset: 0.0 },
  'hunters-eye': { url: '/sounds/actions/skills/hunters-eye.mp3', offset: 0.0 },
  'magic': { url: '/sounds/actions/skills/magic.mp3', offset: 0.0 },
  'render': { url: '/sounds/actions/skills/render.mp3', offset: 0.0 },
  'heal': { url: '/sounds/actions/life-crystal.mp3', offset: 0.0 },
  'alchemy': { url: '/sounds/items/alchemy-bubbles.mp3', offset: 0.0 },
};

/**
 * Play a sound for a specific item interaction.
 * @param {string} itemName
 * @param {string} slot - used to identify if it's a potion
 */
export async function playItemSound(itemName, slot = '') {
  let url = ITEM_SOUNDS[itemName];
  if (!url && (itemName.toLowerCase().includes('potion') || slot === 'potion')) {
    url = ITEM_SOUNDS['potion'];
  }
  if (!url && itemName === 'Gold Coins') {
    url = ITEM_SOUNDS['Gold Coins'];
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

export async function playLevelUpSound() {
  const buffer = await getBuffer('/sounds/actions/skills/holy.mp3');
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

export async function playShopkeeperSound() {
  const buffer = await getBuffer('/sounds/actions/shopkeeper.mp3');
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
  const buffer = await getBuffer('/sounds/actions/anvil.mp3');
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

export function isInCombat() {
  return combatTimer > 0;
}

export function updateAudio(dt) {
  combatTimer = Math.max(0, combatTimer - dt);

  const shouldBeInCombat = combatTimer > 0;

  if (shouldBeInCombat && !isCombatMusicPlaying) {
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
  _playTrack(BATTLE_TRACK, true, _musicGen);
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
  // Zone music takes priority over the level ambient pool
  if (_zoneTrack) {
    _playTrack(_zoneTrack, true, _musicGen);
    return;
  }
  const tracks = MUSIC_TRACKS_BY_LEVEL[_ambientLevel] ?? MUSIC_TRACKS_BY_LEVEL[1];
  const gen = _musicGen;
  const url = tracks[currentMusicIndex % tracks.length];
  _playTrack(url, false, gen);
}

async function _playTrack(url, loop, gen) {
  const buffer = await getBuffer(url);
  if (!buffer) return;

  // Check if the intent has changed while the buffer was loading — if so, abort.
  if (gen !== _musicGen) return;

  // Stop whatever was playing (might have been set by a parallel call)
  _stopCurrent();

  const ctx = getCtx();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0.3;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  source.onended = () => {
    // Only advance to the next ambient track if we are still the active generation
    if (gen !== _musicGen) return;
    if (!isCombatMusicPlaying && !loop) {
      const tracks = MUSIC_TRACKS_BY_LEVEL[_ambientLevel] ?? MUSIC_TRACKS_BY_LEVEL[1];
      currentMusicIndex = (currentMusicIndex + 1) % tracks.length;
      _playNextTrack();
    }
  };

  musicSource = source;
  musicGainNode = gainNode;
  source.start(0);
}

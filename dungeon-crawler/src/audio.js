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
const MUSIC_TRACKS = ['/sounds/back1.mp3', '/sounds/back2.mp3'];
const BATTLE_TRACK = '/sounds/backing/battle.mp3';

let musicSource = null;
let musicGainNode = null;
let isCombatMusicPlaying = false;
let combatTimer = 0; // seconds

export async function startMusic() {
  if (musicSource) return; // already playing
  playNextTrack();
}

/**
 * Call this when a combat event occurs (hit or attack)
 */
export function setInCombat() {
  combatTimer = 10.0; // Stay in combat music for 10 seconds after last event
}

export function isInCombat() {
  return combatTimer > 0;
}

export function updateAudio(dt) {
  combatTimer = Math.max(0, combatTimer - dt);

  const shouldBeInCombat = combatTimer > 0;

  if (shouldBeInCombat && !isCombatMusicPlaying) {
    switchToCombatMusic();
  } else if (!shouldBeInCombat && isCombatMusicPlaying) {
    switchToNormalMusic();
  }
}

async function switchToCombatMusic() {
  if (isCombatMusicPlaying) return;
  isCombatMusicPlaying = true;

  if (musicSource) {
    musicSource.stop();
    musicSource = null;
  }

  playTrack(BATTLE_TRACK, true); // Loop the battle track
}

async function switchToNormalMusic() {
  if (!isCombatMusicPlaying) return;
  isCombatMusicPlaying = false;

  if (musicSource) {
    musicSource.stop();
    musicSource = null;
  }

  playNextTrack();
}

async function playNextTrack() {
  if (isCombatMusicPlaying) return; // Don't play next normal track if in combat
  const url = MUSIC_TRACKS[currentMusicIndex];
  await playTrack(url, false);
}

async function playTrack(url, loop) {
  const buffer = await getBuffer(url);
  if (!buffer) return;

  const ctx = getCtx();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0.3; // Music should be background level

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  source.onended = () => {
    if (isCombatMusicPlaying && loop) return; // Handled by loop property
    if (!isCombatMusicPlaying && source === musicSource) {
      currentMusicIndex = (currentMusicIndex + 1) % MUSIC_TRACKS.length;
      playNextTrack();
    }
  };

  musicSource = source;
  musicGainNode = gainNode;
  source.start(0);
}

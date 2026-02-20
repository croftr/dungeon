// ─────────────────────────────────────────────────────────────────────────────
//  AUDIO ENGINE  — procedural Web Audio API sounds, no files required
//
//  Exported functions:
//    playActionSound(action)  — plays the sound matching 'swipe' | 'bash' | 'shoot'
//
//  AudioContext is created lazily on first call (requires a user gesture first,
//  which the click on the hand slot satisfies).
// ─────────────────────────────────────────────────────────────────────────────

let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

function masterGain(volume = 0.4) {
  const g = getCtx().createGain();
  g.gain.setValueAtTime(volume, getCtx().currentTime);
  g.connect(getCtx().destination);
  return g;
}

/** Linear ramp on a gain node — quick attack, shaped decay */
function envelope(gainNode, { attack = 0.005, sustain = 1.0, decay = 0.3, release = 0.1 } = {}) {
  const ac = getCtx();
  const now = ac.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(sustain, now + attack);
  gainNode.gain.setValueAtTime(sustain, now + attack + decay);
  gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + release);
}

// ─── SWIPE ─── fast whooshing blade sweep ────────────────────────────────────
function playSwipe() {
  const ac = getCtx();
  const now = ac.currentTime;

  // Noise source shaped into a deeper swoosh
  const bufSize = ac.sampleRate * 0.4;
  const buffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;

  // Faster sweeping bandpass to give it a sharp whistling edge
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(6000, now);
  bp.frequency.exponentialRampToValueAtTime(300, now + 0.25);
  bp.Q.value = 2.5;

  // Subtle metallic ping at the start
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(3000, now);
  osc.frequency.exponentialRampToValueAtTime(1500, now + 0.1);

  const gainOsc = ac.createGain();
  envelope(gainOsc, { attack: 0.01, sustain: 0.3, decay: 0.05, release: 0.1 });

  const gainNode = ac.createGain();
  envelope(gainNode, { attack: 0.02, sustain: 0.8, decay: 0.1, release: 0.2 });

  const master = masterGain(0.6);

  noise.connect(hp);
  hp.connect(bp);
  bp.connect(gainNode);

  osc.connect(gainOsc);

  gainNode.connect(master);
  gainOsc.connect(master);

  noise.start(now);
  noise.stop(now + 0.4);
  osc.start(now);
  osc.stop(now + 0.2);
}

// ─── BASH ─── heavy blunt thud with low-end thump ────────────────────────────
function playBash() {
  const ac = getCtx();
  const now = ac.currentTime;

  // Layer 1: Sub Bass Thump diving rapidly
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);

  const oscGain = ac.createGain();
  envelope(oscGain, { attack: 0.005, sustain: 1.0, decay: 0.05, release: 0.3 });

  // Layer 2: Meaty Crunch (square wave through lowpass)
  const osc2 = ac.createOscillator();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(120, now);
  osc2.frequency.exponentialRampToValueAtTime(40, now + 0.1);

  const osc2Gain = ac.createGain();
  envelope(osc2Gain, { attack: 0.002, sustain: 0.4, decay: 0.02, release: 0.1 });

  const lp2 = ac.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.setValueAtTime(800, now);
  lp2.frequency.linearRampToValueAtTime(100, now + 0.1);

  // Layer 3: Impact transient (Filtered Noise)
  const bufSize = ac.sampleRate * 0.15;
  const buffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2500, now);
  lp.frequency.exponentialRampToValueAtTime(400, now + 0.1);

  const noiseGain = ac.createGain();
  envelope(noiseGain, { attack: 0.001, sustain: 0.8, decay: 0.02, release: 0.1 });

  const master = masterGain(0.7);

  osc.connect(oscGain);
  oscGain.connect(master);

  osc2.connect(lp2);
  lp2.connect(osc2Gain);
  osc2Gain.connect(master);

  noise.connect(lp);
  lp.connect(noiseGain);
  noiseGain.connect(master);

  osc.start(now);
  osc.stop(now + 0.35);
  osc2.start(now);
  osc2.stop(now + 0.15);
  noise.start(now);
  noise.stop(now + 0.15);
}

// ─── PUNCH ─── flesh impact thud + short air snap ────────────────────────────
function playPunch() {
  const ac = getCtx();
  const now = ac.currentTime;

  // Body thud — fast mid-low sweeping sine
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);

  const oscGain = ac.createGain();
  envelope(oscGain, { attack: 0.002, sustain: 1.0, decay: 0.01, release: 0.15 });

  // Flesh smack — short burst of high-passed noise
  const bufSize = ac.sampleRate * 0.1;
  const buffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const snap = ac.createBufferSource();
  snap.buffer = buffer;

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1000;

  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2500;
  bp.Q.value = 1.0;

  const snapGain = ac.createGain();
  envelope(snapGain, { attack: 0.001, sustain: 0.9, decay: 0.01, release: 0.08 });

  const master = masterGain(0.65);

  osc.connect(oscGain);
  oscGain.connect(master);

  snap.connect(hp);
  hp.connect(bp);
  bp.connect(snapGain);
  snapGain.connect(master);

  osc.start(now);
  osc.stop(now + 0.16);
  snap.start(now);
  snap.stop(now + 0.1);
}

// ─── SHOOT ─── gentle bowstring twang + soft arrow whoosh ────────────────────
function playShoot() {
  const ac = getCtx();
  const now = ac.currentTime;

  // Bowstring twang — gentle plucked string effect
  const twang = ac.createOscillator();
  twang.type = 'sawtooth'; // Sawtooth fed through a lowpass filter sounds very string-like
  twang.frequency.setValueAtTime(160, now); // Low, tight string fundamental
  // Slight pitch bend as the string snaps back
  twang.frequency.linearRampToValueAtTime(150, now + 0.15);

  // Plucked strings have higher harmonics that decay faster than the fundamental.
  // Sweeping a lowpass filter perfectly mimics this acoustic property.
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, now); // Starts bright (the pluck)
  filter.frequency.exponentialRampToValueAtTime(200, now + 0.15); // Dulls quickly
  filter.Q.value = 2.0;

  const twangGain = ac.createGain();
  envelope(twangGain, { attack: 0.002, sustain: 0.6, decay: 0.1, release: 0.25 });

  // Arrow zip — very gentle, breathy whoosh
  const bufSize = ac.sampleRate * 0.2;
  const buffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const zip = ac.createBufferSource();
  zip.buffer = buffer;

  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1200, now + 0.02);
  bp.frequency.exponentialRampToValueAtTime(2500, now + 0.18);
  bp.Q.value = 1.0;

  const zipGain = ac.createGain();
  envelope(zipGain, { attack: 0.02, sustain: 0.15, decay: 0.05, release: 0.15 });

  const master = masterGain(0.5);

  twang.connect(filter);
  filter.connect(twangGain);
  twangGain.connect(master);

  zip.connect(bp);
  bp.connect(zipGain);
  zipGain.connect(master);

  twang.start(now);
  twang.stop(now + 0.3);
  zip.start(now + 0.02);
  zip.stop(now + 0.2);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

const SOUND_MAP = {
  swipe: playSwipe,
  bash: playBash,
  shoot: playShoot,
  punch: playPunch,
};

/**
 * Play the sound for a given attack type.
 * @param {string|null} attackType — 'swipe' | 'bash' | 'shoot' | 'punch' | null
 */
export function playActionSound(attackType) {
  if (!attackType) return;
  const fn = SOUND_MAP[attackType];
  if (!fn) return;
  try {
    fn();
  } catch (err) {
    // Silently ignore — audio is non-critical
    console.warn('[audio] playActionSound failed:', err);
  }
}

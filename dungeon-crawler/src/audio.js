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
  const ac  = getCtx();
  const now = ac.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(sustain, now + attack);
  gainNode.gain.setValueAtTime(sustain, now + attack + decay);
  gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + release);
}

// ─── SWIPE ─── fast whooshing blade sweep ────────────────────────────────────
function playSwipe() {
  const ac  = getCtx();
  const now = ac.currentTime;

  // Noise source shaped into a high-frequency whoosh
  const bufSize   = ac.sampleRate * 0.35;
  const buffer    = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data      = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  // High-pass to make it "airy / blade-like"
  const hp = ac.createBiquadFilter();
  hp.type            = 'highpass';
  hp.frequency.value = 1800;

  // Bandpass sweep — sweeps downward (high → lower) like a swinging arc
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(4000, now);
  bp.frequency.exponentialRampToValueAtTime(800, now + 0.3);
  bp.Q.value = 1.5;

  const gain = ac.createGain();
  envelope(gain, { attack: 0.005, sustain: 0.5, decay: 0.01, release: 0.28 });

  const master = masterGain(0.5);

  noise.connect(hp);
  hp.connect(bp);
  bp.connect(gain);
  gain.connect(master);

  noise.start(now);
  noise.stop(now + 0.35);
}

// ─── BASH ─── heavy blunt thud with low-end thump ────────────────────────────
function playBash() {
  const ac  = getCtx();
  const now = ac.currentTime;

  // Low sine "thud" body
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);

  const oscGain = ac.createGain();
  envelope(oscGain, { attack: 0.003, sustain: 0.9, decay: 0.01, release: 0.22 });

  // Noise layer — short impact transient
  const bufSize = ac.sampleRate * 0.12;
  const buffer  = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data    = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const lp = ac.createBiquadFilter();
  lp.type            = 'lowpass';
  lp.frequency.value = 600;

  const noiseGain = ac.createGain();
  envelope(noiseGain, { attack: 0.001, sustain: 0.6, decay: 0.005, release: 0.1 });

  const master = masterGain(0.55);

  osc.connect(oscGain);
  oscGain.connect(master);
  noise.connect(lp);
  lp.connect(noiseGain);
  noiseGain.connect(master);

  osc.start(now);
  osc.stop(now + 0.28);
  noise.start(now);
  noise.stop(now + 0.12);
}

// ─── PUNCH ─── flesh impact thud + short air snap ────────────────────────────
function playPunch() {
  const ac  = getCtx();
  const now = ac.currentTime;

  // Body thud — mid-range sine burst, very short
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

  const oscGain = ac.createGain();
  envelope(oscGain, { attack: 0.002, sustain: 1.0, decay: 0.005, release: 0.1 });

  // Air snap / knuckle crack — short noise burst with mid-high band
  const bufSize = ac.sampleRate * 0.06;
  const buffer  = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data    = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const snap = ac.createBufferSource();
  snap.buffer = buffer;

  const bp = ac.createBiquadFilter();
  bp.type            = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value         = 2;

  const snapGain = ac.createGain();
  envelope(snapGain, { attack: 0.001, sustain: 0.8, decay: 0.005, release: 0.05 });

  const master = masterGain(0.5);

  osc.connect(oscGain);
  oscGain.connect(master);
  snap.connect(bp);
  bp.connect(snapGain);
  snapGain.connect(master);

  osc.start(now);
  osc.stop(now + 0.15);
  snap.start(now);
  snap.stop(now + 0.06);
}

// ─── SHOOT ─── sharp twang + arrow zip ───────────────────────────────────────
function playShoot() {
  const ac  = getCtx();
  const now = ac.currentTime;

  // Bowstring twang — plucked tone that decays fast
  const twang = ac.createOscillator();
  twang.type = 'triangle';
  twang.frequency.setValueAtTime(320, now);
  twang.frequency.exponentialRampToValueAtTime(180, now + 0.08);

  const twangGain = ac.createGain();
  envelope(twangGain, { attack: 0.002, sustain: 0.7, decay: 0.01, release: 0.12 });

  // Arrow zip — high filtered noise, short
  const bufSize = ac.sampleRate * 0.18;
  const buffer  = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data    = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const zip = ac.createBufferSource();
  zip.buffer = buffer;

  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3200, now + 0.04);
  bp.frequency.exponentialRampToValueAtTime(5500, now + 0.18);
  bp.Q.value = 3;

  const zipGain = ac.createGain();
  envelope(zipGain, { attack: 0.01, sustain: 0.35, decay: 0.02, release: 0.12 });

  const master = masterGain(0.45);

  twang.connect(twangGain);
  twangGain.connect(master);
  zip.connect(bp);
  bp.connect(zipGain);
  zipGain.connect(master);

  twang.start(now);
  twang.stop(now + 0.2);
  zip.start(now + 0.03);  // zip starts just after twang
  zip.stop(now + 0.22);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

const SOUND_MAP = {
  swipe : playSwipe,
  bash  : playBash,
  shoot : playShoot,
  punch : playPunch,
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

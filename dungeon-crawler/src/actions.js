// ─────────────────────────────────────────────────────────────────────────────
//  WEAPON ACTION ANIMATIONS
//
//  Exported function: playAction(action, hand)
//    action — one of 'swipe' | 'bash' | 'shoot' | 'punch' | null
//
//  Creates a full-screen overlay div over the dungeon view, inserts the
//  appropriate SVG icon, plays the CSS keyframe animation, then removes itself.
//  Also triggers the matching sound via audio.js.
// ─────────────────────────────────────────────────────────────────────────────

import { ACTIONS } from './items.js';
import { playActionSound } from './audio.js';

// SVG markup for each action icon (drawn as the "weapon trail" graphic)
const ACTION_SVG = {

  // Diagonal slash — a curved blade arc with motion lines
  [ACTIONS.SWIPE]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke="#e8c878" stroke-linecap="round" stroke-linejoin="round">
      <!-- Blade arc -->
      <path d="M15 15 Q60 20 105 105" stroke-width="5" stroke="#f0e090" opacity="0.9"/>
      <!-- Motion trails -->
      <path d="M10 30 Q50 35 85 110" stroke-width="2.5" opacity="0.55"/>
      <path d="M25 10 Q65 18 108 90"  stroke-width="2.5" opacity="0.55"/>
      <path d="M5  45 Q40 55 75 115"  stroke-width="1.5" opacity="0.3"/>
      <!-- Blade tip flash -->
      <circle cx="105" cy="105" r="5" fill="#fff8c0" stroke="none" opacity="0.8"/>
    </svg>`,

  // Straight thrust — a mace/staff punching forward with impact rings
  [ACTIONS.BASH]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke="#e8a040" stroke-linecap="round" stroke-linejoin="round">
      <!-- Weapon shaft -->
      <line x1="25" y1="95" x2="75" y2="45" stroke-width="6" stroke="#d89030" opacity="0.9"/>
      <!-- Head of mace / impact block -->
      <rect x="68" y="30" width="22" height="22" rx="4" stroke-width="3" fill="rgba(232,160,64,0.15)" stroke="#f0b050"/>
      <!-- Impact rings -->
      <circle cx="82" cy="42" r="14" stroke-width="2"  opacity="0.5"/>
      <circle cx="82" cy="42" r="22" stroke-width="1.5" opacity="0.3"/>
      <circle cx="82" cy="42" r="30" stroke-width="1"   opacity="0.15"/>
      <!-- Impact sparks -->
      <line x1="82" y1="20" x2="82" y2="10" stroke-width="2" opacity="0.7"/>
      <line x1="100" y1="28" x2="108" y2="22" stroke-width="2" opacity="0.7"/>
      <line x1="104" y1="48" x2="114" y2="50" stroke-width="2" opacity="0.7"/>
    </svg>`,

  // Arrow in flight — angled projectile with feather fletching
  [ACTIONS.SHOOT]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke="#90d060" stroke-linecap="round" stroke-linejoin="round">
      <!-- Arrow shaft (diagonal) -->
      <line x1="20" y1="100" x2="95" y2="25" stroke-width="3" stroke="#a8e070" opacity="0.9"/>
      <!-- Arrowhead -->
      <polygon points="95,25 82,30 88,38" fill="#c0f080" stroke="#c0f080" stroke-width="1" opacity="0.95"/>
      <!-- Fletching left -->
      <path d="M20 100 L8 112 L28 96" fill="rgba(160,220,80,0.3)" stroke="#90d060" stroke-width="1.5"/>
      <!-- Fletching right -->
      <path d="M20 100 L14 116 L30 106" fill="rgba(160,220,80,0.2)" stroke="#90d060" stroke-width="1"/>
      <!-- Air trail -->
      <path d="M30 90 Q55 65 85 35" stroke-width="1.5" stroke="#c0f080" opacity="0.35" stroke-dasharray="4 4"/>
    </svg>`,

  // Bare-knuckle punch — fist driving forward with star burst impact
  [ACTIONS.PUNCH]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke="#e07840" stroke-linecap="round" stroke-linejoin="round">
      <!-- Fist body (closed hand silhouette) -->
      <rect x="52" y="44" width="34" height="26" rx="6" fill="rgba(200,100,40,0.18)" stroke="#e8904a" stroke-width="2.5"/>
      <!-- Knuckle lines -->
      <line x1="58" y1="44" x2="58" y2="38" stroke-width="2" stroke="#e8904a" opacity="0.8"/>
      <line x1="67" y1="44" x2="67" y2="36" stroke-width="2" stroke="#e8904a" opacity="0.8"/>
      <line x1="76" y1="44" x2="76" y2="38" stroke-width="2" stroke="#e8904a" opacity="0.8"/>
      <!-- Thumb -->
      <path d="M52 58 Q44 54 46 48 Q48 44 54 46" stroke-width="2" stroke="#d07030" opacity="0.85"/>
      <!-- Motion lines behind fist -->
      <line x1="48" y1="52" x2="22" y2="52" stroke-width="2.5" opacity="0.5"/>
      <line x1="48" y1="46" x2="26" y2="40" stroke-width="2"   opacity="0.4"/>
      <line x1="48" y1="58" x2="26" y2="64" stroke-width="2"   opacity="0.4"/>
      <line x1="48" y1="42" x2="32" y2="32" stroke-width="1.5" opacity="0.25"/>
      <line x1="48" y1="62" x2="32" y2="72" stroke-width="1.5" opacity="0.25"/>
      <!-- Impact star burst at knuckles -->
      <line x1="88" y1="57" x2="98" y2="57" stroke-width="2.5" stroke="#ffcc60" opacity="0.9"/>
      <line x1="88" y1="52" x2="96" y2="44" stroke-width="2"   stroke="#ffcc60" opacity="0.8"/>
      <line x1="88" y1="62" x2="96" y2="70" stroke-width="2"   stroke="#ffcc60" opacity="0.8"/>
      <line x1="86" y1="48" x2="90" y2="38" stroke-width="1.5" stroke="#ffcc60" opacity="0.6"/>
      <line x1="86" y1="66" x2="90" y2="76" stroke-width="1.5" stroke="#ffcc60" opacity="0.6"/>
      <!-- Impact flash circle -->
      <circle cx="90" cy="57" r="10" stroke-width="1.5" stroke="#ffdd80" opacity="0.4"/>
    </svg>`,

};

/**
 * Play the weapon action animation overlay on the dungeon view.
 * @param {string|null} action  — one of ACTIONS values, or null (no-op)
 * @param {string}      hand    — 'left' | 'right'  (mirrors swipe/shoot/punch for right hand)
 */
export function playAction(action, hand = 'left') {
  if (!action || !ACTION_SVG[action]) return;

  // Play the matching sound simultaneously
  playActionSound(action);

  // Remove any existing animation that hasn't finished yet
  const existing = document.getElementById('action-anim');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'action-anim';
  el.classList.add(`anim-${action}`);
  el.innerHTML = ACTION_SVG[action];

  // Mirror the graphic for right-hand attacks
  if (hand === 'right' && (action === ACTIONS.SWIPE || action === ACTIONS.SHOOT || action === ACTIONS.PUNCH)) {
    el.querySelector('svg').style.transform = 'scaleX(-1)';
  }

  document.body.appendChild(el);

  // Remove after animation ends
  el.addEventListener('animationend', () => el.remove(), { once: true });
  // Safety fallback in case animationend never fires
  setTimeout(() => { if (el.parentNode) el.remove(); }, 900);
}

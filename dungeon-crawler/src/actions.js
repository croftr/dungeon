// ─────────────────────────────────────────────────────────────────────────────
//  WEAPON ACTION ANIMATIONS
//
//  Exported function: playAction(attackType, hand)
//    attackType — one of 'swipe' | 'bash' | 'shoot' | 'punch' | null
//
//  Creates a full-screen overlay div over the dungeon view, inserts the
//  appropriate SVG icon, plays the CSS keyframe animation, then removes itself.
//  Also triggers the matching sound via audio.js.
// ─────────────────────────────────────────────────────────────────────────────

import { ACTIONS } from './items.js';
import { playActionSound } from './audio.js';

const ACTION_SVG = {

  // Diagonal slash — a curved blade arc with motion lines + glowing filter
  [ACTIONS.SWIPE]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <filter id="glowSwipe" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stroke="#fff" />
          <stop offset="50%" stroke="#e8c878" />
          <stop offset="100%" stroke="#8a6020" />
        </linearGradient>
      </defs>
      <g filter="url(#glowSwipe)">
        <!-- Solid blade arc -->
        <path d="M15 15 Q60 20 105 105" stroke-width="7" stroke="url(#bladeGrad)" opacity="0.9"/>
        <!-- Motion trails layered for depth -->
        <path d="M10 25 Q55 30 90 110" stroke-width="3" stroke="#f0e090" opacity="0.6"/>
        <path d="M25 8 Q65 14 112 90"  stroke-width="3" stroke="#c0a060" opacity="0.6"/>
        <path d="M5  45 Q40 55 75 115"  stroke-width="1.5" stroke="#e8c878" opacity="0.4"/>
        <!-- Disparate sparks along the path -->
        <line x1="85" y1="75" x2="95" y2="85" stroke-width="2" stroke="#fff" opacity="0.8"/>
        <line x1="45" y1="35" x2="52" y2="48" stroke-width="1.5" stroke="#fff" opacity="0.6"/>
        <!-- Blade tip star flash -->
        <path d="M105 105 L108 95 L115 105 L108 115 Z" fill="#fff8c0" stroke="none" opacity="0.9"/>
      </g>
    </svg>`,

  // Straight thrust — heavy 3D-like mace punching forward, impact shockwaves
  [ACTIONS.BASH]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <filter id="glowBash" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <radialGradient id="impactGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.8"/>
          <stop offset="40%" stop-color="#f0b050" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#e8a040" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <g filter="url(#glowBash)">
        <!-- Fast motion streak behind weapon -->
        <line x1="15" y1="105" x2="65" y2="55" stroke-width="12" stroke="#402010" opacity="0.3"/>
        <!-- Weapon shaft -->
        <line x1="25" y1="95" x2="75" y2="45" stroke-width="8" stroke="#a06020" opacity="0.95"/>
        <line x1="28" y1="92" x2="78" y2="42" stroke-width="3" stroke="#d89030" opacity="0.9"/>
        <!-- Head of mace / heavy iron block -->
        <rect x="65" y="27" width="28" height="28" rx="6" stroke-width="4" fill="rgba(60,30,10,0.8)" stroke="#f0b050"/>
        <!-- Impact epicenter -->
        <circle cx="82" cy="42" r="28" fill="url(#impactGlow)" stroke="none" />
        <!-- Shockwave rings -->
        <circle cx="82" cy="42" r="16" stroke-width="3.5" stroke="#f0b050" opacity="0.8"/>
        <circle cx="82" cy="42" r="30" stroke-width="2" stroke="#e8a040" opacity="0.4"/>
        <circle cx="82" cy="42" r="45" stroke-width="1" stroke="#e8a040" opacity="0.15"/>
        <!-- Shrapnel / sparks flying out -->
        <line x1="82" y1="18" x2="82" y2="4" stroke-width="3" stroke="#fff" opacity="0.9"/>
        <line x1="102" y1="22" x2="114" y2="12" stroke-width="2.5" stroke="#ffdd80" opacity="0.8"/>
        <line x1="106" y1="48" x2="118" y2="52" stroke-width="2.5" stroke="#ffdd80" opacity="0.8"/>
        <line x1="94" y1="62" x2="104" y2="72" stroke-width="2" stroke="#ffaa40" opacity="0.6"/>
      </g>
    </svg>`,

  // Arrow in flight — viewed from behind, flying straight into the screen depth
  [ACTIONS.SHOOT]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <filter id="glowShoot" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="arrowShaft" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#302010" />
          <stop offset="100%" stop-color="#906030" />
        </linearGradient>
      </defs>
      <g filter="url(#glowShoot)">
        <!-- Tapered shaft extending into the distance -->
        <polygon points="56,105 64,105 61,40 59,40" fill="url(#arrowShaft)" stroke="#201005" stroke-width="1" />
        
        <!-- Arrowhead (small, distant) -->
        <polygon points="57,42 63,42 60,32" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1" />
        
        <!-- Fletching Left (Large and close) -->
        <polygon points="56,100 25,120 58,75" fill="rgba(200,255,130,0.85)" stroke="#90d060" stroke-width="1.5"/>
        
        <!-- Fletching Right (Large and close) -->
        <polygon points="64,100 95,120 62,75" fill="rgba(200,255,130,0.85)" stroke="#90d060" stroke-width="1.5"/>
        
        <!-- Fletching Top (Center ridge standing up towards us) -->
        <polygon points="58,105 62,105 61,75 59,75" fill="#ccff90" opacity="0.95" stroke="#a0f060" stroke-width="1"/>
        
        <!-- Center arrow nock (where the string goes) -->
        <circle cx="60" cy="105" r="3" fill="#201005" />
        
        <!-- Perspective wind lines pulling into the center -->
        <line x1="30" y1="110" x2="52" y2="60" stroke-width="1.5" stroke="#d0ff80" opacity="0.4" stroke-dasharray="2 4"/>
        <line x1="90" y1="110" x2="68" y2="60" stroke-width="1.5" stroke="#d0ff80" opacity="0.4" stroke-dasharray="2 4"/>
        <line x1="10" y1="80" x2="45" y2="40" stroke-width="1" stroke="#a0f060" opacity="0.3" stroke-dasharray="2 6"/>
        <line x1="110" y1="80" x2="75" y2="40" stroke-width="1" stroke="#a0f060" opacity="0.3" stroke-dasharray="2 6"/>
      </g>
    </svg>`,

  // Bare-knuckle punch — bone-crunching fist with dynamic star burst
  [ACTIONS.PUNCH]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <filter id="glowPunch" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <radialGradient id="punchGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="#ff9040" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#d04020" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <g filter="url(#glowPunch)">
        <!-- Motion lines behind fist (heavier) -->
        <line x1="45" y1="52" x2="10" y2="52" stroke-width="4" stroke="#d05020" opacity="0.4"/>
        <line x1="45" y1="44" x2="15" y2="35" stroke-width="3" stroke="#e07840" opacity="0.3"/>
        <line x1="45" y1="60" x2="15" y2="69" stroke-width="3" stroke="#e07840" opacity="0.3"/>
        
        <!-- Fist body (meaty hand silhouette) -->
        <rect x="50" y="42" width="38" height="30" rx="8" fill="rgba(160,60,20,0.8)" stroke="#ffa060" stroke-width="3"/>
        <rect x="53" y="45" width="28" height="24" rx="4" fill="rgba(255,140,80,0.4)" stroke="none"/>
        
        <!-- Knuckle lines -->
        <line x1="58" y1="42" x2="58" y2="36" stroke-width="3" stroke="#ffa060" opacity="0.9"/>
        <line x1="68" y1="42" x2="68" y2="34" stroke-width="3" stroke="#ffa060" opacity="0.9"/>
        <line x1="78" y1="42" x2="78" y2="36" stroke-width="3" stroke="#ffa060" opacity="0.9"/>
        
        <!-- Thumb securely tucked -->
        <path d="M50 58 Q40 52 44 46 Q48 42 54 44" stroke-width="3" stroke="#e06030" fill="rgba(200,80,30,0.6)" opacity="0.9"/>
        
        <!-- Core Impact flash -->
        <circle cx="95" cy="57" r="18" fill="url(#punchGlow)" stroke="none" />
        
        <!-- Sharp impact star burst at knuckles -->
        <path d="M95 57 L85 40 L98 50 L115 45 L102 57 L115 69 L98 64 L85 74 Z" fill="rgba(255,200,100,0.5)" stroke="#ffe080" stroke-width="2" opacity="0.9"/>
        
        <!-- High-energy impact sparks -->
        <circle cx="110" cy="40" r="2" fill="#fff" stroke="none" opacity="0.8"/>
        <circle cx="112" cy="75" r="1.5" fill="#fff" stroke="none" opacity="0.8"/>
        <circle cx="85" cy="28" r="2" fill="#ffcc60" stroke="none" opacity="0.7"/>
      </g>
    </svg>`,

};

/**
 * Play the weapon action animation overlay on the dungeon view.
 * @param {string|null} attackType  — one of ACTIONS values, or null (no-op)
 * @param {string}      hand        — 'left' | 'right'  (mirrors swipe/shoot/punch for right hand)
 */
export function playAction(attackType, hand = 'left') {
  if (!attackType || !ACTION_SVG[attackType]) return;

  // Play the matching sound simultaneously
  playActionSound(attackType);

  // Remove any existing animation that hasn't finished yet
  const existing = document.getElementById('action-anim');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'action-anim';
  el.classList.add(`anim-${attackType}`);
  el.innerHTML = ACTION_SVG[attackType];

  // Mirror the graphic for right-hand attacks
  if (hand === 'right' && (attackType === ACTIONS.SWIPE || attackType === ACTIONS.SHOOT || attackType === ACTIONS.PUNCH)) {
    el.querySelector('svg').style.transform = 'scaleX(-1)';
  }

  document.body.appendChild(el);

  // Remove after animation ends
  el.addEventListener('animationend', () => el.remove(), { once: true });
  // Safety fallback in case animationend never fires
  setTimeout(() => { if (el.parentNode) el.remove(); }, 900);
}

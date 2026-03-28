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
import { playSlashTrail, playShieldTrail } from './slash-trail.js';

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

  // Heavy overhead slam — chunky mace descending with massive blunt impact
  [ACTIONS.BASH]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <filter id="glowBash" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <radialGradient id="impactGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.9"/>
          <stop offset="40%" stop-color="#f0b050" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#e8a040" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <g filter="url(#glowBash)">
        <!-- Motion blur trail (descending) -->
        <rect x="52" y="10" width="16" height="60" fill="rgba(80,60,40,0.15)" rx="8" />
        
        <!-- Weapon shaft (oriented vertically for downward slam) -->
        <line x1="60" y1="105" x2="60" y2="45" stroke-width="10" stroke="#8a6020" opacity="0.95"/>
        <line x1="57" y1="105" x2="57" y2="45" stroke-width="3" stroke="#c0a060" opacity="0.8"/>
        
        <!-- Heavy Mace Head (chunky, spiked iron ball) -->
        <circle cx="60" cy="35" r="22" fill="#3a2a18" stroke="#f0b050" stroke-width="3"/>
        <!-- Mace Spikes -->
        <path d="M60 10 L64 18 L56 18 Z" fill="#f0b050" />
        <path d="M85 35 L77 31 L77 39 Z" fill="#f0b050" />
        <path d="M35 35 L43 31 L43 39 Z" fill="#f0b050" />
        <path d="M43 18 L48 24 L52 20 Z" fill="#f0b050" />
        <path d="M77 18 L72 24 L68 20 Z" fill="#f0b050" />

        <!-- Impact epicenter (active during collision phase) -->
        <circle cx="60" cy="35" r="35" fill="url(#impactGlow)" opacity="0.6" />
        
        <!-- Heavy shockwave rings -->
        <ellipse cx="60" cy="35" rx="30" ry="25" stroke="#f0b050" stroke-width="4" opacity="0.7"/>
        <ellipse cx="60" cy="35" rx="50" ry="40" stroke="#e8a040" stroke-width="2" opacity="0.3"/>
        
        <!-- Blunt debris/dust clouds -->
        <circle cx="25" cy="45" r="8" fill="rgba(180,160,140,0.4)" stroke="none"/>
        <circle cx="95" cy="45" r="6" fill="rgba(180,160,140,0.3)" stroke="none"/>
        <circle cx="45" cy="65" r="5" fill="rgba(180,160,140,0.2)" stroke="none"/>
      </g>
    </svg>`,

  // Arrow in flight — viewed from behind, flying straight into the screen depth
  // Tip is near the viewBox centre (60,57) so CSS scale() shrinks the arrow toward
  // its own tip rather than toward the SVG midpoint, giving a straight-ahead flight path.
  [ACTIONS.SHOOT]: `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         fill="none" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <filter id="glowShoot" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <!-- Gradient: dark near end (nock/bottom), lighter far end (tip/top) -->
        <linearGradient id="arrowShaft" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#302010" />
          <stop offset="100%" stop-color="#906030" />
        </linearGradient>
      </defs>
      <g filter="url(#glowShoot)">
        <!-- Tapered shaft: wide at nock (near), narrow near tip (far) -->
        <polygon points="55,96 65,96 62,66 58,66" fill="url(#arrowShaft)" stroke="#201005" stroke-width="0.5" />

        <!-- Arrowhead: small, near centre of viewBox so scale() keeps it near screen centre -->
        <polygon points="57,68 63,68 60,57" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1" />

        <!-- Fletching Left — large, sweeps to bottom-left -->
        <polygon points="56,88 14,118 58,72" fill="rgba(200,255,130,0.85)" stroke="#90d060" stroke-width="1.5"/>

        <!-- Fletching Right — mirrors left -->
        <polygon points="64,88 106,118 62,72" fill="rgba(200,255,130,0.85)" stroke="#90d060" stroke-width="1.5"/>

        <!-- Centre ridge between fletchings -->
        <polygon points="58,94 62,94 61,73 59,73" fill="#ccff90" opacity="0.9" stroke="#a0f060" stroke-width="0.8"/>

        <!-- Nock (string notch) -->
        <circle cx="60" cy="97" r="3.5" fill="#201005" stroke="#604020" stroke-width="1" />

        <!-- Speed lines converging toward the tip -->
        <line x1="25" y1="112" x2="52" y2="72" stroke-width="1.5" stroke="#d0ff80" opacity="0.4" stroke-dasharray="2 4"/>
        <line x1="95" y1="112" x2="68" y2="72" stroke-width="1.5" stroke="#d0ff80" opacity="0.4" stroke-dasharray="2 4"/>
        <line x1="5"  y1="92"  x2="44" y2="62" stroke-width="1"   stroke="#a0f060" opacity="0.3" stroke-dasharray="2 6"/>
        <line x1="115" y1="92" x2="76" y2="62" stroke-width="1"   stroke="#a0f060" opacity="0.3" stroke-dasharray="2 6"/>
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

  // Fireball now uses 3D particles instead of a 2D SVG overlay.
  [ACTIONS.FIREBALL]: null,
  [ACTIONS.BANISHMENT]: null,
  [ACTIONS.REGENERATE]: null,

};

/**
 * Play the weapon action animation overlay on the dungeon view.
 * @param {string|null} attackType  — one of ACTIONS values, or null (no-op)
 * @param {string}      hand        — 'left' | 'right'  (mirrors swipe/shoot/punch for right hand)
 * @param {number}      memberIndex — party member index (0-3), controls arc direction
 */
export function playAction(attackType, hand = 'left', memberIndex = 0) {
  if (!attackType) return;

  // Play the matching sound simultaneously
  playActionSound(attackType);

  // Spells with no visual overlay (use 3D particles instead) — stop here
  if (attackType === ACTIONS.FIREBALL || attackType === ACTIONS.BANISHMENT || attackType === ACTIONS.REGENERATE || attackType === ACTIONS.INCINERATE) {
    return;
  }

  // Shield bash — chunky bottom-up trail
  if (attackType === ACTIONS.SHIELD_BASH) {
    playShieldTrail(hand);
    return;
  }

  // Other melee attacks use the diagonal slash trail
  if (attackType === ACTIONS.SWIPE || attackType === ACTIONS.BASH || attackType === ACTIONS.PUNCH) {
    playSlashTrail(hand, memberIndex);
    return;
  }

  // SHOOT and other types fall through to the original SVG overlay
  const visualType = attackType;

  const existing = document.getElementById('action-anim');
  if (existing) existing.remove();

  if (!ACTION_SVG[visualType]) return;

  const el = document.createElement('div');
  el.id = 'action-anim';
  el.classList.add(`anim-${visualType}`);
  el.innerHTML = ACTION_SVG[visualType];

  if (hand === 'right' && attackType === ACTIONS.SHOOT) {
    el.querySelector('svg').style.transform = 'scaleX(-1)';
  }

  setTimeout(() => {
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 900);
  }, 100);
}

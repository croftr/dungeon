import * as THREE from 'three';
import { createBlobShadow } from './blob-shadow.js';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, player } from './player.js';
import { createHitSpark, createIceBurst, createNatureBurst, createOgreSlam, createMinotaurRage, createTreemanAwakening, createDemonCleave, createTidalWave, createLizardVenomSpit, createPoisonCloud, createIceCloud, createCrocodileSparkle, createHellSpawn, createBloodSplatter, createGreenBloodSplatter, createCrowWizardFireAoe, createCrowWizardCure, createCrowWizardFear, createElementalBurst } from './particles.js';
import { ELEMENTS, getMonsterElementMultiplier } from './elements.js';
import MONSTER_FAMILIES from './data/monster-families.json';
import { CELL, isPassable, elementFloorCellId, spawnElementFloorAt } from './map.js';
import { gltfLoader as _gltfLoader } from './gltf-loader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { party, setHp, addGold, flashPortraitHit, showMemberDamage, showMemberHeal, refreshPartyCards, applyStatusEffect, getEffectiveStats, getEffectiveStatusResistances, getEffectiveElementalResistances, getDefenceModifier, describeEffect, isPartyInvincible, isPartyUnseen } from './party.js';
import { STATUS_EFFECT_DEFS } from './status-effects.js';
import { showMessage } from './minimap.js';
import { getPoisonTickBonus, getReflectDamage, getCritChanceBonus, getStanceBerserkMultiplier, getStanceLifestealAmount } from './stance.js';
import {
  playerHitChance, playerSpellHitChance, monsterHitChance,
  calcPlayerPhysicalDamage, calcPlayerMagicDamage, calcMonsterDamage,
  getElementalRiderBreakdown,
  calcOnHitChance,
  pickRandomFrontLineTarget, pickDirectionalTarget,
  CRIT_CHANCE, CRIT_MULTIPLIER, getSpellCritChanceBonus, getDexCritChanceBonus,
  MONSTER_BASE_ATTACK,
  SHIELD_BASH_STUN_CHANCE, SHIELD_BASH_STUN_DURATION_MS,
} from './combat-rules.js';
import { setInCombat, clearCombat, playCritSound, playActionSound, playHitSound, playPartyHitSound, playShieldBlockSound, isInCombat, playSoundByUrl, setZoneMusic } from './audio.js';
import { addLogEntry } from './battle-log.js';
import { resetBattleStats, recordDamageDealt, recordDamageTaken, recordAttack, showBattleStatsIcon } from './battle-stats.js';
import { getItemDef } from './items.js';
import { spawnDroppedItem, isStatueAt, spawnCorpse, checkTrapForMonster } from './objects.js';
import ELEMENT_FLOORS from './data/element-floors.json';
import { dungeonMap } from './map.js';
import { MONSTER_DEFS as D } from './monster-defs.js';
import { inst } from './monster-factory.js';
import { level0Monsters } from './levels/level0/monsters.js';
import { level1Monsters } from './levels/level1/monsters.js';
import { level2Monsters } from './levels/level2/monsters.js';
import { level3Monsters } from './levels/level3/monsters.js';
import { level4Monsters } from './levels/level4/monsters.js';
import { crowRealmMonsters } from './levels/crow-realm/monsters.js';
import { skillsState } from './skills-state.js';
import SKILLS_DATA from './data/skills.json';
import { awardXP } from './leveling.js';
import { showInlineHelp } from './help.js';
import { asset } from './assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  HUNTER'S EYE STATE  — ephemeral, NOT saved.
// ─────────────────────────────────────────────────────────────────────────────
let _huntersEyeTargetId = null;

// ─────────────────────────────────────────────────────────────────────────────
//  CANONICAL MONSTER COLLECTIONS — save-relevant Sets.
//
//  • droppedBossEssences — item names already dropped by a boss kill, so the
//    same essence is never dropped twice in one playthrough.
//  • killedBosses — keys `${level}:${id}` for bosses that stay dead across
//    level revisits and saves (non-boss monsters respawn on level revisit).
//
//  Names match the JSON payload keys.
// ─────────────────────────────────────────────────────────────────────────────
const _collections = {
  droppedBossEssences: new Set(),
  killedBosses: new Set(),
  // Element-floor tiles spawned by monster spells at runtime (e.g. Crow Wizard's
  // Flaming Floor). Each entry is the string "<level>:<row>,<col>". Re-applied
  // on level entry by `loadMonstersForLevel`, captured in save bundles.
  spawnedFireFloors: new Set(),
  // Lightning floor tiles placed permanently when the Iron Warden gate is opened.
  // Same key format: "<level>:<row>,<col>".
  spawnedLightningFloors: new Set(),
};

/** True if this monster instance is a "boss" — marked in its def with an image. */
function _isBossMonster(m) {
  return !!m.image;
}

function _bossKey(m) {
  return `${m.level ?? 1}:${m.id}`;
}

/** Returns the id of the monster currently targeted by Hunter's Eye, or null. */
export function getHuntersEyeTargetId() { return _huntersEyeTargetId; }

/** Show or hide the detailed stats panel above the chosen monster. Pass null to hide all. */
export function setHuntersEyeTarget(id) {
  _huntersEyeTargetId = id;
  monsters.forEach((m) => {
    if (m.statsLabel) m.statsLabel.visible = false; // floating label always hidden; HUD panel takes over
    if (id !== null && m.id === id) _renderHuntersEyeHud(m);
  });
  if (id === null) _hideHuntersEyePanel();
}

/**
 * Called at the start of a new fight (new monster engages).
 * Clears the Hunter's Eye panel only if its target is already dead.
 */
export function clearHuntersEyeIfDead() {
  if (_huntersEyeTargetId === null) return;
  const target = monsters.find(m => m.id === _huntersEyeTargetId);
  if (!target || !target.alive) {
    _huntersEyeTargetId = null;
    _hideHuntersEyePanel();
  }
}

function _hideHuntersEyePanel() {
  const panel = document.getElementById('hunters-eye-panel');
  if (panel) panel.style.display = 'none';
}

let _hudPanelInitialized = false;

function _renderHuntersEyeHud(m) {
  const panel = document.getElementById('hunters-eye-panel');
  const content = document.getElementById('hunters-eye-content');
  if (!panel || !content) return;

  if (!_hudPanelInitialized) {
    document.getElementById('hunters-eye-close')?.addEventListener('click', () => setHuntersEyeTarget(null));
    _hudPanelInitialized = true;
  }

  // Clear any inline bottom style so CSS positioning can take over
  panel.style.bottom = '';

  const s = m.stats ?? {};
  const familyDef = MONSTER_FAMILIES[m.family];

  // Merge elemental resistances: monster-specific overrides family
  const allResistances = { ...(familyDef?.elementalResistances ?? {}), ...(m.elementalResistances ?? {}) };

  const isSundered = skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id;
  const sunderMag = skillsState.sunderArmor?.magnitude ?? 1;
  const defVal = m.defence ?? '—';
  const resVal = s.resilience ?? '—';
  const displayDef = isSundered && defVal !== '—' ? `<span style="color:#ff8080">${Math.floor(defVal * sunderMag)}</span>` : defVal;
  const displayRes = isSundered && resVal !== '—' ? `<span style="color:#ff8080">${Math.floor(resVal * sunderMag)}</span>` : resVal;

  const isDefeated = !m.alive;

  let html = '';

  // Name + family
  html += `<div class="hep-hud-name">${m.name}</div>`;
  if (familyDef) html += `<div class="hep-hud-family">${familyDef.name}</div>`;

  // Defeated banner
  if (isDefeated) {
    html += `<div class="hep-hud-divider"></div>`;
    html += `<div class="hep-hud-defeated">☠ DEFEATED</div>`;
  }

  // Core stats
  html += `<div class="hep-hud-divider"></div>`;
  html += `<div class="hep-hud-section-label">Stats</div>`;
  if (isDefeated) {
    html += `<div class="hep-hud-row"><span class="hep-hud-label">HP</span><span class="hep-hud-val" style="color:#ff6060">0 / ${m.hpMax}</span></div>`;
  } else {
    html += `<div class="hep-hud-row"><span class="hep-hud-label">HP</span><span class="hep-hud-val">${m.hp} / ${m.hpMax}</span></div>`;
  }
  const reductionStr = m.damageReduction ? ` <span style="color:#9a8850">+${Math.round(m.damageReduction * 100)}% reduction</span>` : '';
  html += `<div class="hep-hud-row"><span class="hep-hud-label">DEF</span><span class="hep-hud-val">${displayDef}${reductionStr}</span></div>`;
  html += `<div class="hep-hud-row"><span class="hep-hud-label">ATK SPD</span><span class="hep-hud-val">${m.attackSpeed}×</span></div>`;
  html += `<div class="hep-hud-grid">`;
  html += `<span class="hep-hud-stat">STR <b>${s.strength ?? '—'}</b></span>`;
  html += `<span class="hep-hud-stat">DEX <b>${s.dexterity ?? '—'}</b></span>`;
  html += `<span class="hep-hud-stat">VIT <b>${s.vitality ?? '—'}</b></span>`;
  html += `<span class="hep-hud-stat">INT <b>${s.intelligence ?? '—'}</b></span>`;
  html += `<span class="hep-hud-stat">RES <b>${displayRes}</b></span>`;
  html += `</div>`;

  // Elemental resistances
  const RESIST_CONF = {
    immune:     { label: 'IMMUNE',     color: '#9060ff' },
    resist:     { label: 'RESIST',     color: '#60b0ff' },
    weak:       { label: 'WEAK',       color: '#ffb040' },
    vulnerable: { label: 'VULNERABLE', color: '#ff5050' },
  };
  const resistEntries = Object.entries(allResistances);
  if (resistEntries.length) {
    html += `<div class="hep-hud-divider"></div>`;
    html += `<div class="hep-hud-section-label">Elemental</div>`;
    for (const [elemId, category] of resistEntries) {
      const elemDef = ELEMENTS[elemId];
      const conf = RESIST_CONF[category] ?? { label: category.toUpperCase(), color: '#ddd0a0' };
      const symbol = elemDef?.symbol ?? '';
      const elemName = elemDef?.name ?? elemId;
      const elemColor = elemDef?.color ?? '#ddd0a0';
      const iconHtml = elemDef?.icon ? `<img src="${elemDef.icon}" class="hep-hud-elem-icon" alt="">` : '';
      html += `<div class="hep-hud-resist-row">`;
      html += `<span style="color:${elemColor}">${iconHtml}${symbol} ${elemName}</span>`;
      html += `<span class="hep-hud-resist-badge" style="color:${conf.color}">${conf.label}</span>`;
      html += `</div>`;
    }
  }

  // Elemental damage dealt by monster
  if (m.elementalDamage && Object.keys(m.elementalDamage).length) {
    html += `<div class="hep-hud-divider"></div>`;
    html += `<div class="hep-hud-section-label">Elemental Damage</div>`;
    for (const [elemId, bonus] of Object.entries(m.elementalDamage)) {
      const elemDef = ELEMENTS[elemId];
      const symbol = elemDef?.symbol ?? '';
      const elemName = elemDef?.name ?? elemId;
      const elemColor = elemDef?.color ?? '#ddd0a0';
      const iconHtml = elemDef?.icon ? `<img src="${elemDef.icon}" class="hep-hud-elem-icon" alt="">` : '';
      html += `<div class="hep-hud-row"><span style="color:${elemColor}">${iconHtml}${symbol} ${elemName}</span><span class="hep-hud-val">+${bonus}</span></div>`;
    }
  }

  // Special attacks (pulled from multi-attack variants with specialAttack:true)
  const _specialVariants = (m.attacks ?? []).filter(a => a.specialAttack);
  const _allSpecials = [...(m.specialAttacks ?? []), ..._specialVariants];
  if (_allSpecials.length) {
    html += `<div class="hep-hud-divider"></div>`;
    html += `<div class="hep-hud-section-label">Special Attacks</div>`;
    for (const sa of _allSpecials) {
      const name = sa.displayName ?? sa.name;
      const tags = [];
      if (sa.aoe) tags.push('AoE');
      if (sa.damageMultiplier) tags.push(`×${sa.damageMultiplier}`);
      const tagStr = tags.length ? ` <span class="hep-hud-special-tag">[${tags.join(', ')}]</span>` : '';
      // Elemental type tag for special attacks
      let elemTagHtml = '';
      if (sa.damageType) {
        const elemDef = ELEMENTS[sa.damageType];
        const elemColor = elemDef?.color ?? '#ddd0a0';
        const iconHtml = elemDef?.icon ? `<img src="${elemDef.icon}" class="hep-hud-elem-icon" alt="">` : '';
        const sym = elemDef?.symbol ?? '';
        const eName = elemDef?.name ?? sa.damageType;
        elemTagHtml = ` <span style="color:${elemColor};font-size:9px">${iconHtml}${sym} ${eName}</span>`;
      }
      html += `<div class="hep-hud-special">`;
      html += `<div class="hep-hud-special-name">${name}${tagStr}${elemTagHtml}</div>`;
      if (sa.description) html += `<div class="hep-hud-special-desc">${sa.description}</div>`;
      // Show on-hit effects for this special attack
      if (sa.specialOnHitEffects?.length) {
        for (const eff of sa.specialOnHitEffects) {
          const def = STATUS_EFFECT_DEFS[eff.effectId];
          const effName = def?.name ?? eff.effectId;
          const chance = Math.round(eff.chance * 100);
          const isPoisonEffect = eff.effectId.includes('poison');
          const effColor = isPoisonEffect ? '#3ecf5a' : (def?.color ?? '#c0ff80');
          html += `<div class="hep-hud-special-onhit" style="color:${effColor}">${effName} <span class="hep-hud-effect-chance">${chance}%</span></div>`;
        }
      }
      html += `</div>`;
    }
  }

  // On-hit effects (monster-level, not per-attack)
  if (m.onHitEffects?.length) {
    html += `<div class="hep-hud-divider"></div>`;
    html += `<div class="hep-hud-section-label">On-Hit Effects</div>`;
    for (const effect of m.onHitEffects) {
      const def = STATUS_EFFECT_DEFS[effect.effectId];
      const name = def?.name ?? effect.effectId;
      const chance = Math.round(effect.chance * 100);
      const desc = def ? describeEffect(def) : '';
      const isPoisonEffect = effect.effectId.includes('poison');
      const effectColor = isPoisonEffect ? '#3ecf5a' : (def?.color ?? '#c0ff80');
      html += `<div class="hep-hud-onhit" style="color:${effectColor}">`;
      html += `<span class="hep-hud-effect-name">${name}</span>`;
      html += `<span class="hep-hud-effect-chance">${chance}%</span>`;
      if (desc) html += `<span class="hep-hud-effect-desc">${desc}</span>`;
      html += `</div>`;
    }
  }

  // Active debuffs currently on the monster (only if still alive)
  if (!isDefeated) {
    const nowMs = performance.now();
    const isEntangled = skillsState.entangle?.active && skillsState.entangle?.targetId === m.id;
    const isStunned = m.stunUntil && nowMs < m.stunUntil;
    const hasStatusDebuffs = m.activeDebuffs?.some(d => nowMs < d.expiresAt);
    if (isSundered || isEntangled || isStunned || hasStatusDebuffs) {
      html += `<div class="hep-hud-divider"></div>`;
      html += `<div class="hep-hud-section-label">Active Effects</div>`;
      if (isSundered) html += `<div class="hep-hud-debuff" style="color:#ff8080">Sunder Armor (DEF/RES ½)</div>`;
      if (isEntangled) html += `<div class="hep-hud-debuff" style="color:#80ff80">Entangle (Atk Spd ½)</div>`;
      if (isStunned)   html += `<div class="hep-hud-debuff" style="color:#ffd040">Stunned (Cannot Act)</div>`;
      (m.activeDebuffs ?? []).forEach(d => {
        if (nowMs >= d.expiresAt) return;
        const def = STATUS_EFFECT_DEFS[d.effectId];
        if (!def) return;
        const isPoisonDebuff = d.effectId.includes('poison');
        const debuffColor = isPoisonDebuff ? '#3ecf5a' : (def.color ?? '#c0ff80');
        html += `<div class="hep-hud-debuff" style="color:${debuffColor}">${def.name} (${describeEffect(def)})</div>`;
      });
    }
  }

  content.innerHTML = html;
  panel.style.display = 'block';
}

// Forward-direction unit vectors per facing value (0=N,1=E,2=S,3=W)
const _FACING_DR = [-1, 0, 1, 0];
const _FACING_DC = [0, 1, 0, -1];

/**
 * Returns the alive monster within melee range of the player that is most
 * aligned with the player's current facing direction.  This ensures that a
 * monster standing between the player and another monster is targeted first,
 * preventing attacks from appearing to "pass through" a closer enemy.
 *
 * Alignment is measured as the dot-product of (monster − player) with the
 * facing unit vector: +1 for directly in front, 0 for the sides, −1 behind.
 * If two monsters share the same score the one earlier in the monsters array
 * wins (stable, deterministic).
 */
export function getInRangeMonster() {
  const currentLevel = window.currentLevel ?? 0;
  // Collect all passable-reachable adjacent monsters
  const candidates = monsters.filter((m) => {
    if (!m.alive) return false;
    if (m._frozen) return false;
    if ((m.level ?? 1) !== currentLevel) return false;
    const distRow = Math.abs(m.gridRow - player.gridRow);
    const distCol = Math.abs(m.gridCol - player.gridCol);
    if (distRow > 1 || distCol > 1) return false;
    if (!isPassable(m.gridRow, m.gridCol) || !isPassable(player.gridRow, player.gridCol)) return false;
    if (distRow === 1 && distCol === 1) {
      if (!isPassable(player.gridRow, m.gridCol) && !isPassable(m.gridRow, player.gridCol)) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Pick the candidate most aligned with the player's facing direction
  const fdr = _FACING_DR[player.facing] ?? 0;
  const fdc = _FACING_DC[player.facing] ?? 0;
  let best = candidates[0];
  let bestScore = (best.gridRow - player.gridRow) * fdr + (best.gridCol - player.gridCol) * fdc;
  for (let i = 1; i < candidates.length; i++) {
    const m = candidates[i];
    const score = (m.gridRow - player.gridRow) * fdr + (m.gridCol - player.gridCol) * fdc;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER INSTANCES
//  Stats come from monster-defs.js. Per-level monster lists live in:
//    src/levels/level1/monsters.js
//    src/levels/level2/monsters.js
//    src/levels/level3/monsters.js
// ─────────────────────────────────────────────────────────────────────────────

export const monsters = [
  ...level0Monsters,
  ...level1Monsters,
  ...level2Monsters,
  ...level3Monsters,
  ...level4Monsters,
  ...crowRealmMonsters,
];

// ── Assign Block Animations ─────────────────────────────────────────────────
monsters.forEach(m => {
  if (m.name.includes('Skeleton')) {
    m.glbBlock = asset('/monsters/skeleton-animation/Meshy_AI_Animation_Shield_Push_Left_withSkin.glb');
  }
});

// ── Formation init ──────────────────────────────────────────────────────────
// For monsters with `formation: "quartet"`, the def's `hp` is interpreted as
// per-sub HP. We expand into a `members` array of 4 sub-monsters (one per
// 2×2 sub-slot) and inflate the aggregate `hp`/`hpMax` to the sum so legacy
// code paths (HP bars, save data, etc.) still see meaningful totals.
//   subSlot 0 = front-Left   subSlot 1 = front-Right
//   subSlot 2 = back-Left    subSlot 3 = back-Right
monsters.forEach(m => {
  if (m.formation === 'quartet' && !m.members) {
    const perSubHp = m.hpMax;
    m.members = [0, 1, 2, 3].map(i => ({
      subSlot: i,
      hp: perSubHp,
      hpMax: perSubHp,
      alive: true,
    }));
    m.hpMax = perSubHp * 4;
    m.hp = m.hpMax;
  }
});

// ── Formation helpers ───────────────────────────────────────────────────────
// Sub-slot 0 lives on `m.mesh`; sub-slots 1–3 live on `m.subMeshes[0..2]`.
function _quartetSubMesh(m, subSlot) {
  if (subSlot === 0) return m.mesh;
  return m.subMeshes?.[subSlot - 1] ?? null;
}

// Active monster front-line for a quartet: [FL_member, FR_member]. A back-row
// sub steps up if its front-row partner is dead. Each entry may be null if
// the whole column is wiped.
function _quartetActiveFront(m) {
  const live = i => (m.members?.[i]?.alive ? m.members[i] : null);
  return [live(0) || live(2), live(1) || live(3)];
}

// Pick which sub-monster a party attacker in `col` (0 = left col / slots 0,2,
// 1 = right col / slots 1,3) hits. Same-column front first, then same-column
// back, then cross-column fallback (front then back) when the same column is
// wiped — mirrors the party's BACKUP_PAIRS behaviour.
function _quartetPickTargetForAttackerCol(m, col) {
  const same = col === 0 ? [0, 2] : [1, 3];
  const other = col === 0 ? [1, 3] : [0, 2];
  for (const i of same)  if (m.members?.[i]?.alive) return m.members[i];
  for (const i of other) if (m.members?.[i]?.alive) return m.members[i];
  return null;
}

// Mirror of _quartetPickTargetForAttackerCol but for a monster attacking the
// party: returns an alive party member in `col` (front first, then back),
// falling back to the other column when both same-column members are dead.
function _partyColumnTarget(col) {
  const same = col === 0 ? [0, 2] : [1, 3];
  const other = col === 0 ? [1, 3] : [0, 2];
  const live = i => {
    const p = party[i];
    return (p && !p.isEmpty && !p.isDead) ? p : null;
  };
  for (const i of same)  if (live(i)) return party[i];
  for (const i of other) if (live(i)) return party[i];
  return null;
}

// Reposition a quartet's four sub-meshes so the player's view of the formation
// matches the logical sub-slot layout: subSlot 0 always sits at the player's
// front-left, 1 at player's front-right, 2 at back-left, 3 at back-right.
// Called every frame so the formation stays oriented toward the player even if
// they walk around the side of the tile.
//
//   "forward" (toward the monster, away from player) snaps to the dominant
//   axis of the monster→player vector. "right" is 90° CW from forward in grid
//   space (drow, dcol) → (dcol, -drow).
//
//   sub offset = ±0.5 * forward (away/toward player) ± 0.5 * right (player's
//   right/left), expressed in world units.
//
// The formation's "center" lives at m._formationX / m._formationZ — a smooth
// world-space anchor that movement code (patrol / chase) tweens, while
// gridRow/gridCol only update on cell-snap. This keeps sub-meshes interpolating
// smoothly between tiles instead of teleporting on commit.
//
// Rear-rank step-up: when a front-row sub (slot 0/1) dies, its back-row
// partner (slot 2/3) slides forward to take its place visually. The dead
// front-row mesh hides so the live back sub isn't overlapping a corpse. Each
// sub's displayed offset (member._offX/_offZ) tweens toward its target so the
// step-up reads as a smooth advance rather than a teleport.
const _SUB_SIGNS = [[-1, -1], [-1, 1], [1, -1], [1, 1]]; // FL, FR, BL, BR (fwdSign, rgtSign)
const _STEPUP_SPEED = 4; // world units per second for the rear-rank slide
function _repositionQuartetSubMeshes(m, playerRow, playerCol, dt = 0) {
  if (!Array.isArray(m.members)) return;
  if (m._formationX == null) {
    m._formationX = m.gridCol * CELL + (m.offsetX ?? 0);
    m._formationZ = m.gridRow * CELL + (m.offsetZ ?? 0);
  }
  const drow = m.gridRow - playerRow; // points from player toward monster
  const dcol = m.gridCol - playerCol;
  let fwdRow, fwdCol;
  if (Math.abs(drow) >= Math.abs(dcol)) {
    fwdRow = Math.sign(drow) || -1;
    fwdCol = 0;
  } else {
    fwdRow = 0;
    fwdCol = Math.sign(dcol) || 1;
  }
  const rgtRow = fwdCol;
  const rgtCol = -fwdRow;
  const H = 0.5;
  const slotOffset = (slot) => {
    const [fS, rS] = _SUB_SIGNS[slot];
    return [(fS * fwdCol + rS * rgtCol) * H, (fS * fwdRow + rS * rgtRow) * H];
  };

  // Per-member target offset + visibility, with the rear-rank step-up rule.
  // For each column: if the front-row member is dead and the back-row partner
  // is alive, the back partner targets the front slot and the dead front mesh
  // is hidden (no corpse overlapping the new occupant).
  const targets = [null, null, null, null];
  const hideFlag = [false, false, false, false];
  for (const col of [0, 1]) {
    const frontSlot = col;     // 0 or 1
    const backSlot = col + 2;  // 2 or 3
    const front = m.members[frontSlot];
    const back = m.members[backSlot];
    if (front.alive) {
      targets[frontSlot] = slotOffset(frontSlot);
      targets[backSlot]  = slotOffset(backSlot);
    } else if (back.alive) {
      // Front dead, back steps up.
      targets[frontSlot] = slotOffset(frontSlot); // corpse "target" stays at FL
      hideFlag[frontSlot] = true;                  // but we hide it
      targets[backSlot]  = slotOffset(frontSlot); // back slides to front
    } else {
      // Both dead — corpses stay where they fell.
      targets[frontSlot] = slotOffset(frontSlot);
      targets[backSlot]  = slotOffset(backSlot);
    }
  }

  const baseX = m._formationX;
  const baseZ = m._formationZ;
  for (let i = 0; i < 4; i++) {
    const member = m.members[i];
    if (!member) continue;
    const [tx, tz] = targets[i];
    // Lazy-init smooth displayed offset to current target so the formation
    // pops into place on first frame instead of sliding in from origin.
    if (member._offX == null) {
      member._offX = tx;
      member._offZ = tz;
    } else if (member._offX !== tx || member._offZ !== tz) {
      const dx = tx - member._offX;
      const dz = tz - member._offZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= _STEPUP_SPEED * dt || dt <= 0) {
        member._offX = tx;
        member._offZ = tz;
      } else {
        const step = _STEPUP_SPEED * dt / dist;
        member._offX += dx * step;
        member._offZ += dz * step;
      }
    }
    // Two visibility flags: _stepupHidden is owned by this function (covered
    // by a back-row replacement), _hideMesh is owned by callers (e.g. fallback
    // when a sub dies without a death animation). The visibility setter
    // unions them.
    member._stepupHidden = hideFlag[i];
    const sub = _quartetSubMesh(m, i);
    if (sub) sub.position.set(baseX + member._offX, sub.position.y, baseZ + member._offZ);
  }
}

// ── Movement abstraction (formation-aware) ─────────────────────────────────
// For solo monsters the moving thing is m.mesh.position. For quartet formations
// it's the virtual center m._formationX/m._formationZ, around which
// _repositionQuartetSubMeshes lays out the four sub-meshes every frame. These
// helpers let _updatePatrol / _updateChase work uniformly on both.
function _moverPos(m) {
  if (m.formation === 'quartet') {
    if (m._formationX == null) {
      m._formationX = m.gridCol * CELL + (m.offsetX ?? 0);
      m._formationZ = m.gridRow * CELL + (m.offsetZ ?? 0);
    }
    return { x: m._formationX, z: m._formationZ };
  }
  return { x: m.mesh.position.x, z: m.mesh.position.z };
}

function _setMoverPos(m, x, z) {
  if (m.formation === 'quartet') {
    m._formationX = x;
    m._formationZ = z;
  } else if (m.mesh) {
    m.mesh.position.x = x;
    m.mesh.position.z = z;
  }
}

function _addMoverPos(m, dx, dz) {
  if (m.formation === 'quartet') {
    m._formationX = (m._formationX ?? 0) + dx;
    m._formationZ = (m._formationZ ?? 0) + dz;
  } else if (m.mesh) {
    m.mesh.position.x += dx;
    m.mesh.position.z += dz;
  }
}

// Rotate the formation (or solo mesh) to face a world-space target. Each sub
// rotates around its own position so the whole 2×2 turns as a unit.
function _setMoverLookAt(m, targetX, targetZ) {
  if (m.formation === 'quartet' && m.members) {
    for (let i = 0; i < 4; i++) {
      const sub = _quartetSubMesh(m, i);
      if (sub) sub.lookAt(targetX, sub.position.y, targetZ);
    }
  } else if (m.mesh) {
    m.mesh.lookAt(targetX, m.mesh.position.y, targetZ);
  }
}

// ── Multi-attack variant definitions ────────────────────────────────────────
// Post-process monsters that have multiple attack animations.
// Each variant defines its own GLB, sound, sound timings, and damage timings.
function _applyMultiAttacks(monsterName, attacks) {
  monsters.forEach(m => {
    if (m.name === monsterName && !m.attacks) {
      m.attacks = attacks;
    }
  });
}

_applyMultiAttacks('Crocodile Warrior', [
  {
    name: 'crocAttack',
    glb: asset('/monsters/crocodile-warrior/double-attack.glb'),
    sound: asset('/monsters/crocodile-warrior/attack.mp3'),
    soundTimings: [0.3, 0.65],
    damageTimings: [0.3, 0.65],
    weight: 4,
  },
  {
    name: 'crocJump',
    glb: asset('/monsters/crocodile-warrior/jump-attack.glb'),
    sound: asset('/monsters/crocodile-warrior/attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 3,
  },
  {
    name: 'crocSpecial',
    glb: asset('/monsters/crocodile-warrior/special-attack.glb'),
    sound: asset('/monsters/crocodile-warrior/special-attack.mp3'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 2,
    damageMultiplier: 1.3,
    specialAttack: true,
  },
]);

_applyMultiAttacks('Skeleton Warrior', [
  {
    name: 'tripleCombo',
    glb: asset('/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb'),
    sound: asset('/monsters/skeleton-animation/attack.mp3'),
    soundTimings: [0.25, 0.75],
    damageTimings: [0.25, 0.75],
    weight: 1,
  },
  {
    name: 'leftSlash',
    glb: asset('/monsters/skeleton-animation/Meshy_AI_Animation_Left_Slash_withSkin.glb'),
    sound: asset('/monsters/skeleton-animation/attack.mp3'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 1,
  },
]);

_applyMultiAttacks('IceMan', [
  {
    name: 'doubleCombo',
    glb: asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    sound: asset('/monsters/iceMan-animation/iceman-attack.mp3'),
    soundTimings: [0.2, 0.6],
    damageTimings: [0.2, 0.6],
    weight: 3,
  },
  {
    name: 'iceCast',
    glb: asset('/monsters/iceMan-animation/Meshy_AI_Animation_mage_soell_cast_3_withSkin.glb'),
    sound: asset('/monsters/iceMan-animation/ice-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 1,
    specialAttack: true,       // hits all party members
    damageType: 'ice',         // whole-hit ice — full damage routes through party ice resistance
    specialOnHitEffects: [{ effectId: 'frozen', chance: 0.20 }],
  },
]);

_applyMultiAttacks('TreeKin', [
  {
    name: 'swing',
    glb: asset('/monsters/treekin-animation/attack.glb'),
    sound: asset('/monsters/treekin-animation/wood-hit.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 7,
  },
  {
    name: 'natureCast',
    glb: asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    sound: asset('/monsters/treekin-animation/treeKin-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 3,
    specialAttack: true, // hits all party members
    specialOnHitEffects: [{ effectId: 'slow', chance: 0.30 }],
  },
]);

_applyMultiAttacks('Ogre', [
  {
    name: 'normalAttack',
    glb: asset('/monsters/ogre/Meshy_AI_Animation_Punch_Combo_withSkin.glb'),
    sound: asset('/monsters/ogre/ogre.mp3'),
    soundTimings: [0.3, 0.6],
    damageTimings: [0.3, 0.6],
    weight: 8,
  },
  {
    name: 'slamAttack',
    glb: asset('/monsters/ogre/Meshy_AI_Animation_Attack_withSkin.glb'),
    sound: asset('/monsters/ogre/ogre.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 8,
  },
  {
    name: 'doubleCombo',
    glb: asset('/monsters/ogre/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    sound: asset('/monsters/ogre/ogre.mp3'),
    soundTimings: [0.3, 0.7],
    damageTimings: [0.3, 0.7],
    weight: 8,
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.75, durationSec: 10 }],
  },
]);

_applyMultiAttacks('Treeman', [
  {
    name: 'normalAttack',
    glb: asset('/monsters/treeman-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    sound: asset('/monsters/treeman-animation/attack-sound.mp3'),
    soundTimings: [0.25, 0.65],
    damageTimings: [0.25, 0.65],
    weight: 1,
  },
  {
    name: 'treemanAwakening',
    glb: asset('/monsters/treeman-animation/Meshy_AI_Animation_mage_soell_cast_1_withSkin.glb'),
    sound: asset('/monsters/treeman-animation/attack-sound.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 0,              // never picked randomly — triggered by half-HP only
    specialAttack: true,     // AoE hits all party members
  },
]);

_applyMultiAttacks('Minotaur', [
  {
    name: 'normalAttack',
    glb: asset('/monsters/minotaur/Meshy_AI_Animation_Attack_withSkin.glb'),
    sound: asset('/monsters/minotaur/minator-attack.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 5,
  },
  {
    name: 'weaponCombo',
    glb: asset('/monsters/minotaur/Meshy_AI_Animation_Weapon_Combo_withSkin.glb'),
    sound: asset('/monsters/minotaur/minator-attack.mp3'),
    soundTimings: [0.25, 0.65],
    damageTimings: [0.25, 0.65],
    weight: 3,
  },
  {
    name: 'minotaurRage',
    glb: asset('/monsters/minotaur/Meshy_AI_Animation_mage_soell_cast_1_withSkin.glb'),
    sound: asset('/monsters/minotaur/minator-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 1,
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.20 }],
  },
]);

_applyMultiAttacks('Demon', [
  {
    name: 'chargedSlash',
    glb: asset('/monsters/demon/Meshy_AI_Animation_Charged_Slash_withSkin.glb'),
    sound: asset('/monsters/demon/demon-hit.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 5,
  },
  {
    name: 'tripleCombo',
    glb: asset('/monsters/demon/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb'),
    sound: asset('/monsters/demon/demon-hit.mp3'),
    soundTimings: [0.25, 0.65],
    damageTimings: [0.25, 0.65],
    weight: 2,
  },
  {
    name: 'demonCleave',
    glb: asset('/monsters/demon/special-attack.glb'),
    sound: asset('/monsters/demon/no-mercy.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 3,
    damageMultiplier: 0.5,
    specialAttack: true,
    damageType: 'dark',
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.25, durationSec: 10 }],
  },
]);

_applyMultiAttacks('Giant', [
  {
    name: 'singleAttack',
    glb: asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Simple_Kick_withSkin.glb'),
    sound: asset('/monsters/giant/giant-attack.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 8,
  },
  {
    name: 'doubleCombo',
    glb: asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Double_Combo_Attack_withSkin.glb'),
    sound: asset('/monsters/giant/giant-attack.mp3'),
    soundTimings: [0.3, 0.7],
    damageTimings: [0.3, 0.7],
    weight: 1,
  },
  {
    name: 'giantsRoar',
    glb: asset('/monsters/giant/giants-roar.glb'),
    sound: asset('/monsters/giant/giant-roar.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 1,
    specialAttack: true,   // AoE — hits all party members including back row
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.20 }],
  },
]);

_applyMultiAttacks('Aqua Man', [
  {
    name: 'punchCombo',
    glb: asset('/monsters/aqua-man/Meshy_AI_Animation_Punch_Combo_withSkin.glb'),
    sound: asset('/monsters/aqua-man/aqua-attack.mp3'),
    soundTimings: [0.3, 0.6],
    damageTimings: [0.3, 0.6],
    weight: 7,
  },
  {
    name: 'tidalWave',
    glb: asset('/monsters/aqua-man/Meshy_AI_Animation_mage_soell_cast_1_withSkin.glb'),
    sound: asset('/monsters/aqua-man/wave.mp3'),
    soundTimings: [0.6],
    damageTimings: [0.6],
    weight: 3,
    damageMultiplier: 0.8,
    specialAttack: true,
    damageType: 'water',
    specialOnHitEffects: [{ effectId: 'slow', chance: 0.60, durationSec: 8 }, { effectId: 'poison', chance: 0.20 }],
  },
]);

_applyMultiAttacks('Orc Warrior', [
  {
    name: 'attack1',
    glb: asset('/monsters/orc-warrior/attack1.glb'),
    sound: asset('/monsters/orc-warrior/attack1.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 1,
  },
  {
    name: 'attack2',
    glb: asset('/monsters/orc-warrior/attack2.glb'),
    sound: asset('/monsters/orc-warrior/attack2.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 1,
  },
]);

_applyMultiAttacks('Lizard Man', [
  {
    name: 'clawSlash',
    glb: asset('/monsters/lizard-man/standard-attack1.glb'),
    sound: asset('/monsters/lizard-man/lizard-normal-attack.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 4,
  },
  {
    name: 'tailSwipe',
    glb: asset('/monsters/lizard-man/standard-attack2.glb'),
    sound: asset('/monsters/lizard-man/lizard-normal-attack.mp3'),
    soundTimings: [0.3, 0.65],
    damageTimings: [0.3, 0.65],
    weight: 3,
  },
  {
    name: 'venomSpit',
    glb: asset('/monsters/lizard-man/special-attack.glb'),
    sound: asset('/monsters/lizard-man/special-attack.mp3'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 2,
    damageMultiplier: 0.8,
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'poison', chance: 0.70 }],
  },
]);

_applyMultiAttacks('Demon Ogre', [
  {
    name: 'standardAttack',
    glb: asset('/monsters/demon-ogre/standard-attack.glb'),
    sound: asset('/monsters/demon-ogre/standard-attack.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 7,
  },
  {
    name: 'hellSpawn',
    glb: asset('/monsters/demon-ogre/special-attack.glb'),
    sound: asset('/monsters/demon-ogre/special-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 1,
    damageMultiplier: 0.5,
    specialAttack: true,
    damageType: 'dark',
    specialOnHitEffects: [{ effectId: 'rot', chance: 0.5 }],
  },
]);

_applyMultiAttacks('Night Goblin', [
  {
    name: 'singleSlash',
    glb: asset('/monsters/night-goblin/single-attack.glb'),
    sound: asset('/monsters/night-goblin/goblin-attack.wav'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 4,
  },
  {
    name: 'doubleSlash',
    glb: asset('/monsters/night-goblin/double-attack.glb'),
    sound: asset('/monsters/night-goblin/goblin-attack.wav'),
    soundTimings: [0.3, 0.65],
    damageTimings: [0.3, 0.65],
    weight: 3,
  },
  {
    name: 'poisonCloud',
    glb: asset('/monsters/night-goblin/special-attack.glb'),
    sound: asset('/monsters/night-goblin/special-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 2,
    damageMultiplier: 0.5,
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'poison', chance: 0.20 }],
  },
]);

_applyMultiAttacks('Mushroom', [
  {
    name: 'sporeAttack',
    glb: asset('/monsters/mushroom/attack.glb'),
    sound: asset('/monsters/mushroom/standard-attack.mp3'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 4,
  },
  {
    name: 'poisonCloud',
    glb: asset('/monsters/mushroom/special-attack.glb'),
    sound: asset('/monsters/mushroom/hiss.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 2,
    damageMultiplier: 0.5,
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'poison', chance: 0.20 }],
  },
]);

_applyMultiAttacks('Ice Mushroom', [
  {
    name: 'sporeAttack',
    glb: asset('/monsters/ice-mushroom/standard-attack.glb'),
    sound: asset('/monsters/ice-mushroom/standard-attack.mp3'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 4,
  },
  {
    name: 'iceCloud',
    glb: asset('/monsters/ice-mushroom/special-attack.glb'),
    sound: asset('/monsters/ice-mushroom/hiss.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 2,
    damageMultiplier: 0.5,
    specialAttack: true,
    damageType: 'ice',
    specialOnHitEffects: [{ effectId: 'frozen', chance: 0.25 }],
  },
]);

_applyMultiAttacks('Summoned Skeleton', [
  {
    name: 'skeletonSlash',
    glb: asset('/monsters/summoned-skeleton/attack.glb'),
    sound: asset('/monsters/summoned-skeleton/skeleton-attack.mp3'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 1,
  },
]);

_applyMultiAttacks('Crow Wizard', [
  {
    name: 'crowStrike',
    glb: asset('/monsters/crow-wizard/standard-attack.glb'),
    sound: asset('/monsters/crow-wizard/standard-attack.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 6,
  },
  {
    name: 'crowFireAoe',
    glb: asset('/monsters/crow-wizard/aoe-spell.glb'),
    sound: asset('/monsters/crow-wizard/special-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 2,
    damageMultiplier: 0.5,
    specialAttack: true,
    damageType: 'fire',
  },
  {
    name: 'crowSpecial',
    glb: asset('/monsters/crow-wizard/special-attack.glb'),
    sound: asset('/monsters/crow-wizard/special-attack.mp3'),
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 2,
    specialAttackType: 'frontTwo',
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.35, durationSec: 10 }],
  },
  {
    name: 'crowCure',
    glb: asset('/monsters/crow-wizard/cure-spell.glb'),
    sound: asset('/monsters/crow-wizard/standard-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 0,  // never picked randomly — pre-rolled via JSON castChance
  },
  {
    name: 'crowFlamingFloor',
    glb: asset('/monsters/crow-wizard/flaming-floor.glb'),
    sound: asset('/monsters/crow-wizard/special-attack.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 0,  // never picked randomly — pre-rolled via JSON castChance
    // Marked as a "special" so the damage-timing branch routes through the
    // status-attack path; with damageMultiplier 0 and no onHitEffects the
    // body deals no harm — the actual mechanic (floor spawn) is handled by
    // the per-variant block in triggerMonsterAttack.
    specialAttack: true,
    damageMultiplier: 0,
  },
]);

// Summoned Crow — one basic attack, but it cycles through all four attack
// animations (see the rotation special-case in triggerMonsterAttack) purely
// for visual variety. All variants are identical plain melee hits.
_applyMultiAttacks('Summoned Crow', [
  {
    name: 'peck1',
    glb: asset('/monsters/summoned-crow/attack1.glb'),
    sound: asset('/monsters/summoned-crow/attack.mp3'),
    soundTimings: [0.3],
    damageTimings: [0.3],
    weight: 1,
  },
  {
    name: 'peck2',
    glb: asset('/monsters/summoned-crow/attack2.glb'),
    sound: asset('/monsters/summoned-crow/attack.mp3'),
    soundTimings: [0.3],
    damageTimings: [0.3],
    weight: 1,
  },
  {
    name: 'peck3',
    glb: asset('/monsters/summoned-crow/attack3.glb'),
    sound: asset('/monsters/summoned-crow/attack.mp3'),
    soundTimings: [0.3],
    damageTimings: [0.3],
    weight: 1,
  },
  {
    name: 'peck4',
    glb: asset('/monsters/summoned-crow/attack4.glb'),
    sound: asset('/monsters/summoned-crow/attack.mp3'),
    soundTimings: [0.3],
    damageTimings: [0.3],
    weight: 1,
  },
]);

_applyMultiAttacks('Demon Spawn', [
  {
    name: 'demonSpawnAttack',
    glb: asset('/monsters/demon-spawn/basic-attack.glb'),
    sound: asset('/monsters/demon-spawn/demon-spawn-attacl.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 4,
  },
  {
    name: 'demonSpawnJump',
    glb: asset('/monsters/demon-spawn/jump-attack.glb'),
    sound: asset('/monsters/demon-spawn/evil-laugh.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 2,
    damageMultiplier: 0.5,
    specialAttack: true,
  },
]);

_applyMultiAttacks('Iron Warden', [
  {
    name: 'wardenStrike',
    glb: asset('/monsters/iron-warden/standard-attack.glb'),
    sound: asset('/monsters/iron-warden/attack-sound.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 5,
  },
  {
    name: 'wardenBolt',
    glb: asset('/monsters/iron-warden/level1-spell.glb'),
    sound: asset('/monsters/iron-warden/attack-sound.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 2,
    specialAttack: true,
    specialAttackType: 'randomAny',
    damageType: 'lightning',
    damageMultiplier: 1.4,
  },
  {
    name: 'wardenShockwave',
    glb: asset('/monsters/iron-warden/level2-spell.glb'),
    sound: asset('/monsters/iron-warden/attack-sound.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 2,
    specialAttack: true,
    damageType: 'lightning',
    damageMultiplier: 0.8,
    specialOnHitEffects: [{ effectId: 'stun', chance: 0.15 }],
  },
  {
    name: 'lighteningFloor',
    glb: asset('/monsters/iron-warden/level2-spell.glb'),
    sound: asset('/monsters/iron-warden/attack-sound.mp3'),
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 0,  // never picked randomly — pre-rolled via JSON castChance
    specialAttack: true,
    damageMultiplier: 0,
  },
]);

_applyMultiAttacks('Swamp Monster', [
  {
    name: 'swampStrike',
    glb: asset('/monsters/swamp-monster/attack.glb'),
    sound: asset('/monsters/swamp-monster/attack.mp3'),
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 4,
  },
  {
    name: 'swampToxicBite',
    glb: asset('/monsters/swamp-monster/special-attack.glb'),
    sound: asset('/monsters/swamp-monster/special-attack.mp3'),
    soundTimings: [0.30],   // sound plays on launch
    damageTimings: [0.65],  // impact delayed — slime glob travelling
    weight: 1,
    damageMultiplier: 1.3,
    specialAttack: true,
    specialAttackType: 'randomAny',   // targets one random party member
    specialOnHitEffects: [
      { effectId: 'slow',   chance: 0.75, durationSec: 10 },
      { effectId: 'poison', chance: 0.55, durationSec: 12 },
      { effectId: 'rot',    chance: 0.55 },
    ],
  },
]);

function _pickWeightedVariant(variants) {
  const loaded = variants.filter(v => v != null);
  if (loaded.length === 0) return null;
  const totalWeight = loaded.reduce((sum, v) => sum + v.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const v of loaded) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return loaded[loaded.length - 1];
}

// Cycles a holder through its attack variants one at a time (rather than a
// weighted random roll), so every animation is shown in turn. `seed` staggers
// the starting index per holder — this is what keeps the members of a quartet
// from all swinging the same animation in lock-step. Skips empty slots since
// variants load asynchronously into a sparse array.
function _nextRotatingVariant(holder, variants, seed = 0) {
  if (!variants || variants.length === 0) return null;
  if (holder._lastAttackIdx === undefined) holder._lastAttackIdx = seed - 1;
  for (let tries = 0; tries < variants.length; tries++) {
    holder._lastAttackIdx = (holder._lastAttackIdx + 1) % variants.length;
    if (variants[holder._lastAttackIdx]) return variants[holder._lastAttackIdx];
  }
  return null;
}

let _nextSummonId = 800;

/**
 * Finds the nearest passable cell to (baseRow+dr, baseCol+dc), trying the
 * preferred offset first then falling back to adjacent cells.
 * Returns { row, col } or null if nothing valid is found.
 */
function _findTreekinSpawnCell(baseRow, baseCol, dr, dc) {
  const candidates = [
    [dr, dc],
    [-dr, dc],
    [dr, -dc],
    [0, -1], [0, 1],
    [-1, 0], [1, 0],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  for (const [r, c] of candidates) {
    if (r === 0 && c === 0) continue;
    const row = baseRow + r;
    const col = baseCol + c;
    if (isPassable(row, col) && !_isCellReserved(row, col, -1)) return { row, col };
  }
  return null;
}

/**
 * Dynamically spawns a treekin next to the given monster during combat.
 * Used by the Treeman's "Awakening of the Woods" ability.
 */
function _spawnTreekin(parentMonster, scene, offsetRow, offsetCol) {
  const pos = _findTreekinSpawnCell(parentMonster.gridRow, parentMonster.gridCol, offsetRow, offsetCol);
  if (!pos) return; // no valid cell nearby — skip this treekin
  const { row, col } = pos;
  const id = _nextSummonId++;

  const m = inst(D.treekin, id, row, col, // row/col already validated passable
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    asset('/monsters/treekin-animation/treeKin-attack.mp3'), 0.45, 0, 0,
    parentMonster.level ?? 2, null,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'));

  m.engaged = true;   // immediately hostile
  m.noDrops = true;   // summoned mid-fight — never drops anything
  m.summoned = true;  // skip in respawn logic — summons don't come back
  monsters.push(m);
  _loadMonster(m, scene);

  // Apply treekin attack variants to the summoned monster
  _applyMultiAttacks('TreeKin', [
    {
      name: 'swing',
      glb: asset('/monsters/treekin-animation/attack.glb'),
      sound: asset('/monsters/treekin-animation/wood-hit.mp3'),
      soundTimings: [0.4],
      damageTimings: [0.4],
      weight: 7,
    },
    {
      name: 'natureCast',
      glb: asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
      sound: asset('/monsters/treekin-animation/treeKin-attack.mp3'),
      soundTimings: [0.5],
      damageTimings: [0.5],
      weight: 3,
      specialAttack: true,
      specialOnHitEffects: [{ effectId: 'slow', chance: 0.30 }],
    },
  ]);
}

/**
 * Triggers the Treeman's "Awakening of the Woods" — forces the cast animation,
 * spawns 2 treekin, and plays the green magic effect.  Called once when HP
 * drops below 50%.
 */
function _triggerTreemanAwakening(treeman, scene) {
  if (treeman._awakeningUsed) return;

  // Find the awakening variant — it's loaded asynchronously, so retry if not ready yet
  const variant = treeman.attackVariants?.find(v => v && v.name === 'treemanAwakening');
  if (!variant || !variant.action) {
    treeman._awakeningRetries = (treeman._awakeningRetries ?? 0) + 1;
    if (treeman._awakeningRetries <= 10) {
      setTimeout(() => _triggerTreemanAwakening(treeman, scene), 300);
    } else {
      // Animation never loaded — mark as used and spawn treekins anyway so the
      // mechanic still fires even without the cast animation.
      treeman._awakeningUsed = true;
      showMessage(`<b>${treeman.name}</b> channels the Awakening of the Woods!`, 3000);
      if (treeman.mesh) createTreemanAwakening(treeman.mesh.position);
      _spawnTreekin(treeman, scene, -1, 0);
      _spawnTreekin(treeman, scene, 1, 0);
    }
    return;
  }

  treeman._awakeningUsed = true;

  // Force-play the cast animation
  const attackAction = variant.action;
  attackAction.reset();
  attackAction.setEffectiveTimeScale(1);
  attackAction.setEffectiveWeight(1);
  attackAction.play();
  const fromAction = (treeman.actions.walk && treeman._animState === 'walk')
    ? treeman.actions.walk : treeman.actions.idle;
  if (fromAction) fromAction.crossFadeTo(attackAction, 0.2, true);

  showMessage(`<b>${treeman.name}</b> channels the Awakening of the Woods!`, 3000);

  // Schedule particle effect + treekin spawning at the damage timing point.
  // Treekins always spawn once the cast is in motion — even if the Treeman
  // is killed mid-animation, the summon was already initiated.
  const duration = attackAction.getClip().duration;
  const pts = (variant.damageTimings && variant.damageTimings.length > 0) ? variant.damageTimings[0] : 0.5;
  setTimeout(() => {
    if (treeman.mesh) createTreemanAwakening(treeman.mesh.position);
    _spawnTreekin(treeman, scene, -1, 0);
    _spawnTreekin(treeman, scene, 1, 0);
  }, duration * pts * 1000);

  // Apply AoE damage at the timing point (same as other specials)
  setTimeout(() => {
    if (!treeman.alive) return;
    _applyMonsterSpecialAttack(treeman, variant);
  }, duration * pts * 1000);
}

/**
 * Triggers the Crow Wizard's "Restoration" — plays the cure animation,
 * spawns the healing particle effect, and restores `healAmount` HP
 * (clamped to hpMax). Called probabilistically from triggerMonsterAttack,
 * so multiple casts per fight are possible.
 *
 * `healAmount` is sourced from monsters.json (Crow Wizard's `crowCure`
 * specialAttack entry — `healAmount` field). Edit there to retune.
 */
function _triggerCrowWizardCure(crowWizard, healAmount) {
  const variant = crowWizard.attackVariants?.find(v => v && v.name === 'crowCure');
  if (!variant || !variant.action) {
    crowWizard._cureRetries = (crowWizard._cureRetries ?? 0) + 1;
    if (crowWizard._cureRetries <= 10) {
      setTimeout(() => _triggerCrowWizardCure(crowWizard, healAmount), 300);
    } else {
      // Animation never loaded — apply cure immediately so the mechanic still fires
      showMessage(`<b>${crowWizard.name}</b> channels a powerful Restoration!`, 3000);
      playSoundByUrl(asset('/sounds/actions/skills/cure.mp3'), 0.8);
      if (crowWizard.mesh) createCrowWizardCure(crowWizard.mesh.position);
      crowWizard.hp = Math.min(crowWizard.hpMax, crowWizard.hp + healAmount);
      if (crowWizard.hpBarFill) {
        crowWizard.hpBarFill.style.width = `${(crowWizard.hp / crowWizard.hpMax) * 100}%`;
      }
    }
    return;
  }

  const attackAction = variant.action;
  attackAction.reset();
  attackAction.setEffectiveTimeScale(1);
  attackAction.setEffectiveWeight(1);
  attackAction.play();
  const fromAction = (crowWizard.actions.walk && crowWizard._animState === 'walk')
    ? crowWizard.actions.walk : crowWizard.actions.idle;
  if (fromAction) fromAction.crossFadeTo(attackAction, 0.2, true);

  showMessage(`<b>${crowWizard.name}</b> channels a powerful Restoration!`, 3000);

  const duration = attackAction.getClip().duration;
  const pts = (variant.damageTimings && variant.damageTimings.length > 0) ? variant.damageTimings[0] : 0.5;
  setTimeout(() => {
    playSoundByUrl(asset('/sounds/actions/skills/cure.mp3'), 0.8);
    if (crowWizard.mesh) createCrowWizardCure(crowWizard.mesh.position);
    if (crowWizard.alive) {
      crowWizard.hp = Math.min(crowWizard.hpMax, crowWizard.hp + healAmount);
      if (crowWizard.hpBarFill) {
        crowWizard.hpBarFill.style.width = `${(crowWizard.hp / crowWizard.hpMax) * 100}%`;
      }
    }
  }, duration * pts * 1000);
}

/**
 * Spawn an element-floor tile in the grid cell directly in front of the
 * monster. "In front" is computed as the adjacent cell in the dominant axial
 * direction toward the player — diagonal positions break ties by row.
 *
 * The resulting tile reuses the existing element-floor mechanics (damage tick,
 * pass-through, visuals) from element-floors.json + map.js — no separate
 * damage path needed. Also records the cell in `_collections.spawnedFireFloors`
 * so it persists across level transitions and save/load.
 *
 * `elementName` is e.g. "fire" — looked up against ELEMENT_FLOORS.element.
 * Returns true if a tile was actually spawned.
 */
function _spawnFloorInFrontOf(monster, elementName) {
  if (!monster || !monster.alive) return false;
  const dRow = player.gridRow - monster.gridRow;
  const dCol = player.gridCol - monster.gridCol;
  let stepR = 0, stepC = 0;
  if (Math.abs(dRow) >= Math.abs(dCol)) {
    stepR = Math.sign(dRow);
    // Player on same row as wizard — fall back to columnar step
    if (stepR === 0) stepC = Math.sign(dCol);
  } else {
    stepC = Math.sign(dCol);
  }
  // Wizard and player on exact same cell shouldn't normally happen; bail.
  if (stepR === 0 && stepC === 0) return false;
  const targetRow = monster.gridRow + stepR;
  const targetCol = monster.gridCol + stepC;
  const cellId = elementFloorCellId(elementName);
  if (cellId == null) return false;
  if (!_sceneRef) return false;
  const ok = spawnElementFloorAt(_sceneRef, targetRow, targetCol, cellId);
  if (!ok) return false;
  const level = monster.level ?? 1;
  _collections.spawnedFireFloors.add(`${level}:${targetRow},${targetCol}`);
  return true;
}

/**
 * Records a lightning floor tile spawned by a scripted world event (e.g. the
 * Iron Warden gate activation) so it persists across level transitions and
 * save/load. Call after `spawnElementFloorAt` succeeds.
 */
export function recordLightningFloorSpawn(level, row, col) {
  _collections.spawnedLightningFloors.add(`${level}:${row},${col}`);
}


/** Triggers the mummies to start chasing the player immediately. */
export function triggerMummyAmbush() {
  const currentLevel = window.currentLevel ?? 0;
  monsters.forEach(m => {
    if (m.name === 'Mummy' && m.alive && (m.level ?? 1) === currentLevel) {
      m.engaged = true;
    }
  });
}

export function isMonsterAt(row, col) {
  const currentLevel = window.currentLevel ?? 0;
  return monsters.some(m => m.alive && (m.level ?? 1) === currentLevel && m.gridRow === row && m.gridCol === col);
}

/**
 * Returns true if any alive monster *other than* excludeId either occupies or
 * has already reserved (is moving toward) the given cell.  Used internally to
 * prevent two monsters from double-booking the same destination in the same
 * frame — isMonsterAt only checks committed gridRow/gridCol and misses monsters
 * that are mid-step.
 */
function _isCellReserved(row, col, excludeId) {
  const currentLevel = window.currentLevel ?? 0;
  return monsters.some(m => {
    if (!m.alive || m.id === excludeId) return false;
    if ((m.level ?? 1) !== currentLevel) return false;
    if (m.gridRow === row && m.gridCol === col) return true;
    if (m._cs?.moving && m._cs.targetRow === row && m._cs.targetCol === col) return true;
    if (m._ps?.moving && m._ps.targetRow === row && m._ps.targetCol === col) return true;
    return false;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

/** Rebuild the HTML content of a monster's Hunter's Eye stats panel. */
function _updateStatsPanel(m) {
  if (!m.statsPanel) return;
  const s = m.stats ?? {};

  const isSundered = skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id;
  const defVal = m.defence ?? '—';
  const resVal = s.resilience ?? '—';

  const sunderMag = skillsState.sunderArmor.magnitude;
  const displayDef = isSundered && defVal !== '—' ? `<span style="color:#ff8080">${Math.floor(defVal * sunderMag)}</span>` : defVal;
  const displayRes = isSundered && resVal !== '—' ? `<span style="color:#ff8080">${Math.floor(resVal * sunderMag)}</span>` : resVal;

  const isEntangled = skillsState.entangle?.active && skillsState.entangle?.targetId === m.id;
  const isStunned = m.stunUntil && performance.now() < m.stunUntil;

  // On-hit effects section — shows what debuffs this monster type can inflict
  let onHitHtml = '';
  if (m.onHitEffects?.length) {
    onHitHtml += `<div class="hep-divider"></div><div class="hep-section-label">On-Hit Effects</div><div class="hep-debuffs">`;
    m.onHitEffects.forEach(effect => {
      const def = STATUS_EFFECT_DEFS[effect.effectId];
      const name = def?.name ?? effect.effectId;
      const chance = Math.round(effect.chance * 100);
      const desc = def ? describeEffect(def) : '';
      const effectColor = def?.color ?? '#c0ff80';
      const descPart = desc ? ` <span class="hep-effect-desc">(${desc})</span>` : '';
      onHitHtml += `<div class="hep-debuff hep-on-hit" style="color:${effectColor}">`
        + `<span class="hep-effect-name">${name}</span>`
        + `<span class="hep-effect-chance">${chance}%</span>`
        + descPart
        + `</div>`;
    });
    onHitHtml += `</div>`;
  }

  // Active debuffs currently applied to this monster (skills + status effects)
  const nowMs = performance.now();
  const hasSkillDebuffs = isSundered || isEntangled || isStunned;
  const hasStatusDebuffs = m.activeDebuffs?.some(d => nowMs < d.expiresAt);
  let debuffsHtml = '';
  if (hasSkillDebuffs || hasStatusDebuffs) {
    debuffsHtml += `<div class="hep-divider"></div><div class="hep-section-label">Active Effects</div><div class="hep-debuffs">`;
    if (isSundered) {
      debuffsHtml += `<div class="hep-debuff" style="color:#ff8080">Sunder Armor (DEF/RES ½)</div>`;
    }
    if (isEntangled) {
      debuffsHtml += `<div class="hep-debuff" style="color:#80ff80">Entangle (Atk Spd ½)</div>`;
    }
    if (isStunned) {
      debuffsHtml += `<div class="hep-debuff" style="color:#ffd040">Stunned (Cannot Act)</div>`;
    }
    // Data-driven status effects from activeDebuffs
    (m.activeDebuffs ?? []).forEach(d => {
      if (nowMs >= d.expiresAt) return;
      const def = STATUS_EFFECT_DEFS[d.effectId];
      if (!def) return;
      const color = def.color ?? '#c0ff80';
      const desc = describeEffect(def);
      debuffsHtml += `<div class="hep-debuff" style="color:${color}">${def.name} (${desc})</div>`;
    });
    debuffsHtml += `</div>`;
  }

  m.statsPanel.innerHTML =
    `<div class="hep-name">${m.name}</div>` +
    `<div class="hep-row"><span class="hep-label">HP</span><span class="hep-val">${m.hp} / ${m.hpMax}</span></div>` +
    `<div class="hep-divider"></div>` +
    `<div class="hep-grid">` +
    `<span class="hep-stat">STR <b>${s.strength ?? '—'}</b></span>` +
    `<span class="hep-stat">DEX <b>${s.dexterity ?? '—'}</b></span>` +
    `<span class="hep-stat">VIT <b>${s.vitality ?? '—'}</b></span>` +
    `<span class="hep-stat">INT <b>${s.intelligence ?? '—'}</b></span>` +
    `<span class="hep-stat">RES <b>${displayRes}</b></span>` +
    `<span class="hep-stat">DEF <b>${displayDef}</b></span>` +
    `</div>` +
    onHitHtml +
    debuffsHtml;
}


// Loads slots 1–3 of a quartet as visual sub-meshes with their own action
// maps (idle + walk + death) so each mushroom can walk in formation and play
// its own death animation. Also attaches a per-sub HP bar.
//
// subSlot 0 lives on m.mesh and reuses m.mixer / m.actions (set up by
// _loadMonster); only slots 1–3 are spawned here.
function _spawnQuartetSubMeshes(m, scene, glbUrl, offsets) {
  m.subMeshes = [null, null, null];
  m.subMixers = [null, null, null];
  for (let i = 1; i < 4; i++) {
    const [ox, oz] = offsets[i];
    _gltfLoader.load(glbUrl, (gltf) => {
      if (!m.alive) return;
      if ((m.level ?? 1) !== (window.currentLevel ?? 0)) return;
      const sub = gltf.scene;
      sub.scale.setScalar(m.scale);
      const wx = m.gridCol * CELL + (m.offsetX ?? 0) + ox;
      const wz = m.gridRow * CELL + (m.offsetZ ?? 0) + oz;
      sub.position.set(wx, 0.0, wz);
      // Match the main mesh's idle yaw nudge (see _loadMonster). lookAtPlayer
      // overrides this once the party is in range.
      if (m.idleYaw) sub.rotation.y += m.idleYaw;
      sub.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.transparent = false;
            child.material.depthWrite = true;
          }
        }
      });
      const _blob = createBlobShadow(0.55);
      _blob.scale.setScalar(1 / (m.scale ?? 1));
      _blob.position.y = 0.05 / (m.scale ?? 1);
      sub.add(_blob);
      const mixer = new THREE.AnimationMixer(sub);
      const member = m.members?.[i];
      const memberActions = {};
      if (gltf.animations && gltf.animations.length > 0) {
        const idleAction = mixer.clipAction(gltf.animations[0]);
        idleAction.play();
        memberActions.idle = idleAction;
      }
      if (member) {
        member.mixer = mixer;
        member.actions = memberActions;
        member._animState = 'idle';
        member._activeIdle = memberActions.idle;
      }
      scene.add(sub);
      m.subMeshes[i - 1] = sub;
      m.subMixers[i - 1] = mixer;

      // Alternate idle — loaded onto this sub's mixer so each sub can swap
      // between the two idle animations on its own loop, independently of the
      // other members (mirrors the main mesh's idle variety).
      if (m.glbIdleAlt && member) {
        _gltfLoader.load(m.glbIdleAlt, (altGltf) => {
          if (altGltf.animations && altGltf.animations.length > 0) {
            memberActions.idleAlt = mixer.clipAction(altGltf.animations[0]);
          }
        });
        // When an idle clip finishes a loop, randomly cross-fade to the other
        // idle (only while genuinely idling — not mid-walk/attack/death).
        mixer.addEventListener('loop', (e) => {
          if (member._animState !== 'idle' || !memberActions.idleAlt) return;
          if (e.action !== memberActions.idle && e.action !== memberActions.idleAlt) return;
          const next = (Math.random() < 0.25) ? memberActions.idle : memberActions.idleAlt;
          if (next !== e.action) {
            next.reset().play();
            e.action.crossFadeTo(next, 0.4, true);
            member._activeIdle = next;
          }
        });
      }

      // Walk animation — loaded onto this sub's mixer so the mushroom plays
      // its walk cycle (not just glide) while the formation moves.
      if (m.glbWalk && member) {
        _gltfLoader.load(m.glbWalk, (walkGltf) => {
          if (walkGltf.animations && walkGltf.animations.length > 0) {
            memberActions.walk = mixer.clipAction(walkGltf.animations[0]);
          }
        });
      }

      // Death animation — clamps on the final frame so the sub stays as a
      // corpse in the formation tile.
      if (m.glbDeath && member) {
        _gltfLoader.load(m.glbDeath, (deathGltf) => {
          if (deathGltf.animations && deathGltf.animations.length > 0) {
            const deathAction = mixer.clipAction(deathGltf.animations[0]);
            deathAction.setLoop(THREE.LoopOnce, 1);
            deathAction.clampWhenFinished = true;
            memberActions.death = deathAction;
          }
        });
      }

      // Attack animations — so the right-column sub (or back-row substitutes)
      // actually swings when it fans out a hit instead of just silently
      // damaging the party. Every *basic* (non-special) attack variant is
      // loaded onto this sub's own mixer so it can rotate through them
      // independently of the other members (see _nextRotatingVariant). Special
      // / AoE casts are skipped — sub damage is driven by slot 0; the subs only
      // need their plain swing anims.
      const _subAttacks = (m.attacks && m.attacks.length > 0)
        ? m.attacks.filter(a => !a.specialAttack)
        : (m.glbAttack ? [{ glb: m.glbAttack, name: 'attack' }] : []);
      if (member && _subAttacks.length > 0) {
        member.attackVariants = [];
        // One finished listener crossfades back to idle for whichever variant
        // just played.
        mixer.addEventListener('finished', (e) => {
          const isAttack = member.attackVariants?.some(v => v && v.action === e.action);
          if (isAttack && memberActions.idle) {
            memberActions.idle.reset().play();
            e.action.crossFadeTo(memberActions.idle, 0.2, false);
            member._animState = 'idle';
            member._activeIdle = memberActions.idle;
          }
        });
        _subAttacks.forEach((atkDef, idx) => {
          _gltfLoader.load(atkDef.glb, (attackGltf) => {
            if (attackGltf.animations && attackGltf.animations.length > 0) {
              const attackAction = mixer.clipAction(attackGltf.animations[0]);
              attackAction.setLoop(THREE.LoopOnce, 1);
              attackAction.clampWhenFinished = false;
              member.attackVariants[idx] = { action: attackAction, name: atkDef.name };
              // Keep memberActions.attack pointing at a valid action so the
              // isRunning() walk/idle guards in updateMonsters stay correct.
              if (idx === 0) memberActions.attack = attackAction;
            }
          });
        });
      }

      // Per-sub HP bar (mirrors the main mesh's bar from _loadMonster).
      if (member) {
        const barWrap = document.createElement('div');
        barWrap.className = 'monster-hp-bar';
        const barFill = document.createElement('div');
        barFill.className = 'monster-hp-fill';
        barWrap.appendChild(barFill);
        const hpLabel = new CSS2DObject(barWrap);
        hpLabel.position.set(0, 1.8, 0);
        hpLabel.visible = false;
        sub.add(hpLabel);
        member.hpBarFill = barFill;
        member.hpLabel = hpLabel;
        // Sync initial fill (e.g. after save restore left this sub damaged).
        if (member.hp < member.hpMax) {
          barFill.style.width = `${Math.max(0, (member.hp / member.hpMax) * 100)}%`;
        }
        // If restored dead from save, snap to death pose immediately.
        if (!member.alive && memberActions.death) {
          memberActions.death.reset().play();
          memberActions.death.time = memberActions.death.getClip().duration;
          mixer.update(0);
        }
      }
    });
  }
}

// Plays the death animation on a single quartet sub. The mesh stays visible
// in its final clamped frame so the formation tile reads as "some mushrooms
// dead, some alive" instead of teleport-poof.
function _playQuartetSubDeath(m, member) {
  if (!member || !member.actions) return;
  // Stop idle/walk so the death anim takes over cleanly.
  if (member.actions.idle) member.actions.idle.stop();
  if (member.actions.walk) member.actions.walk.stop();
  if (member.actions.death) {
    member.actions.death.reset().play();
    member._animState = 'dead';
  } else {
    // No death anim available — fall back to hiding the mesh. Use the
    // formation visibility flag so the per-frame visibility loop respects it.
    member._hideMesh = true;
    member._animState = 'dead';
  }
}

function _disposeQuartetSubMeshes(m) {
  if (!m.subMeshes) return;
  for (const sub of m.subMeshes) {
    if (sub && sub.parent) sub.parent.remove(sub);
  }
  m.subMeshes = null;
  m.subMixers = null;
  // Drop per-sub HP bar DOM nodes (CSS2DObject DOM elements live outside the
  // THREE graph, so removing the mesh doesn't unmount them by itself).
  if (m.members) {
    for (const member of m.members) {
      if (member.hpBarFill) member.hpBarFill.parentElement?.remove();
      member.hpBarFill = null;
      member.hpLabel = null;
      member.mixer = null;
      member.actions = null;
      member._animState = null;
      member._offX = null;
      member._offZ = null;
      member._hideMesh = false;
      member._stepupHidden = false;
    }
  }
  m._formationX = null;
  m._formationZ = null;
}

function _loadMonster(m, scene) {
  // Load the idle/walking GLB as the base mesh (fall back to hit or attack GLB for mesh-only monsters like the dummy)
  const baseGlb = m.glbIdle || m.glbHit || m.glbAttack;
  if (!baseGlb) return;
  _gltfLoader.load(baseGlb, (gltf) => {
    // If monster was killed (e.g. save restore) before model finished loading, discard
    if (!m.alive) return;
    // Level changed before this async callback fired — don't add a stale mesh to the wrong scene
    if ((m.level ?? 1) !== (window.currentLevel ?? 0)) return;

    const model = gltf.scene;
    m.mesh = model;

    model.scale.setScalar(m.scale);

    // Formation monsters (e.g. quartet) occupy a single tile but the main mesh
    // sits in the front-left sub-slot rather than the tile centre. Sub-slot
    // offsets are applied in world units (CELL=2 → ±0.5 puts each sub in its
    // own quadrant). Sub-meshes for slots 1/2/3 are loaded below.
    const SUB_OFFSETS = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
    const isQuartet = m.formation === 'quartet';
    const [sx, sz] = isQuartet ? SUB_OFFSETS[0] : [0, 0];

    const wx = m.gridCol * CELL + (m.offsetX ?? 0) + sx;
    const wz = m.gridRow * CELL + (m.offsetZ ?? 0) + sz;
    model.position.set(wx, 0.0, wz);

    // Apply initial facing direction before combat (lookAtPlayer takes over once engaged)
    if (m.faceNorth) model.lookAt(wx, 0, wz - 10);
    else if (m.faceSouth) model.lookAt(wx, 0, wz + 10);
    else if (m.faceEast) model.lookAt(wx + 10, 0, wz);
    else if (m.faceWest) model.lookAt(wx - 10, 0, wz);
    // Extra idle yaw nudge (radians). lookAtPlayer overrides this once engaged,
    // so it only affects the pre-combat / idle facing.
    if (m.idleYaw) model.rotation.y += m.idleYaw;

    m.lookAtPlayer = (playerPos) => {
      model.lookAt(playerPos.x, model.position.y, playerPos.z);
      if (m.subMeshes) {
        for (const sub of m.subMeshes) {
          if (sub) sub.lookAt(playerPos.x, sub.position.y, playerPos.z);
        }
      }
    };

    if (isQuartet) _spawnQuartetSubMeshes(m, scene, baseGlb, SUB_OFFSETS);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Fix pixelation on monster textures
        if (child.material && child.material.map) {
          child.material.map.magFilter = THREE.LinearFilter;
          child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
          child.material.map.anisotropy = 16;
        }

        if (child.material) {
          child.material.transparent = false;
          child.material.depthWrite = true;
          if (child.material.metalness !== undefined) child.material.metalness = 0.0;
          if (child.material.roughness !== undefined) child.material.roughness = 1.0;

          if (m.name === 'Goblin' && child.material.color) {
            child.material.color.setHex(0x55aa55);
          }
        }
      }
    });

    const _blobS = m.scale ?? 1;
    const _blob = createBlobShadow(0.55);
    _blob.scale.setScalar(1 / _blobS);
    _blob.position.y = 0.05 / _blobS;
    model.add(_blob);
    m.blobShadow = _blob;

    m.mixer = new THREE.AnimationMixer(model);

    // For quartet formations, sub 0's animation state lives on members[0] and
    // shares the main mesh's mixer + actions. The per-sub anim transitions in
    // updateMonsters read member.actions, so the alias has to be in place
    // before any actions are added below.
    if (isQuartet && m.members?.[0]) {
      m.members[0].mixer = m.mixer;
      m.members[0].actions = m.actions;
      m.members[0]._animState = 'idle';
    }

    if (gltf.animations && gltf.animations.length > 0 && m.glbIdle) {
      const idleAction = m.mixer.clipAction(gltf.animations[0]);
      m.actions.idle = idleAction;
      m._activeIdle = idleAction;

      m.getIdleAction = function () {
        if (!m.actions.idleAlt) return m.actions.idle;
        if (m.name === 'Ogre') {
          m._lastIdleIdx = (m._lastIdleIdx === 1) ? 0 : 1;
          return (m._lastIdleIdx === 0) ? m.actions.idle : m.actions.idleAlt;
        }
        return (Math.random() < 0.25) ? m.actions.idle : m.actions.idleAlt;
      };

      // Agree Gesture animations run fast — halve the speed so they look natural
      // Training dummy doesn't loop its idle animation; it's triggered manually on hit
      if (m.name !== 'Training Dummy') {
        const initialIdle = m.getIdleAction();
        m._activeIdle = initialIdle;
        initialIdle.play();
        if (m.name === 'Minotaur' && initialIdle === m.actions.idle) {
          playSoundByUrl(asset('/monsters/minotaur/scream.mp3'), 0.8);
        }
      }

      m.mixer.addEventListener('loop', (e) => {
        if (m._animState !== 'walk' && (e.action === m.actions.idle || e.action === m.actions.idleAlt)) {
          if (m.actions.idleAlt) {
            const nextIdle = m.getIdleAction();
            if (e.action !== nextIdle) {
              nextIdle.reset().play();
              e.action.crossFadeTo(nextIdle, 0.4, true);
              m._activeIdle = nextIdle;
            }
            if (m.name === 'Minotaur' && nextIdle === m.actions.idle) {
              playSoundByUrl(asset('/monsters/minotaur/scream.mp3'), 0.8);
            }
          } else if (m.name === 'Minotaur' && e.action === m.actions.idle) {
            playSoundByUrl(asset('/monsters/minotaur/scream.mp3'), 0.8);
          }
        }
      });
    }

    if (m.glbIdleAlt) {
      _gltfLoader.load(m.glbIdleAlt, (altGltf) => {
        if (altGltf.animations && altGltf.animations.length > 0) {
          m.actions.idleAlt = m.mixer.clipAction(altGltf.animations[0]);
        }
      });
    }

    if (m.glbCombatIdle) {
      _gltfLoader.load(m.glbCombatIdle, (combatGltf) => {
        if (combatGltf.animations && combatGltf.animations.length > 0) {
          m.actions.combatIdle = m.mixer.clipAction(combatGltf.animations[0]);
          // Override getIdleAction: use combatIdle when in combat, normal idle otherwise
          m.getIdleAction = function () {
            if (isInCombat() && m.actions.combatIdle) return m.actions.combatIdle;
            if (!m.actions.idleAlt) return m.actions.idle;
            return (Math.random() < 0.25) ? m.actions.idle : m.actions.idleAlt;
          };
        }
      });
    }

    if (m.glbStandUp) {
      _gltfLoader.load(m.glbStandUp, (standGltf) => {
        if (standGltf.animations && standGltf.animations.length > 0) {
          m.actions.standUp = m.mixer.clipAction(standGltf.animations[0]);
        }
      });
    }

    scene.add(model);

    // ── HP bar label (CSS2DObject) ──────────────────────────────────────
    const barWrap = document.createElement('div');
    barWrap.className = 'monster-hp-bar';
    const barFill = document.createElement('div');
    barFill.className = 'monster-hp-fill';
    barWrap.appendChild(barFill);
    m.hpBarFill = barFill;

    const hpLabel = new CSS2DObject(barWrap);
    hpLabel.position.set(0, 1.8, 0);
    // Start hidden — `updateMonsters` sets visibility each frame based on
    // adjacency / fog culling. Without this, the bar would render at its
    // default `visible = true` for the first frame after spawn, briefly
    // showing through walls (most noticeable right after a save-load when
    // the player is dropped in deep on a populated level).
    hpLabel.visible = false;
    model.add(hpLabel);
    m.hpLabel = hpLabel;

    // For quartet formations, the main mesh's bar represents subSlot 0's HP
    // (not the aggregate sum). Bind it on members[0] so the per-sub update
    // path in hitMonster targets this same bar uniformly.
    if (isQuartet && m.members?.[0]) {
      m.members[0].hpBarFill = barFill;
      m.members[0].hpLabel = hpLabel;
    }

    // If HP was reduced before loading (e.g. save restore), sync the bar
    const initHp = (isQuartet && m.members?.[0]) ? m.members[0].hp : m.hp;
    const initHpMax = (isQuartet && m.members?.[0]) ? m.members[0].hpMax : m.hpMax;
    if (initHp < initHpMax) {
      barFill.style.width = `${Math.max(0, (initHp / initHpMax) * 100)}%`;
    }

    // ── Hunter's Eye stats panel (CSS2DObject) ─────────────────────────
    const statsDiv = document.createElement('div');
    statsDiv.className = 'monster-stats-panel';
    _updateStatsPanel({ ...m, statsPanel: statsDiv }); // seed initial HTML
    m.statsPanel = statsDiv;

    const statsLabel = new CSS2DObject(statsDiv);
    statsLabel.position.set(0, 2.6, 0); // above the HP bar
    statsLabel.visible = false;
    model.add(statsLabel);
    m.statsLabel = statsLabel;

    // ── Sleep indicator (three staggered Z-bubbles) ────────────────────
    const sleepDiv = document.createElement('div');
    sleepDiv.className = 'monster-sleep-indicator';
    ['z', 'Z', 'Z'].forEach((letter, i) => {
      const z = document.createElement('span');
      z.className = `sleep-z sleep-z--${i}`;
      z.textContent = letter;
      sleepDiv.appendChild(z);
    });

    const sleepLabel = new CSS2DObject(sleepDiv);
    sleepLabel.position.set(0, 2.2, 0); // centred above the HP bar
    sleepLabel.visible = false;
    model.add(sleepLabel);
    m.sleepLabel = sleepLabel;

    // ── Stun indicator (three orbiting stars) ─────────────────────────
    const stunDiv = document.createElement('div');
    stunDiv.className = 'monster-stun-indicator';
    ['★', '★', '★'].forEach((star, i) => {
      const s = document.createElement('span');
      s.className = `stun-star stun-star--${i}`;
      s.textContent = star;
      stunDiv.appendChild(s);
    });

    const stunLabel = new CSS2DObject(stunDiv);
    stunLabel.position.set(0, 2.2, 0);
    stunLabel.visible = false;
    model.add(stunLabel);
    m.stunLabel = stunLabel;

    // ── Entangle (slowed) indicator (turtle waddle) ───────────────────────
    const entangleDiv = document.createElement('div');
    entangleDiv.className = 'monster-entangle-indicator';
    const turtleSpan = document.createElement('span');
    turtleSpan.className = 'entangle-turtle';
    turtleSpan.textContent = '🐢';
    entangleDiv.appendChild(turtleSpan);
    const entangleLabel = new CSS2DObject(entangleDiv);
    entangleLabel.position.set(0, 2.2, 0);
    entangleLabel.visible = false;
    model.add(entangleLabel);
    m.entangleLabel = entangleLabel;

    // ── Trapped (floor-trap immobilize) indicator ─────────────────────────
    const trappedDiv = document.createElement('div');
    trappedDiv.className = 'monster-trapped-indicator';
    const trapSpan = document.createElement('span');
    trapSpan.className = 'trapped-glyph';
    trapSpan.textContent = '🪤';
    trappedDiv.appendChild(trapSpan);
    const trappedLabel = new CSS2DObject(trappedDiv);
    trappedLabel.position.set(0, 2.2, 0);
    trappedLabel.visible = false;
    model.add(trappedLabel);
    m.trappedLabel = trappedLabel;

    // ── Sunder Armor (broken defence) indicator (three falling arrows) ───
    const sunderDiv = document.createElement('div');
    sunderDiv.className = 'monster-sunder-indicator';
    ['↓', '↓', '↓'].forEach((arrow, i) => {
      const s = document.createElement('span');
      s.className = `sunder-arrow sunder-arrow--${i}`;
      s.textContent = arrow;
      sunderDiv.appendChild(s);
    });
    const sunderLabel = new CSS2DObject(sunderDiv);
    sunderLabel.position.set(0, 2.2, 0);
    sunderLabel.visible = false;
    model.add(sunderLabel);
    m.sunderLabel = sunderLabel;

    // ── Critical hit indicator (comic-book starburst with damage number) ──
    const critDiv = document.createElement('div');
    critDiv.className = 'monster-crit-indicator';
    const critSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    critSvg.setAttribute('class', 'crit-star');
    critSvg.setAttribute('viewBox', '-56 -56 112 112');
    const critPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    critPoly.setAttribute('class', 'crit-star-shape');
    critPoly.setAttribute('points', '0,-46 3.5,-17.6 14.5,-35.1 11.1,-16.6 35.4,-35.4 13.3,-8.9 29.6,-12.2 21.6,-4.3 44,0 17.6,3.5 44.4,18.4 16.6,11.1 25.5,25.5 8.9,13.3 16.1,38.8 3.9,19.6 0,50 -3.5,17.6 -13.0,31.4 -12.2,18.3 -32.5,32.5 -13.3,8.9 -37.0,15.3 -19.6,3.9 -52,0 -17.6,-3.5 -27.7,-11.5 -18.3,-12.2 -31.1,-31.1 -8.9,-13.3 -14.5,-35.1 -3.9,-19.6');
    const critText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    critText.setAttribute('class', 'crit-star-text');
    critText.setAttribute('x', '0');
    critText.setAttribute('y', '0');
    critText.setAttribute('text-anchor', 'middle');
    critText.setAttribute('dominant-baseline', 'central');
    critText.textContent = '0';
    critSvg.appendChild(critPoly);
    critSvg.appendChild(critText);
    critDiv.appendChild(critSvg);
    const critLabel = new CSS2DObject(critDiv);
    critLabel.position.set(0, 2.2, 0);
    critLabel.visible = false;
    model.add(critLabel);
    m.critLabel = critLabel;

    // Load attack animation(s)
    if (m.attacks && m.attacks.length > 0) {
      // ── Multiple attack variants ──
      m.attackVariants = [];
      m.attacks.forEach((atkDef, idx) => {
        _gltfLoader.load(atkDef.glb, (animGltf) => {
          if (animGltf.animations && animGltf.animations.length > 0) {
            const clip = animGltf.animations[0];
            const action = m.mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            const _jsonSpecial = m.specialAttacks?.find(s => s.name === atkDef.name);
            m.attackVariants[idx] = {
              action,
              name: atkDef.name,
              sound: atkDef.sound ?? m.attackSound,
              soundTimings: atkDef.soundTimings ?? [0],
              damageTimings: atkDef.damageTimings ?? [0.3],
              weight: atkDef.weight ?? 1,
              specialAttack: atkDef.specialAttack ?? false,
              specialOnHitEffects: atkDef.specialOnHitEffects ?? null,
              damageMultiplier: _jsonSpecial?.damageMultiplier ?? atkDef.damageMultiplier ?? null,
              specialAttackType: atkDef.specialAttackType ?? null,
              displayName: atkDef.displayName ?? null,
              // Elemental fields — read by _applyMonsterDamage to route the hit
              // through the player's elemental resistance and to add per-element
              // rider damage on top of the physical chunk. JSON wins over the
              // in-code variant, mirroring the damageMultiplier pattern above.
              damageType: _jsonSpecial?.damageType ?? atkDef.damageType ?? null,
              elementalDamage: _jsonSpecial?.elementalDamage ?? atkDef.elementalDamage ?? null,
            };
            // Keep m.actions.attack pointing to first variant for backward compat
            if (idx === 0) m.actions.attack = action;
          }
        });
      });
      // One finished listener for all attack variants
      m.mixer.addEventListener('finished', (e) => {
        const isAttackAction = m.attackVariants?.some(v => v && v.action === e.action);
        if (isAttackAction && m.actions.idle && m.name !== 'Training Dummy') {
          const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
          let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
          if (!toAction) {
            toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
            m._activeIdle = toAction;
            if (m.name === 'Minotaur' && toAction === m.actions.idle) {
              playSoundByUrl(asset('/monsters/minotaur/scream.mp3'), 0.8);
            }
          }
          toAction.reset().play();
          e.action.crossFadeTo(toAction, 0.25, false);
          m._animState = isMoving ? 'walk' : 'idle';
        }
      });
    } else {
      // ── Legacy single-attack path ──
      _gltfLoader.load(m.glbAttack, (animGltf) => {
        if (animGltf.animations && animGltf.animations.length > 0) {
          const attackClip = animGltf.animations[0];
          const attackAction = m.mixer.clipAction(attackClip);
          m.actions.attack = attackAction;

          attackAction.setLoop(THREE.LoopOnce, 1);
          attackAction.clampWhenFinished = true;

          // When attack finishes, fade back to idle or walk (except for training dummy)
          m.mixer.addEventListener('finished', (e) => {
            if (e.action === m.actions.attack && m.actions.idle && m.name !== 'Training Dummy') {
              const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
              let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
              if (!toAction) {
                toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
                m._activeIdle = toAction;
                if (m.name === 'Minotaur' && toAction === m.actions.idle) {
                  playSoundByUrl(asset('/monsters/minotaur/scream.mp3'), 0.8);
                }
              }
              toAction.reset().play();
              m.actions.attack.crossFadeTo(toAction, 0.25, false);
              m._animState = isMoving ? 'walk' : 'idle';
            }
          });
        }
      });
    }

    // Load the death animation GLB if provided
    if (m.glbDeath) {
      _gltfLoader.load(m.glbDeath, (deathGltf) => {
        if (deathGltf.animations && deathGltf.animations.length > 0) {
          const deathClip = deathGltf.animations[0];
          const deathAction = m.mixer.clipAction(deathClip);
          m.actions.death = deathAction;
          deathAction.setLoop(THREE.LoopOnce, 1);
          deathAction.clampWhenFinished = true;
        }
      });
    }

    // Load the hit animation GLB if provided
    if (m.glbHit) {
      _gltfLoader.load(m.glbHit, (hitGltf) => {
        if (hitGltf.animations && hitGltf.animations.length > 0) {
          const hitClip = hitGltf.animations[0];
          const hitAction = m.mixer.clipAction(hitClip);
          m.actions.hit = hitAction;
          hitAction.setLoop(THREE.LoopOnce, 1);
          hitAction.clampWhenFinished = true;

          // When hit animation finishes, fade back to idle or walk
          m.mixer.addEventListener('finished', (e) => {
            if (e.action === m.actions.hit && m.actions.idle) {
              const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
              let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
              if (!toAction) {
                toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
                m._activeIdle = toAction;
                if (m.name === 'Minotaur' && toAction === m.actions.idle) {
                  playSoundByUrl(asset('/monsters/minotaur/scream.mp3'), 0.8);
                }
              }
              toAction.reset().play();
              m.actions.hit.crossFadeTo(toAction, 0.2, false);
              m._animState = isMoving ? 'walk' : 'idle';
            }
          });
        }
      });
    }

    // Load the block animation GLB if provided
    if (m.glbBlock) {
      _gltfLoader.load(m.glbBlock, (blockGltf) => {
        if (blockGltf.animations && blockGltf.animations.length > 0) {
          const blockClip = blockGltf.animations[0];
          const blockAction = m.mixer.clipAction(blockClip);
          m.actions.block = blockAction;
          blockAction.setLoop(THREE.LoopOnce, 1);
          blockAction.clampWhenFinished = true;

          // When block finishes, fade back to idle or walk
          m.mixer.addEventListener('finished', (e) => {
            if (e.action === m.actions.block && m.actions.idle) {
              const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
              let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
              if (!toAction) {
                toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
                m._activeIdle = toAction;
              }
              toAction.reset().play();
              m.actions.block.crossFadeTo(toAction, 0.2, false);
              m._animState = isMoving ? 'walk' : 'idle';
            }
          });
        }
      });
    }

    // Load the walking animation GLB if provided
    if (m.glbWalk) {
      _gltfLoader.load(m.glbWalk, (walkGltf) => {
        if (walkGltf.animations && walkGltf.animations.length > 0) {
          const walkClip = walkGltf.animations[0];
          const walkAction = m.mixer.clipAction(walkClip);
          m.actions.walk = walkAction;
        }
      });
    }
  });
}

let _sceneRef = null;

export function initMonsters(scene) {
  _sceneRef = scene;
  const currentLevel = window.currentLevel ?? 0;
  monsters.forEach((m) => {
    if (!m.alive) return;
    if ((m.level ?? 1) !== currentLevel) return; // defer other levels
    _loadMonster(m, scene);
  });
}

export function loadMonstersForLevel(scene, level) {
  // Remove any meshes/HP bars left over from monsters on other levels. Without
  // this, transitioning from (e.g.) level 0 → level 2 leaves the level-0
  // Training Dummy mesh visible at its world position on the new map.
  monsters.forEach((m) => {
    if ((m.level ?? 1) === level) return;
    if (m.mesh) {
      if (m.mesh.parent) m.mesh.parent.remove(m.mesh);
      m.mesh = null;
    }
    if (m.subMeshes) _disposeQuartetSubMeshes(m);
    if (m.hpBarFill) {
      m.hpBarFill.parentElement?.remove();
      m.hpBarFill = null;
    }
    m.mixer = null;
    m.actions = {};
    m.blobShadow = null;
  });

  monsters.forEach((m) => {
    if ((m.level ?? 1) !== level) return;
    // Re-spawn corpse meshes for dead monsters that still hold loot. The
    // contents array is shared by reference, so any later loot/deposit edits
    // the same data the monster will be saved with.
    if (!m.alive && Array.isArray(m.corpseContents)) {
      spawnCorpse(m.gridCol, m.gridRow, [], m.corpseContents);
      return;
    }
    if (!m.alive || m.mesh) return; // skip dead or already loaded
    if (window.easyMode && !m._easyModeApplied) {
      m.hp = Math.ceil(m.hp * 0.5);
      m.hpMax = Math.ceil(m.hpMax * 0.5);
      if (Array.isArray(m.members)) {
        for (const s of m.members) {
          s.hp = Math.ceil(s.hp * 0.5);
          s.hpMax = Math.ceil(s.hpMax * 0.5);
        }
      }
      m._easyModeApplied = true;
    }
    _loadMonster(m, scene);
  });

  // Re-apply any persistent element-floor tiles that monsters spawned on
  // earlier visits to this level (Crow Wizard Flaming Floor etc). Runs after
  // `buildLevel`, so we add the visual tile and mutate dungeonMap directly;
  // `spawnElementFloorAt` is idempotent so duplicate calls (same-session
  // level revisits where dungeonMap already holds the mutation) are safe.
  const fireFloorCell = elementFloorCellId('fire');
  if (fireFloorCell != null) {
    for (const key of _collections.spawnedFireFloors) {
      const [lvlStr, coords] = key.split(':');
      if (Number(lvlStr) !== level) continue;
      const [rowStr, colStr] = (coords ?? '').split(',');
      const r = Number(rowStr), c = Number(colStr);
      if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
      spawnElementFloorAt(scene, r, c, fireFloorCell);
    }
  }

  const lightningFloorCell = elementFloorCellId('lightning');
  if (lightningFloorCell != null) {
    for (const key of _collections.spawnedLightningFloors) {
      const [lvlStr, coords] = key.split(':');
      if (Number(lvlStr) !== level) continue;
      const [rowStr, colStr] = (coords ?? '').split(',');
      const r = Number(rowStr), c = Number(colStr);
      if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
      spawnElementFloorAt(scene, r, c, lightningFloorCell);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PATROL  — random-wander AI for roaming monsters
// ─────────────────────────────────────────────────────────────────────────────

/** Shared directions array to avoid per-frame allocations during patrol AI */
const PATROL_DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

/**
 * Moves a patrolling monster toward a random target cell within its patrol
 * bounds.  Called every frame from updateMonsters when the player is out of
 * attack range.
 *
 * Patrol state is stored on the monster object as `m._ps`:
 *   { moving: bool, targetRow, targetCol, waitTimer }
 */
function _updatePatrol(m, dt) {
  if (!m.mesh || !m.patrol) return;

  // Lazy-initialise patrol state; stagger start times so multiple patrol
  // monsters don't all move in lock-step.
  if (!m._ps) {
    m._ps = {
      moving: false,
      targetRow: m.gridRow,
      targetCol: m.gridCol,
      waitTimer: Math.random() * 3.0,   // staggered first move
    };
  }

  const ps = m._ps;
  const b = m.patrol.bounds;
  const spd = (m.patrol.speed ?? 0.6) * CELL;  // world-units / second

  if (!ps.moving) {
    // ── waiting at current cell ──────────────────────────────────────────
    ps.waitTimer -= dt;
    if (ps.waitTimer > 0) return;

    // Pick one random adjacent cell (N / S / E / W) that lies inside the
    // patrol bounds.  Moving one cell at a time keeps gridRow/gridCol
    // anchored to real cell centres — the mid-move approximation that caused
    // the half-grid combat gap is avoided entirely.
    // Fisher-Yates shuffle for unbiased direction selection
    for (let i = PATROL_DIRECTIONS.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [PATROL_DIRECTIONS[i], PATROL_DIRECTIONS[j]] = [PATROL_DIRECTIONS[j], PATROL_DIRECTIONS[i]];
    }
    let chosen = false;
    for (const d of PATROL_DIRECTIONS) {
      const nr = m.gridRow + d.dr;
      const nc = m.gridCol + d.dc;
      if (
        nr >= b.minRow && nr <= b.maxRow &&
        nc >= b.minCol && nc <= b.maxCol &&
        isPassable(nr, nc) &&
        !isStatueAt(nr, nc) &&
        !_isCellReserved(nr, nc, m.id)
      ) {
        ps.targetRow = nr;
        ps.targetCol = nc;
        ps.moving = true;
        chosen = true;
        break;
      }
    }
    if (!chosen) ps.waitTimer = 1.0; // hemmed in — retry shortly
    return;
  }

  // ── moving toward the adjacent target cell ───────────────────────────────
  const targetX = ps.targetCol * CELL + (m.offsetX ?? 0);
  const targetZ = ps.targetRow * CELL + (m.offsetZ ?? 0);
  const cur = _moverPos(m);
  const dx = targetX - cur.x;
  const dz = targetZ - cur.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.05) {
    // Snap to exact cell centre and commit the new grid position.
    // gridRow/gridCol are ONLY updated here (on arrival), never mid-step,
    // so inRange checks always reference a true cell centre.
    _setMoverPos(m, targetX, targetZ);
    m.gridRow = ps.targetRow;
    m.gridCol = ps.targetCol;
    ps.moving = false;
    ps.waitTimer = (m.patrol.waitTime ?? 2.5) + Math.random() * 2.0;
    checkTrapForMonster(m, m.gridRow, m.gridCol);
  } else {
    const step = Math.min(spd * dt, dist);
    _addMoverPos(m, (dx / dist) * step, (dz / dist) * step);
    // Face the direction of travel (lookAt convention matches lookAtPlayer)
    _setMoverLookAt(m, targetX, targetZ);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHASE  — pursue the player once combat has been initiated
// ─────────────────────────────────────────────────────────────────────────────

const CHASE_SPEED = 0.9; // cells per second

/**
 * Moves an engaged monster one step toward the player's grid position.
 * Called every frame when the monster is engaged but out of melee range.
 */
function _updateChase(m, dt) {
  if (!m.mesh) return;

  if (!m._cs) {
    m._cs = { moving: false, targetRow: m.gridRow, targetCol: m.gridCol };
  }

  const cs = m._cs;
  const spd = CHASE_SPEED * CELL;

  if (!cs.moving) {
    const dr = player.gridRow - m.gridRow;
    const dc = player.gridCol - m.gridCol;

    // Already adjacent — nothing to do (inRange will take over)
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) return;

    // Try steps toward the player, prioritising the larger gap axis first
    const primary = Math.abs(dr) >= Math.abs(dc)
      ? [{ dr: Math.sign(dr), dc: 0 }, { dr: 0, dc: Math.sign(dc) }]
      : [{ dr: 0, dc: Math.sign(dc) }, { dr: Math.sign(dr), dc: 0 }];

    for (const d of primary) {
      if (d.dr === 0 && d.dc === 0) continue;
      const nr = m.gridRow + d.dr;
      const nc = m.gridCol + d.dc;
      if (isPassable(nr, nc) && !isStatueAt(nr, nc) && !_isCellReserved(nr, nc, m.id)) {
        cs.targetRow = nr;
        cs.targetCol = nc;
        cs.moving = true;
        break;
      }
    }
    return;
  }

  // Slide toward the target cell
  const targetX = cs.targetCol * CELL + (m.offsetX ?? 0);
  const targetZ = cs.targetRow * CELL + (m.offsetZ ?? 0);
  const cur = _moverPos(m);
  const dx = targetX - cur.x;
  const dz = targetZ - cur.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.05) {
    _setMoverPos(m, targetX, targetZ);
    m.gridRow = cs.targetRow;
    m.gridCol = cs.targetCol;
    cs.moving = false;
    checkTrapForMonster(m, m.gridRow, m.gridCol);
  } else {
    const step = Math.min(spd * dt, dist);
    _addMoverPos(m, (dx / dist) * step, (dz / dist) * step);
    _setMoverLookAt(m, targetX, targetZ);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION  (called every frame from main.js)
// ─────────────────────────────────────────────────────────────────────────────

const FOG_CULL_SQ = 14 * 14; // slightly beyond fog end (12 units)

function _hasLineOfSight(r1, c1, r2, c2) {
  const dr = r2 - r1;
  const dc = c2 - c1;
  const absR = Math.abs(dr);
  const absC = Math.abs(dc);
  // Same cell or orthogonally adjacent — no cell between them, always visible
  if (absR + absC <= 1) return true;
  // Diagonally adjacent (1,1) — blocked only if BOTH corner cells are walls
  if (absR === 1 && absC === 1) return isPassable(r1, c1 + dc) || isPassable(r1 + dr, c1);
  // Straight lines (distance 2)
  if (dr === 0) return isPassable(r1, c1 + Math.sign(dc));
  if (dc === 0) return isPassable(r1 + Math.sign(dr), c1);
  // Mixed / full diagonals at distance 2
  if (absR === 2 && absC === 2) return isPassable(r1 + Math.sign(dr), c1 + Math.sign(dc));
  if (absR === 2 && absC === 1) return isPassable(r1 + Math.sign(dr), c1) || isPassable(r1 + Math.sign(dr), c1 + Math.sign(dc));
  if (absR === 1 && absC === 2) return isPassable(r1, c1 + Math.sign(dc)) || isPassable(r1 + Math.sign(dr), c1 + Math.sign(dc));
  return true;
}

export function updateMonsters(dt, playerCamera, scene) {
  const currentLevel = window.currentLevel ?? 0;
  const playerPos = playerCamera ? playerCamera.position : null;
  monsters.forEach((m) => {
    if (currentLevel !== (m.level ?? 1)) {
      if (m.hpLabel) m.hpLabel.visible = false;
      if (m.statsLabel) m.statsLabel.visible = false;
      if (m.sleepLabel) m.sleepLabel.visible = false;
      if (m.stunLabel) m.stunLabel.visible = false;
      if (m.entangleLabel) m.entangleLabel.visible = false;
      if (m.sunderLabel) m.sunderLabel.visible = false;
      if (m.trappedLabel) m.trappedLabel.visible = false;
      if (_huntersEyeTargetId === m.id) { _hideHuntersEyePanel(); _huntersEyeTargetId = null; }
      if (m.mesh) m.mesh.visible = false;
      return;
    }

    // If dead and mesh is already gone, skip
    if (!m.alive && !m.mesh) return;

    // Formation sub-meshes (quartet slots 1–3): keep them in scene after the
    // parent dies so the death-pose mushrooms stay as corpses on the tile.
    // Final cleanup happens at level transition via loadMonstersForLevel.


    // Distance cull: skip full update for monsters beyond fog range
    if (m.mesh && playerPos && m.alive) {
      const dx = m.mesh.position.x - playerPos.x;
      const dz = m.mesh.position.z - playerPos.z;
      if (dx * dx + dz * dz > FOG_CULL_SQ) {
        if (m.mixer && m.mixer.timeScale !== 0) m.mixer.timeScale = 0;
        if (m.hpLabel) m.hpLabel.visible = false;
        if (m.members) for (const member of m.members) { if (member.hpLabel) member.hpLabel.visible = false; }
        if (m.statsLabel) m.statsLabel.visible = false;
        if (m.sleepLabel) m.sleepLabel.visible = false;
        if (m.stunLabel) m.stunLabel.visible = false;
        if (m.entangleLabel) m.entangleLabel.visible = false;
        if (m.sunderLabel) m.sunderLabel.visible = false;
        if (m.trappedLabel) m.trappedLabel.visible = false;
        if (_huntersEyeTargetId === m.id) { _hideHuntersEyePanel(); _huntersEyeTargetId = null; }
        m.mesh.visible = false;
        if (m.subMeshes) for (const sub of m.subMeshes) { if (sub) sub.visible = false; }
        return;
      }
      // Resume if returning into range
      if (m.mixer && m.mixer.timeScale === 0) m.mixer.timeScale = 1;
    }

    if (m.mesh) m.mesh.visible = true;

    // Formation: keep meshes oriented so the player sees subSlot 0 at their
    // front-left, etc. Dead subs stay visible in their clamped death pose
    // unless they've been "covered" by a back-row partner stepping up —
    // _repositionQuartetSubMeshes flags those as member._hideMesh.
    if (m.members) {
      if (player) _repositionQuartetSubMeshes(m, player.gridRow, player.gridCol, dt);
      for (let i = 0; i < 4; i++) {
        const sub = _quartetSubMesh(m, i);
        const member = m.members[i];
        if (sub) sub.visible = !(member._hideMesh || member._stepupHidden);
      }
    }

    if (m._frozen) {
      if (m.mixer) m.mixer.timeScale = 0;
      return;
    }

    // Update animation mixer (crucial for death animation)
    if (m.mixer) m.mixer.update(dt);
    if (m.subMixers) for (const sm of m.subMixers) { if (sm) sm.update(dt); }

    // If dead, we stop here (no attacks, no patrol, no labels)
    // Hunter's Eye panel stays visible for dead targets — shows defeated state.
    if (!m.alive) {
      if (m.hpLabel) m.hpLabel.visible = false;
      if (m.members) for (const member of m.members) { if (member.hpLabel) member.hpLabel.visible = false; }
      if (m.statsLabel) m.statsLabel.visible = false;
      if (m.sleepLabel) m.sleepLabel.visible = false;
      if (m.stunLabel) m.stunLabel.visible = false;
      if (m.entangleLabel) m.entangleLabel.visible = false;
      if (m.sunderLabel) m.sunderLabel.visible = false;
      if (m.trappedLabel) m.trappedLabel.visible = false;
      // Re-render once to show the defeated state (only first time after death)
      if (_huntersEyeTargetId === m.id && !m._huntersEyeDefeatedShown) {
        m._huntersEyeDefeatedShown = true;
        _renderHuntersEyeHud(m);
      }
      return;
    }

    // ── Ambient taunt sound ───────────────────────────────────────────────────
    if (m.tauntSound) {
      const now = performance.now();
      if (m._nextTauntAt == null) m._nextTauntAt = now + 8000 + Math.random() * 12000;
      if (now >= m._nextTauntAt) {
        const tDist = Math.max(Math.abs(m.gridRow - player.gridRow), Math.abs(m.gridCol - player.gridCol));
        if (tDist <= (m.tauntSoundRadius ?? 4)) playSoundByUrl(m.tauntSound, 0.6);
        m._nextTauntAt = now + 15000 + Math.random() * 20000;
      }
    }

    // ── Process active status effects (poison ticks, stat debuffs, etc.) ──
    let isAsleep = false;
    if (m.activeDebuffs?.length) {
      const now = performance.now();
      m.activeDebuffs = m.activeDebuffs.filter(d => now < d.expiresAt);
      let panelDirty = false;
      m.activeDebuffs.forEach(d => {
        if (d.effectId === 'sleep') isAsleep = true;
        const def = STATUS_EFFECT_DEFS[d.effectId];
        if (!def?.tickInterval) return;
        d.tickAccum += dt;
        if (d.tickAccum >= def.tickInterval) {
          d.tickAccum -= def.tickInterval;
          const baseDmg = def.tickDamage || 0;
          // Stance/debuff bonuses are additive and only amplify damage ticks (not heals).
          const dmg = baseDmg > 0 ? baseDmg + (d.tickDamageBonus ?? 0) : baseDmg;
          if (dmg > 0) hitMonster(m.id, dmg, d.effectId + '-dot', false, d.caster ?? null);
          if (dmg < 0) m.hp = Math.min(m.hpMax, m.hp - dmg); // heal
          panelDirty = true;
        }
      });
      if (panelDirty && _huntersEyeTargetId === m.id) _renderHuntersEyeHud(m);
    }

    if (m.sleepLabel) m.sleepLabel.visible = isAsleep;
    if (m.stunLabel) m.stunLabel.visible = !isAsleep && !!(m.stunUntil && performance.now() < m.stunUntil);
    if (m.entangleLabel) m.entangleLabel.visible = !!(skillsState.entangle?.active && skillsState.entangle?.targetId === m.id);
    if (m.sunderLabel) m.sunderLabel.visible = !!(skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id);
    if (m.trappedLabel) m.trappedLabel.visible = !isAsleep && !!(m.trappedUntil && performance.now() < m.trappedUntil);

    // Check if monster is suppressed by an action-preventing debuff (sleep, frozen, fear, etc.)
    // Expired debuffs have already been filtered above, so no extra time check needed here.
    // isAsleep is set above during the activeDebuffs loop.
    const isSuppressed = isAsleep || (m.activeDebuffs ?? []).some(d => STATUS_EFFECT_DEFS[d.effectId]?.preventsAction);

    // Proximity check — used for HP bar, Hunter's Eye, patrol, and attack logic
    const distRow = Math.abs(m.gridRow - player.gridRow);
    const distCol = Math.abs(m.gridCol - player.gridCol);
    let inRange = distRow <= 1 && distCol <= 1;

    // Monsters detect characters only within 1 grid square and when facing them.
    // Unseen cloaks the party — monsters cannot detect or engage them.
    const aggroRange = m.aggroRange ?? 2;
    if (!isSuppressed && !isPartyUnseen() && !m.engaged && (m.name !== 'Training Dummy' || m.combatMode) && distRow <= aggroRange && distCol <= aggroRange) {
      if (_hasLineOfSight(m.gridRow, m.gridCol, player.gridRow, player.gridCol)) {
        let seesPlayer = true;
        if (m.mesh && playerPos) {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(m.mesh.quaternion);
          forward.y = 0;
          forward.normalize();
          const toPlayer = new THREE.Vector3(playerPos.x - m.mesh.position.x, 0, playerPos.z - m.mesh.position.z).normalize();
          if (forward.dot(toPlayer) <= 0) seesPlayer = false; // Player must be in forward-facing hemisphere
        }
        if (seesPlayer) {
          m.engaged = true;
          if (m.name !== 'Training Dummy' || m.drainStamina) setInCombat();
        }
      }
    }

    // Unseen — disengage any monster that was already chasing; they lose track of the party
    if (isPartyUnseen() && m.engaged) {
      m.engaged = false;
    }

    // Prevent attacking through walls if monster is somehow in a wall or cornered
    if (inRange) {
      if (!isPassable(m.gridRow, m.gridCol) || !isPassable(player.gridRow, player.gridCol)) {
        inRange = false;
      } else if (distRow === 1 && distCol === 1) {
        if (!isPassable(player.gridRow, m.gridCol) && !isPassable(m.gridRow, player.gridCol)) {
          inRange = false;
        }
      }
    }

    // Non-patrol monsters face the player when engaged or in range;
    // patrol monsters only turn to face the player once they are adjacent.
    // Suppressed (sleeping) monsters don't track the player.
    if (!isSuppressed && m.mesh && playerCamera && m.lookAtPlayer && ((!m.patrol && m.engaged) || inRange)) {
      m.lookAtPlayer(playerCamera.position);
    }

    // HP bar is only visible when the party is engaged in melee range with
    // this monster — same adjacency check used for proximity attacks.
    if (m.hpLabel) m.hpLabel.visible = inRange;
    // Quartet sub-bars follow the same rule, but a dead sub keeps its bar
    // hidden (its mesh is hidden too, so the bar would just dangle).
    if (m.members) {
      for (const member of m.members) {
        if (member.hpLabel) member.hpLabel.visible = inRange && member.alive;
      }
    }

    // Auto-deactivate Hunter's Eye only for alive monsters that go out of range
    // Dead monsters keep their panel visible until a new fight or manual dismiss.
    if (_huntersEyeTargetId === m.id && !inRange && m.alive) {
      _huntersEyeTargetId = null;
      _hideHuntersEyePanel();
    }

    // Movement when player is out of attack range.
    // Suppressed (sleeping) monsters cannot chase or patrol.
    // Trapped monsters are immobilised until trappedUntil expires.
    const isTrapped = m.trappedUntil && performance.now() < m.trappedUntil;
    let isMoving = false;
    if (!inRange && !isSuppressed && !isTrapped) {
      if (m.engaged && m.name !== 'Training Dummy') {
        // Combat has started — chase the player
        _updateChase(m, dt);
        if (m._cs && m._cs.moving) isMoving = true;
      } else if (m.patrol) {
        // Not yet engaged — continue normal patrol
        _updatePatrol(m, dt);
        if (m._ps && m._ps.moving) isMoving = true;
      }
    }

    // Handle animation transitions between walk and idle
    if (m.actions.walk && m.actions.idle) {
      // Only switch if we are NOT playing a priority animation (attack, hit, death)
      const isAttacking = m.actions.attack && m.actions.attack.isRunning();
      const isHitting = m.actions.hit && m.actions.hit.isRunning();
      const isDead = m.actions.death && m.actions.death.isRunning();

      if (!isAttacking && !isHitting && !isDead) {
        if (isMoving) {
          if (m._animState !== 'walk') {
            m.actions.walk.reset().play();
            (m._activeIdle || m.actions.idle).crossFadeTo(m.actions.walk, 0.3, true);
            m._animState = 'walk';
          }
        } else {
          if (m._animState !== 'idle') {
            const nextIdle = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
            nextIdle.reset().play();
            m.actions.walk.crossFadeTo(nextIdle, 0.3, true);
            m._animState = 'idle';
            m._activeIdle = nextIdle;
            if (m.name === 'Minotaur' && nextIdle === m.actions.idle) {
              playSoundByUrl(asset('/monsters/minotaur/scream.mp3'), 0.8);
            }
          }
        }
      }
    }

    // Quartet sub-meshes (slots 1–3): mirror the main transition so each
    // mushroom walks/idles in lock-step with the formation. Sub 0 is already
    // handled above via the shared m.actions.
    if (m.members) {
      for (let i = 1; i < 4; i++) {
        const member = m.members[i];
        if (!member.alive || !member.actions || !member.actions.idle) continue;
        // Don't interrupt death or attack animations.
        if (member._animState === 'dead' || member._animState === 'attack') continue;
        const isSwinging = member.actions.attack && member.actions.attack.isRunning();
        if (isSwinging) continue;
        const hasWalk = !!member.actions.walk;
        if (isMoving && hasWalk) {
          if (member._animState !== 'walk') {
            member.actions.walk.reset().play();
            // Fade from whichever idle is currently active (base or alt).
            (member._activeIdle || member.actions.idle).crossFadeTo(member.actions.walk, 0.3, true);
            member._animState = 'walk';
          }
        } else if (member._animState === 'walk' && hasWalk) {
          member.actions.idle.reset().play();
          member.actions.walk.crossFadeTo(member.actions.idle, 0.3, true);
          member._animState = 'idle';
          member._activeIdle = member.actions.idle;
        }
      }
    }

    // Demon idle growl — plays when the party is within 1 grid square
    if (m.name === 'Demon' && m.alive && inRange && !m._demonSoundCooldown) {
      m._demonSoundCooldown = true;
      const audio = new Audio(asset('/monsters/demon/no-mercy.mp3'));
      audio.volume = 0.5;
      audio.play().catch(() => { });
      // Cooldown so it doesn't spam every frame — wait until the clip finishes + a pause
      setTimeout(() => { m._demonSoundCooldown = false; }, 8000);
    }

    // Proximity attack logic: if player is adjacent, attack them periodically.
    // Suppressed (sleeping) monsters cannot attack but still mark combat engaged.
    // Unseen cloaks the party — monsters cannot detect or engage even at proximity.
    if (inRange && !isPartyUnseen() && (m.name !== 'Training Dummy' || m.combatMode)) {
      m.engaged = true;
      if (m.name !== 'Training Dummy' || m.drainStamina) setInCombat();
      // New fight starting — clear Hunter's Eye panel if previous target is dead
      clearHuntersEyeIfDead();

      if (isSuppressed) {
        // Monster is asleep (or otherwise suppressed) — cannot attack
      } else if (m.stunUntil && performance.now() < m.stunUntil) {
        // Monster is stunned; cooldown timer doesn't tick down yet
      } else if (window._cutscenePlaying) {
        // Cutscene/transition in progress — hold attacks
      } else {
        m.attackCooldown = (m.attackCooldown || 0) - dt;
        if (m.attackCooldown <= 0) {
          triggerMonsterAttack(m.id);
          let nextAttack = (5.0 + (Math.random() * 2.0)) / (m.attackSpeed ?? 1); // Next attack in 5.0 - 7.0 seconds (scaled by attackSpeed)
          if (skillsState.entangle?.active && skillsState.entangle?.targetId === m.id && performance.now() < skillsState.entangle.expiresAt) {
            nextAttack *= skillsState.entangle.magnitude;
          }
          m.attackCooldown = nextAttack;
        }
      }
    } else {
      // Ready to attack immediately when player steps close
      m.attackCooldown = 0;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  ELEMENT-FLOOR DAMAGE TO MONSTERS
//  Living monsters standing on an elemental floor (ice, lava, etc.) take pure
//  elemental damage every tickInterval. Monster elemental resistance category
//  (immune/resist/normal/weak/vulnerable) gates the damage — an iceman on an
//  ice floor takes zero damage.
// ─────────────────────────────────────────────────────────────────────────────

const _monsterElementFloorAccum = {};

export function tickMonsterElementFloorDamage(dt) {
  const currentLevel = window.currentLevel ?? 0;
  for (const [id, def] of Object.entries(ELEMENT_FLOORS)) {
    const acc = (_monsterElementFloorAccum[id] ?? 0) + dt;
    if (acc < def.tickInterval) { _monsterElementFloorAccum[id] = acc; continue; }
    _monsterElementFloorAccum[id] = acc - def.tickInterval;
    monsters.forEach((m) => {
      if (!m.alive) return;
      if ((m.level ?? 1) !== currentLevel) return;
      const cell = dungeonMap[m.gridRow]?.[m.gridCol];
      if (cell !== def.cell) return;
      const mult = getMonsterElementMultiplier(m, def.element);
      if (mult <= 0) return;
      const dmg = Math.max(1, Math.round(def.dps * mult));
      hitMonster(m.id, dmg, `${def.element}-floor`);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER STATUS EFFECTS
//  Mirrors the party member activeDebuffs system so weapons, ammo, and spells
//  can apply any status effect defined in status-effects.json to monsters.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply (or refresh) a status effect on a monster.
 * effectId must match a key in STATUS_EFFECT_DEFS.
 */
/**
 * Apply (or refresh) a status effect on a monster.
 * effectId must match a key in STATUS_EFFECT_DEFS.
 * durationSec optionally overrides the duration defined in status-effects.json
 * (used by spells that store their own duration in spells.json).
 */
export function applyMonsterStatusEffect(monsterId, effectId, caster = null, durationSec = null, tickDamageBonus = 0) {
  const m = monsters.find(x => x.id === monsterId && x.alive);
  if (!m) return;
  const def = STATUS_EFFECT_DEFS[effectId];
  if (!def) return;

  const duration = durationSec ?? def.duration;

  if (!m.activeDebuffs) m.activeDebuffs = [];
  const existing = m.activeDebuffs.find(d => d.effectId === effectId);
  if (existing) {
    existing.expiresAt = performance.now() + duration * 1000;
    if (caster) existing.caster = caster; // refresh caster on re-apply
    // Re-apply keeps the strongest bonus so a later unbuffed reapply can't weaken an active stack.
    if (tickDamageBonus > (existing.tickDamageBonus ?? 0)) existing.tickDamageBonus = tickDamageBonus;
  } else {
    m.activeDebuffs.push({
      effectId,
      caster,
      expiresAt: performance.now() + duration * 1000,
      tickAccum: def.tickInterval ? def.tickInterval * 0.95 : 0, // fast first tick
      tickDamageBonus,
    });
  }
  if (_huntersEyeTargetId === m.id) _renderHuntersEyeHud(m);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DAMAGE
// ─────────────────────────────────────────────────────────────────────────────

export function showMonsterDamage(monsterId, damage, isCrit, attackType = '', subSlot = null) {
  const m = monsters.find(x => x.id === monsterId);
  if (!m) return;
  // For quartets, anchor the popup to the sub-mesh that actually got hit so it
  // floats over the right mushroom instead of the front-left slot every time.
  const anchor = (subSlot != null && m.formation === 'quartet')
    ? (_quartetSubMesh(m, subSlot) || m.mesh)
    : m.mesh;
  if (!anchor) return;

  // We use a wrapper div because CSS2DObject takes control of the element's transform.
  // If we animate 'transform' on the same element, they fight and the world-position
  // following breaks. By animating only the inner div, we keep the follow-logic.
  const wrapper = document.createElement('div');
  wrapper.className = 'monster-damage-wrapper';

  const inner = document.createElement('div');
  inner.className = 'monster-damage-popup' + (isCrit ? ' damage-popup--crit' : '');
  if (attackType.includes('poison')) inner.style.color = '#4dff91';

  let typedElem = null;
  if (typeof attackType === 'string') {
    if (attackType.endsWith('-floor')) typedElem = attackType.slice(0, -'-floor'.length);
    else if (attackType.endsWith('-trap')) typedElem = attackType.slice(0, -'-trap'.length);
  }
  const elemDef = typedElem ? ELEMENTS[typedElem] : null;
  if (elemDef) {
    inner.style.color = elemDef.color;
    if (elemDef.symbol) {
      const sym = document.createElement('span');
      sym.className = 'monster-damage-symbol';
      sym.textContent = elemDef.symbol;
      inner.appendChild(sym);
    }
  }

  const text = document.createElement('span');
  text.textContent = damage;
  inner.appendChild(text);
  wrapper.appendChild(inner);

  const label = new CSS2DObject(wrapper);
  // Place it near mid-body (HP bar is 1.8) so it can float up through the model
  label.position.set(0, 1.5, 0);
  anchor.add(label);

  setTimeout(() => {
    if (anchor.parent) anchor.remove(label);
  }, 850);
}

export function showCritIndicator(monsterId, damage) {
  const m = monsters.find(x => x.id === monsterId);
  if (!m || !m.critLabel) return;
  const el = m.critLabel.element;
  const svg = el.querySelector('.crit-star');
  const textEl = el.querySelector('.crit-star-text');
  if (textEl) textEl.textContent = damage ?? '';
  m.critLabel.visible = false;
  void el.offsetWidth;
  if (svg) {
    svg.style.animation = 'none';
    void svg.offsetWidth;
    svg.style.animation = '';
  }
  m.critLabel.visible = true;
  clearTimeout(m._critLabelTimer);
  m._critLabelTimer = setTimeout(() => {
    if (m.critLabel) m.critLabel.visible = false;
  }, 1400);
}

export function hitMonster(monsterId, finalDamage, attackType, isCrit = false, killer = null, elementalBreakdown = null, spellElement = null, subSlot = null, aoe = false) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0 };

  // AoE on a quartet splashes every alive sub with the same damage. We recurse
  // once per sub with aoe=false to land each hit through the normal pipeline
  // (damage popup, HP bar, per-sub death anim, drops). Caller gets back an
  // aggregate summary.
  if (aoe && m.formation === 'quartet' && Array.isArray(m.members) && subSlot == null) {
    const alive = m.members.filter(s => s.alive);
    if (alive.length === 0) return { hit: false, damage: 0, killed: false, monsterHp: m.hp };
    let totalDamage = 0;
    let monsterKilled = false;
    for (const sub of alive) {
      const r = hitMonster(monsterId, finalDamage, attackType, isCrit, killer, elementalBreakdown, spellElement, sub.subSlot, false);
      totalDamage += r.damage;
      if (r.killed) monsterKilled = true;
    }
    return { hit: true, damage: totalDamage, killed: monsterKilled, monsterHp: m.hp };
  }

  // Resolve the sub-member for quartet-style formations. If no explicit subSlot
  // was passed (e.g. DoTs, traps), pick the first alive sub so damage still
  // lands somewhere sensible.
  let member = null;
  if (m.formation === 'quartet' && Array.isArray(m.members)) {
    if (subSlot != null && m.members[subSlot]?.alive) {
      member = m.members[subSlot];
    } else {
      member = m.members.find(s => s.alive) || null;
    }
    if (!member) return { hit: false, damage: 0, killed: false, monsterHp: m.hp };
  }

  // Frozen monsters (statues) absorb hits without taking damage.
  // Play the iron-clang hit sound to give physical feedback, then bail.
  if (m._frozen) {
    setTimeout(() => { if (m.mesh) playHitSound(); }, 250);
    return { hit: false, damage: 0, killed: false, monsterHp: m.hp };
  }

  // Any hit — including ranged — triggers the monster to chase if it survives.
  // If this is the first hit on a fresh monster (not already engaged) and we're
  // not currently mid-combat, this marks the start of a new fight — reset stats.
  const wasEngaged = m.engaged;
  if (m.name !== 'Training Dummy' || m.combatMode) m.engaged = true;
  // Stats are now cumulative — no auto-reset on new fight.

  // ── Skeleton Shield Block ──────────────────────────────────────────────────
  if (m.name.includes('Skeleton') && !attackType.includes('poison') && attackType !== 'fireball' && attackType !== 'frostbolt' && attackType !== 'waterbolt' && attackType !== 'lightningbolt' && attackType !== 'holybolt' && attackType !== 'darkbolt' && attackType !== 'banishment' && attackType !== 'incinerate') {
    if (Math.random() <= 0.10) {
      addLogEntry({
        time: Date.now(), actor: 'player',
        attacker: killer || 'Player', target: m.name,
        attackType: attackType || 'attack', hitChance: 1, hit: true, crit: false,
        blocked: true,
      });

      // Sync visual/audio feedback with the action animation
      const delay = (attackType === 'poison-dot') ? 0 : 250;
      setTimeout(() => {
        if (!m.mesh) return;

        playShieldBlockSound();

        // UI Feedback for block
        const wrapper = document.createElement('div');
        wrapper.className = 'monster-damage-wrapper';
        const inner = document.createElement('div');
        inner.className = 'monster-damage-popup';
        inner.style.color = '#a0d8ff';
        inner.style.fontSize = '12px';
        inner.textContent = 'BLOCKED';
        wrapper.appendChild(inner);

        const label = new CSS2DObject(wrapper);
        label.position.set(0, 1.5, 0); // Above mid-body
        m.mesh.add(label);
        setTimeout(() => { if (m.mesh) m.mesh.remove(label); }, 850);

        _playBlockAnimation(m);
      }, delay);

      return { hit: false, damage: 0, killed: false, monsterHp: m.hp, blocked: true };
    }
  }

  const damage = Math.max(1, finalDamage);
  const hpBefore = m.hp;
  let subKilledByThisHit = false;
  if (member) {
    const memberHpBefore = member.hp;
    member.hp = Math.max(0, member.hp - damage);
    if (memberHpBefore > 0 && member.hp === 0) {
      member.alive = false;
      subKilledByThisHit = true;
    }
    // Aggregate parent HP = sum of surviving sub HPs.
    m.hp = m.members.reduce((sum, s) => sum + s.hp, 0);
  } else {
    m.hp = Math.max(0, m.hp - damage);
  }
  const hpAfter = m.hp;
  const killedByThisHit = (hpBefore > 0 && hpAfter === 0);

  // Any direct hit wakes a sleeping monster immediately
  if (attackType !== 'poison-dot' && m.activeDebuffs?.some(d => d.effectId === 'sleep')) {
    m.activeDebuffs = m.activeDebuffs.filter(d => d.effectId !== 'sleep');
    if (m.sleepLabel) m.sleepLabel.visible = false;
  }

  // Treeman "Awakening of the Woods" — triggers once when HP drops below 50%
  if (m.name === 'Treeman' && !m._awakeningUsed && m.alive
    && hpBefore > m.hpMax / 2 && hpAfter <= m.hpMax / 2 && _sceneRef) {
    _triggerTreemanAwakening(m, _sceneRef);
  }

  if (killedByThisHit) {
    m.alive = false;
    if (m.blobShadow) m.blobShadow.visible = false;
    if (_isBossMonster(m) && !window.arenaState.active) {
      _collections.killedBosses.add(_bossKey(m));
    }
    // In arena mode, fire the victory callback once all arena monsters are dead
    if (window.arenaState.active) {
      const arenaLevel = window.currentLevel;
      const stillAlive = monsters.filter(x => x.alive && (x.level ?? 1) === arenaLevel);
      if (stillAlive.length === 0) {
        setTimeout(() => window._arenaVictory?.(m.gridRow, m.gridCol), 1400);
      }
    }
  }

  // Track damage dealt for battle summary
  if (killer) {
    recordDamageDealt(killer, damage);
  }

  // Sync visual/audio feedback with the action animation
  const delay = (attackType === 'poison-dot') ? 0 : 250;

  setTimeout(() => {
    if (!m.mesh) return; // Safeguard if level changed or monster destroyed

    const _floorElem = typeof attackType === 'string' && attackType.endsWith('-floor')
      ? attackType.slice(0, -'-floor'.length)
      : null;
    const _floorElemDef = _floorElem ? ELEMENTS[_floorElem] : null;
    if (_floorElemDef?.sound) {
      playSoundByUrl(asset(_floorElemDef.sound), 0.7);
    } else if (!attackType.includes('poison')) {
      playHitSound();
    }

    if (isCrit) {
      playCritSound(attackType);
      showCritIndicator(monsterId, finalDamage);
    }

    showMonsterDamage(monsterId, damage, isCrit, attackType, member?.subSlot ?? null);

    // ── Sub-death ─────────────────────────────────────────────────────────
    // Each quartet sub awards XP and rolls drops independently so killing
    // each mushroom feels rewarding. Drops accumulate in m._accumulatedDrops
    // and the full corpse spawns on the final sub's death below.
    if (subKilledByThisHit) {
      _playQuartetSubDeath(m, member);
      if (!window.arenaState.active) {
        if (m.xp > 0) awardXP(m.xp);
        if (m.drops && m.drops.length > 0 && !m.noDrops) {
          m._accumulatedDrops = m._accumulatedDrops || [];
          for (const drop of m.drops) {
            if (Math.random() < drop.chance) {
              const itemName = typeof drop.item === 'string' ? drop.item : drop.item?.name;
              if (itemName && itemName.endsWith(' Essence') && itemName !== 'Life Essence') {
                if (_collections.droppedBossEssences.has(itemName)) continue;
                _collections.droppedBossEssences.add(itemName);
              }
              m._accumulatedDrops.push(drop.item);
            }
          }
        }
      }
    }

    // Update the HP bar above the monster's head. For quartets, each member
    // owns its own bar showing only its own HP; for solo monsters the existing
    // aggregate bar logic applies.
    if (member && member.hpBarFill) {
      const pct = member.hpMax > 0 ? (member.hp / member.hpMax) * 100 : 0;
      member.hpBarFill.style.width = `${pct}%`;
    } else if (!member && m.hpBarFill) {
      const pct = m.hpMax > 0 ? (hpAfter / m.hpMax) * 100 : 0;
      m.hpBarFill.style.width = `${pct}%`;
    }

    if (_huntersEyeTargetId === m.id) _renderHuntersEyeHud(m);

    if (m.name !== 'Training Dummy' || m.drainStamina) {
      setInCombat();
    }

    if (killedByThisHit) {
      if (!getInRangeMonster()) clearCombat();
      playActionSound('death');

      // ── Drop table roll ─────────────────────────────────────────────────────
      // Roll each entry in the monster's drops table independently.
      // Arena: only a 50% chance of boss essence, nothing else.
      // Quartets: drops were already rolled per-sub above; reuse the accumulator
      // so the corpse holds one item pile for all four mushrooms.
      const isQuartetDeath = m.formation === 'quartet' && Array.isArray(m.members);
      const droppedItems = isQuartetDeath ? (m._accumulatedDrops || []) : [];
      if (!isQuartetDeath && m.drops && m.drops.length > 0 && !m.noDrops) {
        if (window.arenaState.active) {
          // Drop gold scaled by arena tier (1-100 at tier 1, up to 1-100*tier)
          const arenaTier = window.arenaState.tier ?? 1;
          const gold = Math.floor(Math.random() * 100 * arenaTier) + arenaTier;
          droppedItems.push({ name: 'Gold Coins', quantity: gold });

          // Arena: 50% chance to drop boss essence in the bone pile
          for (const drop of m.drops) {
            const itemName = typeof drop.item === 'string' ? drop.item : drop.item?.name;
            if (itemName && itemName.endsWith(' Essence') && itemName !== 'Life Essence') {
              if (Math.random() < 0.5) {
                droppedItems.push(drop.item);
              }
              break;
            }
          }

          // Arena: unique item drops — either a single item (50%) or an array with per-item chances
          if (m.uniqueArenaItem) {
            if (Array.isArray(m.uniqueArenaItem)) {
              for (const entry of m.uniqueArenaItem) {
                if (Math.random() < entry.chance) droppedItems.push(entry.item);
              }
            } else if (Math.random() < 0.5) {
              droppedItems.push(m.uniqueArenaItem);
            }
          }
        } else {
          for (const drop of m.drops) {
            if (Math.random() < drop.chance) {
              // Boss essences only drop on first kill
              const itemName = typeof drop.item === 'string' ? drop.item : drop.item?.name;
              if (itemName && itemName.endsWith(' Essence') && itemName !== 'Life Essence') {
                if (_collections.droppedBossEssences.has(itemName)) continue;
                _collections.droppedBossEssences.add(itemName);
              }
              droppedItems.push(drop.item);
            }
          }
        }
      }

      if (m.name === 'Treeman') {
        setZoneMusic(asset('/sounds/backing/demon-room.mp3'));
      }

      if (m.name === 'Demon' && (m.level ?? 1) === 2) {
        setZoneMusic(asset('/sounds/backing/lvl2-post-demon.mp3'));
      }

      if (m.name === 'Minotaur' && (m.level ?? 1) === 3 && m.id === 300) {
        if (window.videoFlags && !window.videoFlags.hasSeenMinotaurDeathVideo) {
          window.videoFlags.hasSeenMinotaurDeathVideo = true;
          if (window.playMinotaurDeathVideo) window.playMinotaurDeathVideo();
        }
      }

      // Store the 25-slot corpse-contents array on the monster so the same
      // array survives level reloads (spawnCorpse on reload reuses it).
      m.corpseContents = spawnCorpse(m.gridCol, m.gridRow, droppedItems);
      if (m.hpBarFill) m.hpBarFill.parentElement.style.display = 'none';
      addLogEntry({ type: 'death', target: m.name, killer, damage, time: Date.now() });

      // Quartet: once the corpse / bone pile spawns, fade out the four
      // dead-pose mushroom meshes so the tile reads as a single loot pile
      // instead of being littered with mushroom bodies. The delay gives the
      // last sub's death animation time to play out first, then we both
      // flag-hide them (so the per-frame visibility loop keeps them hidden
      // through any race) and physically remove them from the scene.
      if (isQuartetDeath) {
        setTimeout(() => {
          if (Array.isArray(m.members)) {
            for (const member of m.members) member._hideMesh = true;
          }
          if (m.mesh) {
            if (m.mesh.parent) m.mesh.parent.remove(m.mesh);
            m.mesh = null;
          }
          if (m.subMeshes) _disposeQuartetSubMeshes(m);
        }, 1500);
      }

      // Show battle summary icon now that the fight is over
      showBattleStatsIcon(m.name);

      showInlineHelp('first-kill', {
        text: 'Well done on your first kill! Click the <strong>battle summary</strong> icon (top left) to monitor your party\'s performance. Press <strong>B</strong> to open the battle log for in-depth details.'
      });

      // ── Award XP to living party members (not in arena) ────────
      // For quartets the per-sub block above awarded XP per mushroom, so we
      // skip the aggregate award here.
      if (m.xp > 0 && !window.arenaState.active && !isQuartetDeath) awardXP(m.xp);

      // Quartet: each sub already played its own death anim via the per-sub
      // block above, so we skip the main death anim play here (it would just
      // re-trigger the already-clamped action on sub 0).
      if (!isQuartetDeath) _playDeathAnimation(m);
    } else {
      _playHitAnimation(m, attackType, killer, elementalBreakdown, spellElement);
    }
  }, delay);

  return { hit: true, damage, killed: killedByThisHit, monsterHp: m.hp };
}

export function attackMonster(monsterId, character, weaponDef, attackType, ammoDef = null, weaponIsHQ = false) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0, crit: false, hitChance: 0, formula: null, monsterName: '' };

  // Apply status effect stat modifiers to the attacker's stats for this attack
  const effChar = { ...character, stats: getEffectiveStats(character) };

  // Direct-damage spells contest INT vs INT; physical attacks contest DEX vs DEX.
  const isMagic = attackType === 'fireball' || attackType === 'frostbolt' || attackType === 'waterbolt' || attackType === 'lightningbolt' || attackType === 'holybolt' || attackType === 'darkbolt' || attackType === 'banishment' || attackType === 'incinerate';

  let hitChance = isMagic
    ? playerSpellHitChance(effChar, m, weaponDef)
    : playerHitChance(effChar, m, weaponDef);

  const now = performance.now();
  // True Shot: Never miss with ranged attacks
  const ts = skillsState.trueShot;
  const isRanged = attackType === 'shoot' || attackType === 'throw'; // assuming throw might also be ranged
  if (ts?.active && ts.actorName === character.name && isRanged && now < ts.expiresAt) {
    hitChance = 1.0;
  }

  if (Math.random() >= hitChance) {
    recordAttack(character.name, false);
    // Runic Scholar is consumed on any spell attempt, hit or miss
    if (isMagic && character.runicScholarActive) {
      character.runicScholarActive = false;
      refreshPartyCards();
    }
    return { hit: false, damage: 0, killed: false, monsterHp: m.hp, crit: false, hitChance, formula: null, monsterName: m.name };
  }

  // Apply Sunder Armor penalty
  const isSundered = skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id && now < skillsState.sunderArmor.expiresAt;
  const sunderMag = skillsState.sunderArmor.magnitude;
  const effectiveDefence = isSundered ? Math.floor((m.defence ?? 0) * sunderMag) : (m.defence ?? 0);
  const effectiveResilience = isSundered ? Math.floor((m.stats?.resilience ?? 0) * sunderMag) : (m.stats?.resilience ?? 0);

  const mSunder = {
    ...m,
    defence: effectiveDefence,
    stats: { ...m.stats, resilience: effectiveResilience }
  };

  const preCritDamage = isMagic
    ? calcPlayerMagicDamage(effChar, weaponDef, mSunder, weaponIsHQ)
    : calcPlayerPhysicalDamage(effChar, weaponDef, mSunder, ammoDef, weaponIsHQ);

  // 5% base crit chance — triples the calculated damage. DEX over 10 chips in a
  // small additional bonus (capped). Spells additionally pick up any passive
  // spell-crit bonus (e.g. Arcane Focus).
  function getTotalCritChance(char, isSpell) {
    const spellCrit = isSpell ? getSpellCritChanceBonus(char) : 0;
    const dexCrit = getDexCritChanceBonus(char);
    const stanceCrit = getCritChanceBonus(char);
    const equipCrit = char.skillBonuses?.['critChance'] ?? 0;
    const equipCritBonus = char.skillBonuses?.['critChanceBonus'] ?? 0;
    return CRIT_CHANCE + stanceCrit + dexCrit + spellCrit + equipCrit + equipCritBonus;
  }

  const isCrit = Math.random() < getTotalCritChance(character, isMagic);
  let damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  // Runic Scholar — doubles final spell damage after ALL other modifiers (including crit)
  const runicActive = isMagic && character.runicScholarActive;
  if (runicActive) {
    damage = damage * character.runicScholarMagnitude;
    character.runicScholarActive = false; // consume the buff
    refreshPartyCards();                  // remove the glow from the skill slot
  }

  // Berserk — applies a magnitude-based damage multiplier after everything else
  const berserkActive = skillsState.berserk?.active && skillsState.berserk?.actorName === character.name && now < skillsState.berserk.expiresAt;
  const stanceBerserkMult = getStanceBerserkMultiplier(character);
  const totalBerserkMult = (berserkActive ? skillsState.berserk.magnitude : 1.0) * stanceBerserkMult;
  
  if (totalBerserkMult !== 1.0) {
    damage = Math.round(damage * totalBerserkMult);
  }

  // Warcry — applies a damage multiplier to all party members
  if (skillsState.warcry?.active && now < skillsState.warcry.expiresAt) {
    damage = Math.round(damage * skillsState.warcry.magnitude);
  }

  // Compute the weighted stat bonus and label for the battle log (uses effective stats)
  let formulaStatBonus;
  let statLabel;
  if (isMagic) {
    formulaStatBonus = effChar.stats?.intelligence ?? 10;
    statLabel = 'INT';
  } else {
    const intW = weaponDef?.statWeights?.intelligence ?? 0.0;
    const vitW = weaponDef?.statWeights?.vitality ?? 0.0;
    const resW = weaponDef?.statWeights?.resilience ?? 0.0;
    const strW = weaponDef?.statWeights?.str ?? 1.0;
    const dexW = weaponDef?.statWeights?.dex ?? 0.0;
    formulaStatBonus = Math.floor(
      (effChar.stats?.strength ?? 10) * strW +
      (effChar.stats?.dexterity ?? 10) * dexW +
      (effChar.stats?.intelligence ?? 10) * intW +
      (effChar.stats?.vitality ?? 10) * vitW +
      (effChar.stats?.resilience ?? 10) * resW
    );
    const labels = [];
    if (strW > 0) labels.push('STR');
    if (dexW > 0) labels.push('DEX');
    if (intW > 0) labels.push('INT');
    if (vitW > 0) labels.push('VIT');
    if (resW > 0) labels.push('RES');
    statLabel = labels.join('+') || 'NONE';
  }

  // Elemental info for the battle log: physical attacks expose a per-element
  // rider breakdown (already accounts for monster weak/resist multipliers and
  // stance bonus); magic spells expose the spell's element.
  // Riders are folded into preCritDamage and crit along with the physical
  // portion, so on a crit the displayed per-element numbers must be scaled too
  // for the totals to add up.
  let elementalBreakdown = isMagic
    ? null
    : getElementalRiderBreakdown(effChar, mSunder, weaponDef, ammoDef).breakdown;
  if (isCrit && elementalBreakdown) {
    for (const k of Object.keys(elementalBreakdown)) {
      elementalBreakdown[k] = Math.round(elementalBreakdown[k] * CRIT_MULTIPLIER);
    }
  }
  const spellElement = isMagic ? (weaponDef?.element ?? null) : null;

  // Combust — flat fire elemental rider added on top of weapon fire damage when active
  if (!isMagic && skillsState.combust?.active && skillsState.combust?.actorName === character.name && now < skillsState.combust.expiresAt) {
    const fireMult = getMonsterElementMultiplier(mSunder, 'fire');
    if (fireMult > 0) {
      const fireRider = Math.round(10 * fireMult);
      if (fireRider > 0) {
        damage += fireRider;
        if (!elementalBreakdown) elementalBreakdown = {};
        elementalBreakdown.fire = (elementalBreakdown.fire ?? 0) + fireRider;
      }
    }
  }

  // Multiplicative stat-soak percentage shown in the formula:
  //   physical → VIT curve, magic → RES curve. K/(K+stat).
  const soakStat = isMagic
    ? (mSunder.stats?.resilience ?? 0)
    : (mSunder.stats?.vitality ?? 0);
  const statSoakPct = Math.round(100 * soakStat / (100 + soakStat));

  const formula = {
    weaponBase: weaponDef?.baseDamage ?? 0,
    statBonus: formulaStatBonus,
    statLabel,
    statSoakPct,
    statSoakLabel: isMagic ? 'res' : 'vit',
    defence: isMagic ? 0 : effectiveDefence,
    preCritDamage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
    runicScholar: runicActive,
    berserkMultiplier: totalBerserkMult,
    warcryMultiplier: (skillsState.warcry?.active && now < skillsState.warcry.expiresAt) ? skillsState.warcry.magnitude : 1.0,
    ammoModifier: ammoDef?.damageModifier ?? null,
    damageReduction: m.damageReduction ?? 0,
    elementalBreakdown,
    spellElement,
  };

  // Quartet targeting:
  //   * Magic spells splash the whole formation (aoe=true) — feels right when
  //     you fireball a clump of 4 mushrooms.
  //   * Physical attacks use the column rule: party left column (slots 0,2)
  //     hits monster left column (subs 0,2) — front first, then back partner,
  //     then cross-column fallback when the same column is wiped.
  let subSlot = null;
  let quartetAoe = false;
  if (m.formation === 'quartet') {
    if (isMagic) {
      quartetAoe = true;
    } else {
      const attackerIdx = party.indexOf(character);
      const attackerCol = attackerIdx >= 0 ? (attackerIdx % 2) : 0;
      const targetMember = _quartetPickTargetForAttackerCol(m, attackerCol);
      if (targetMember) subSlot = targetMember.subSlot;
    }
  }

  const result = hitMonster(monsterId, damage, attackType, isCrit, character.name, elementalBreakdown, spellElement, subSlot, quartetAoe);

  let stunned = false;
  if (attackType === 'shield-bash' && result.hit && !result.killed) {
    const shieldMasterLevels = (character.skills ?? []).filter(s => {
      const name = typeof s === 'string' ? s : s.name;
      return SKILLS_DATA[name]?.effectType === 'shieldMasterBonus';
    }).length;
    // Weapon-skill bashes (e.g. Warden's Shield "Holy Bash") can guarantee the stun.
    const stunChance = weaponDef?.guaranteedStun ? 1 : SHIELD_BASH_STUN_CHANCE + shieldMasterLevels * 0.01;
    if (Math.random() < stunChance) {
      stunned = true;
      m.stunUntil = performance.now() + SHIELD_BASH_STUN_DURATION_MS;
      if (_huntersEyeTargetId === m.id) _renderHuntersEyeHud(m);
      setTimeout(() => { if (_huntersEyeTargetId === m.id) _renderHuntersEyeHud(m); }, SHIELD_BASH_STUN_DURATION_MS);
    }
  }

  // Apply on-hit status effects from weapon and ammo (data-driven)
  const appliedEffects = [];
  if (result.hit && !result.killed) {
    const allOnHit = [
      ...(weaponDef?.onHitEffects ?? []),
      ...(ammoDef?.onHitEffects ?? []),
    ];
    allOnHit.forEach(effect => {
      if (Math.random() < calcOnHitChance(effect.chance, m.stats?.resilience ?? 0, null, effect.effectId)) {
        // Stance modifier: only poison-family ticks get the stance bonus,
        // and only when the attacker's stance actually applies to this weapon.
        const isPoisonTick = effect.effectId === 'poison' || effect.effectId === 'deadly_poison';
        const tickBonus = isPoisonTick ? getPoisonTickBonus(character, weaponDef) : 0;
        applyMonsterStatusEffect(monsterId, effect.effectId, character.name, null, tickBonus);
        if (effect.effectId !== 'lifesteal') {
          const def = STATUS_EFFECT_DEFS[effect.effectId];
          showMessage(`${m.name} is afflicted with <b>${def?.name ?? effect.effectId}</b>!`);
        }
        appliedEffects.push(effect.effectId);
      }
    });

    // Lifesteal on-hit effects
    const lifestealEffects = [
      ...(weaponDef?.onHitEffects ?? []),
      ...(ammoDef?.onHitEffects ?? []),
    ].filter(e => e.effectId === 'lifesteal');
    const stanceLifesteal = getStanceLifestealAmount(character);
    if (lifestealEffects.length > 0 || stanceLifesteal > 0) {
      const pIndex = party.findIndex(p => p.name === character.name);
      if (pIndex !== -1) {
        const p = party[pIndex];
        if (p && !p.isDead && p.hp < p.hpMax) {
          const heal = lifestealEffects.reduce((sum, e) => sum + (e.amount ?? 1), 0) + stanceLifesteal;
          setHp(pIndex, p.hp + heal);
          showMemberHeal(pIndex, heal);
        }
      }
    }
  }
  const poisoned = appliedEffects.includes('poison');

  recordAttack(character.name, true);
  return { ...result, crit: isCrit, hitChance, formula, monsterName: m.name, stunned, poisoned, sundered: isSundered, appliedEffects };
}

export function triggerMonsterAttack(monsterId) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m || (m.name === 'Training Dummy' && !m.combatMode)) return;

  // Unseen — monsters cannot attack the party while cloaked
  if (isPartyUnseen()) return;

  if (m.name !== 'Training Dummy' || m.drainStamina) setInCombat();

  // Self-heal spell — any monster whose JSON specialAttacks list contains an
  // entry with `selfHeal: true` rolls `castChance` per attack and, on success
  // (and only when wounded), casts the heal instead of attacking. Frequency
  // and HP restored are entirely tunable from monsters.json.
  const _healSpec = m.specialAttacks?.find(s => s && s.selfHeal);
  if (_healSpec && m.hp < m.hpMax && Math.random() < (_healSpec.castChance ?? 0)) {
    if (m.name === 'Crow Wizard') {
      _triggerCrowWizardCure(m, _healSpec.healAmount ?? 0);
      return;
    }
  }

  // Floor-spawn spells — any specialAttacks entry with `spawnsElementFloor`
  // pre-rolls `castChance`. On success we force that variant by name so it
  // runs through the normal attack/animation flow; the per-variant block
  // below performs the floor spawn at the damage timing. Cast chance is
  // tunable from monsters.json.
  let _forcedVariantName = null;
  for (const fs of (m.specialAttacks ?? [])) {
    if (!fs || !fs.spawnsElementFloor) continue;
    if (Math.random() < (fs.castChance ?? 0)) {
      _forcedVariantName = fs.name;
      break;
    }
  }

  // ── Pick attack variant (or fall back to single attack) ──
  let attackAction, soundTimings, damageTimings, attackSound, activeVariant;

  if (m.attackVariants && m.attackVariants.length > 0) {
    let variant;
    // A forced variant (from a pre-rolled spell like Flaming Floor) wins over
    // the weighted picker. If the named variant isn't loaded yet we fall back
    // to the normal pick so the monster still acts.
    if (_forcedVariantName) {
      variant = m.attackVariants.find(v => v && v.name === _forcedVariantName);
    }
    if (!variant) {
      if ((m.name === 'Ogre' || m.name === 'Summoned Crow') && m.attackVariants.length >= 2) {
        // Cycle through the animations in turn. For a quartet this is sub 0 of
        // the formation — seed 0 keeps it offset from the other front sub,
        // which seeds off its own subSlot (see the quartet block below).
        variant = _nextRotatingVariant(m, m.attackVariants, 0);
      } else {
        variant = _pickWeightedVariant(m.attackVariants);
      }
    }
    if (variant) {
      attackAction = variant.action;
      soundTimings = variant.soundTimings;
      damageTimings = variant.damageTimings;
      attackSound = variant.sound;
      activeVariant = variant;

      if (variant.name === 'iceCast' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createIceBurst(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> conjures a freezing blizzard!`, 2000);
      }
      if (variant.name === 'natureCast' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createNatureBurst(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a nature surge!`, 2000);
      }
      if (variant.name === 'doubleCombo' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.3;
        setTimeout(() => { if (m.alive) createOgreSlam(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a furious double strike!`, 2000);
      }
      if (variant.name === 'minotaurRage' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createMinotaurRage(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> roars with terrifying fury!`, 2000);
      }
      if (variant.name === 'demonCleave' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createDemonCleave(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a nightmarish cleave!`, 2000);
      }
      if (variant.name === 'tidalWave' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.6;
        setTimeout(() => { if (m.alive) createTidalWave(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a devastating Tidal Wave!`, 2000);
      }
      if (variant.name === 'venomSpit' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.45;
        setTimeout(() => { if (m.alive) createLizardVenomSpit(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> spews a torrent of corrosive venom!`, 2000);
      }
      if (variant.name === 'crocSpecial' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.45;
        setTimeout(() => { if (m.alive) createCrocodileSparkle(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a savage arcane strike!`, 2000);
      }
      if (variant.name === 'poisonCloud' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createPoisonCloud(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> releases a toxic poison cloud!`, 2000);
      }
      if (variant.name === 'swampToxicBite' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createPoisonCloud(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> hurls a glob of corrosive slime!`, 2000);
      }
      if (variant.name === 'iceCloud' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createIceCloud(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> releases a freezing ice cloud!`, 2000);
      }
      if (variant.name === 'hellSpawn' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createHellSpawn(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes the Hell Spawn!`, 2000);
      }
      if (variant.name === 'crowFireAoe' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createCrowWizardFireAoe(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes an Inferno Blast!`, 2000);
      }
      if (variant.name === 'crowSpecial' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.45;
        setTimeout(() => { if (m.alive) createCrowWizardFear(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> strikes with Shadow Talons!`, 2000);
      }
      if (variant.name === 'crowFlamingFloor' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        // Look up the JSON spec so the element to spawn is data-driven —
        // change `spawnsElementFloor` in monsters.json to retarget the spell.
        const spec = m.specialAttacks?.find(s => s && s.name === 'crowFlamingFloor');
        const elementName = spec?.spawnsElementFloor ?? 'fire';
        setTimeout(() => {
          if (!m.alive) return;
          // Tiny fire flourish at the wizard so the cast reads visually even
          // before the floor tile appears.
          createCrowWizardFireAoe(m.mesh.position);
          _spawnFloorInFrontOf(m, elementName);
        }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> conjures a Flaming Floor!`, 2000);
      }
      if (variant.name === 'lighteningFloor' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        const spec = m.specialAttacks?.find(s => s && s.name === 'lighteningFloor');
        const elementName = spec?.spawnsElementFloor ?? 'lightning';
        setTimeout(() => {
          if (!m.alive) return;
          createElementalBurst(m.mesh.position, ELEMENTS['lightning'].color);
          _spawnFloorInFrontOf(m, elementName);
        }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> conjures a Lightning Floor!`, 2000);
      }
      if (variant.name === 'wardenBolt' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createElementalBurst(m.mesh.position, ELEMENTS['lightning'].color); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> fires an Arc Bolt!`, 2000);
      }
      if (variant.name === 'wardenShockwave' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createElementalBurst(m.mesh.position, ELEMENTS['lightning'].color); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes an Iron Shockwave!`, 2000);
      }
    }
  }
  // Legacy fallback
  if (!attackAction) {
    attackAction = m.actions.attack;
    soundTimings = null;
    damageTimings = null;
    attackSound = m.attackSound;

  }

  if (attackAction) {
    attackAction.reset();
    attackAction.setEffectiveTimeScale(1);
    attackAction.setEffectiveWeight(1);
    attackAction.play();
    const fromAction = (m.actions.walk && m._animState === 'walk') ? m.actions.walk : (m._activeIdle || m.actions.idle);
    if (fromAction) fromAction.crossFadeTo(attackAction, 0.2, true);

    // Quartet: the main mesh (sub 0) plays attackAction above. The other
    // active front sub also swings — trigger its attack anim on its own mixer
    // so both mushrooms in the front row visibly attack at the same time.
    if (m.formation === 'quartet' && m.members) {
      const [mfl, mfr] = _quartetActiveFront(m);
      for (const swinger of [mfl, mfr]) {
        if (!swinger || swinger.subSlot === 0) continue; // sub 0 already handled
        // Pick this sub's own attack variant, seeded by its subSlot so it
        // stays out of lock-step with the other front sub and with slot 0.
        const subVariant = _nextRotatingVariant(swinger, swinger.attackVariants, swinger.subSlot);
        const act = subVariant?.action || swinger.actions?.attack;
        if (!act) continue;
        swinger.actions.attack = act; // keep isRunning() walk/idle guards valid
        act.reset();
        act.setEffectiveTimeScale(1);
        act.setEffectiveWeight(1);
        act.play();
        const subFrom = (swinger._animState === 'walk' && swinger.actions.walk)
          ? swinger.actions.walk : swinger.actions.idle;
        if (subFrom) subFrom.crossFadeTo(act, 0.2, true);
        swinger._animState = 'attack';
      }
    }

    // ── Sound scheduling ──
    if (attackSound) {
      const _playAttackSound = () => {
        const audio = new Audio(attackSound);
        audio.volume = 0.8;
        audio.play().catch(e => console.warn('Audio play prevented:', e));
      };
      if (soundTimings && soundTimings.length > 0) {
        const clipDuration = attackAction.getClip().duration;
        soundTimings.forEach(t => {
          setTimeout(_playAttackSound, clipDuration * t * 1000);
        });
      } else {
        _playAttackSound();
      }
    }

    // ── Damage scheduling ──
    if (damageTimings && damageTimings.length > 0) {
      const clipDuration = attackAction.getClip().duration;
      damageTimings.forEach(t => {
        setTimeout(() => {
          if (activeVariant?.specialAttack) {
            _applyMonsterSpecialAttack(m, activeVariant);
          } else {
            _applyMonsterDamage(m);
          }
        }, clipDuration * t * 1000);
      });
    } else {
      setTimeout(() => { _applyMonsterDamage(m); }, 300);
    }
  } else {
    // No animation — still apply damage
    setTimeout(() => { _applyMonsterDamage(m); }, 300);
  }
}

// Applies a monster's special attack.
// Default (AoE): hits all alive party members simultaneously.
// 'randomAny': picks one random alive member (ignoring formation).
// Uses variant.specialOnHitEffects to override the normal onHitEffects for the hit.
function _applyMonsterSpecialAttack(monster, variant) {
  const aliveMembers = party.filter(m => m && !m.isEmpty && !m.isDead);
  if (aliveMembers.length === 0) return;

  const effectsOverride = variant.specialOnHitEffects ?? null;

  // Pure-status attacks (damageMultiplier === 0) bypass hit/miss and deal no damage.
  // Each alive member rolls the effect chance independently.
  if (variant.damageMultiplier === 0) {
    aliveMembers.forEach(target => {
      (effectsOverride ?? []).forEach(effect => {
        const effectiveChance = calcOnHitChance(
          effect.chance,
          target.stats?.resilience ?? 0,
          getEffectiveStatusResistances(target),
          effect.effectId,
        );
        if (Math.random() < effectiveChance) {
          applyStatusEffect(target.id, effect.effectId, null, effect.durationSec);
          const def = STATUS_EFFECT_DEFS[effect.effectId];
          showMessage(`<b>${target.name}</b> is afflicted with <b>${def?.name ?? effect.effectId}</b>!`, 2500);
          addLogEntry({
            time: Date.now(),
            type: 'status-effect',
            actor: 'monster',
            attacker: monster.name,
            target: target.name,
            effectId: effect.effectId,
            effectName: def?.name ?? effect.effectId,
            effectColor: def?.color ?? null,
          });
        }
      });
    });
    return;
  }

  const specialName = variant.displayName ?? variant.name ?? null;

  if (variant.specialAttackType === 'randomAny') {
    // Pick one random alive party member (ignoring formation rules)
    const target = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
    _applyMonsterDamage(monster, {
      forceTarget: target,
      onHitEffectsOverride: effectsOverride,
      damageMultiplier: variant.damageMultiplier ?? 1,
      specialName,
      isAoe: false,
      damageType: variant.damageType ?? null,
      elementalDamage: variant.elementalDamage ?? null,
    });
  } else if (variant.specialAttackType === 'frontTwo') {
    // Hit front-row members (party indices 0 and 1); fall back to all alive if both are down
    const frontTargets = party.filter((m, i) => m && !m.isEmpty && !m.isDead && i < 2);
    const pool = frontTargets.length > 0 ? frontTargets : aliveMembers;
    pool.forEach(target => {
      _applyMonsterDamage(monster, {
        forceTarget: target,
        onHitEffectsOverride: effectsOverride,
        damageMultiplier: variant.damageMultiplier ?? 1,
        specialName,
        isAoe: false,
        damageType: variant.damageType ?? null,
      elementalDamage: variant.elementalDamage ?? null,
      });
    });
  } else {
    // Default AoE: hit all alive members
    aliveMembers.forEach(target => {
      _applyMonsterDamage(monster, {
        forceTarget: target,
        onHitEffectsOverride: effectsOverride,
        damageMultiplier: variant.damageMultiplier ?? 1,
        specialName,
        isAoe: true,
        damageType: variant.damageType ?? null,
      elementalDamage: variant.elementalDamage ?? null,
      });
    });
  }
}

function _applyMonsterDamage(monster, opts = {}) {
  // opts.forceTarget — bypass directional targeting (used for special/AoE attacks)
  // opts.onHitEffectsOverride — replace monster.onHitEffects for this hit
  // opts.damageMultiplier — multiply base damage (e.g. 2 for ogre double combo)
  // opts.specialName — display name of the special attack (for battle log)
  // opts.isAoe — whether this hit is part of an AoE special attack
  // opts.damageType — element of this attack (e.g. "fire"). Falls back to monster.damageType for basic attacks. null/"physical" = no element.
  // opts.elementalDamage — additive elemental rider map for special attacks. Basic attacks fall back to monster.elementalDamage.
  const { forceTarget, onHitEffectsOverride, damageMultiplier, specialName, isAoe, damageType, elementalDamage, _quartetBasic } = opts;
  // `isSpecial` means the caller picked a target outside the directional logic,
  // i.e. an AoE/special-attack hit. Quartet basic-attack fan-out also passes
  // `forceTarget` but is *not* a special — _quartetBasic flags that path.
  const isSpecial = forceTarget !== undefined && !_quartetBasic;

  // Quartet basic attack: each alive monster front-line sub swings at its
  // matching party column. Both front-row subs hit in the same cycle (up to
  // 2 swings/round). Back-row subs step up when their front partner is dead.
  if (monster.formation === 'quartet' && monster.members && forceTarget === undefined) {
    const [mfl, mfr] = _quartetActiveFront(monster);
    const targets = [];
    if (mfl) {
      const pTarget = _partyColumnTarget(0);
      if (pTarget) targets.push(pTarget);
    }
    if (mfr) {
      const pTarget = _partyColumnTarget(1);
      if (pTarget) targets.push(pTarget);
    }
    for (const t of targets) {
      _applyMonsterDamage(monster, { ...opts, forceTarget: t, _quartetBasic: true });
    }
    return;
  }

  // Target whoever is on the face of the formation the monster is attacking from.
  // Falls back to any alive member if that face is completely wiped.
  const target = forceTarget ?? pickDirectionalTarget(party, monster, player.facing, player.gridRow, player.gridCol);
  if (!target) return;   // entire party wiped

  // Apply status effect stat modifiers to the target for this damage calculation
  const effTarget = { ...target, stats: getEffectiveStats(target) };

  // DEX-based hit chance — nimble characters are harder for slow monsters to land on
  const hitChance = monsterHitChance(monster, effTarget);
  if (Math.random() >= hitChance) {
    addLogEntry({
      time: Date.now(), actor: 'monster',
      attacker: monster.name, target: target.name,
      attackType: isSpecial ? 'special' : 'attack', hitChance, hit: false, crit: false,
      specialName: specialName ?? null,
      isAoe: isAoe ?? false,
    });
    return;
  }

  // Shield Block Check
  let blocked = false;
  const leftItem = target.equipment?.leftHand ? getItemDef(target.equipment.leftHand.name) : null;
  const rightItem = target.equipment?.rightHand ? getItemDef(target.equipment.rightHand.name) : null;

  const hasShield = leftItem?.weaponType === 'shield' || rightItem?.weaponType === 'shield';
  let shieldMasterBlockBonus = 0;
  if (hasShield && target.skills) {
    target.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && skillDef.effectType === 'shieldMasterBonus') {
        shieldMasterBlockBonus += skillDef.blockChanceBonus ?? 0;
      }
    });
  }

  const blockChance = Math.max(
    leftItem?.blockChance ?? 0,
    rightItem?.blockChance ?? 0
  ) + shieldMasterBlockBonus + (target.skillBonuses?.['blockChance'] ?? 0) + (hasShield ? (target.skillBonuses?.['shieldBlock'] ?? 0) : 0);

  if (blockChance > 0 && Math.random() * 100 < blockChance) {
    blocked = true;
  }

  if (blocked) {
    addLogEntry({
      time: Date.now(), actor: 'monster',
      attacker: monster.name, target: target.name,
      attackType: isSpecial ? 'special' : 'attack', hitChance, hit: true, crit: false,
      blocked: true,
    });

    // Shield block sound
    playShieldBlockSound();

    // UI Feedback for block
    const memberTop = document.querySelector(`#member-${target.id} .member-main`);
    if (memberTop) {
      const popup = document.createElement('span');
      popup.className = 'damage-popup damage-popup--incoming';
      popup.style.color = '#a0d8ff';
      popup.textContent = 'BLOCKED';
      memberTop.appendChild(popup);
      setTimeout(() => popup.remove(), 900);
    }

    return;
  }

  // Calculate character's total physical defence from equipped armour + status effect modifiers
  let charDefence = 0;
  const _counted = new Set();
  Object.values(target.equipment ?? {}).forEach(item => {
    if (item && !_counted.has(item)) {
      _counted.add(item);
      const itemDef = getItemDef(item.name);
      if (itemDef?.defence) charDefence += itemDef.defence;
    }
  });
  if (target.skills) {
    const _shieldEquipped = Object.values(target.equipment ?? {}).some(item => item && getItemDef(item.name)?.weaponType === 'shield');
    if (_shieldEquipped) {
      target.skills.forEach(skill => {
        const name = typeof skill === 'string' ? skill : skill.name;
        const skillDef = SKILLS_DATA[name];
        if (skillDef?.isPassive && skillDef.effectType === 'shieldMasterBonus') {
          charDefence += skillDef.defenceBonus ?? 0;
        }
      });
    }
  }
  charDefence = Math.max(0, charDefence + getDefenceModifier(target));
  const rampartActive = skillsState.rampart.active && skillsState.rampart.actorName === target.name && performance.now() < skillsState.rampart.expiresAt;
  if (rampartActive) {
    charDefence *= (skillsState.rampart.magnitude || 2);
  }

  // Resolve the attack's element: special variants supply their own damageType
  // (e.g. iceCast → "ice"); only basic attacks inherit monster.damageType so a
  // generic special (e.g. ogre slam) doesn't accidentally pick up a monster's
  // basic-attack element.
  const attackElement = damageType ?? (isSpecial ? null : monster.damageType) ?? null;
  const elementResistance = (attackElement && attackElement !== 'physical')
    ? (getEffectiveElementalResistances(target)[attackElement] ?? 0)
    : 0;
  const baseDamage = calcMonsterDamage(monster, effTarget, charDefence, elementResistance);
  const preCritDamage = damageMultiplier ? Math.round(baseDamage * damageMultiplier) : baseDamage;
  // Physical mitigation is VIT-only via the multiplicative curve
  // K/(K+VIT). Display the soaked percentage so the battle-log formula matches
  // the actual damage applied by calcMonsterDamage.
  const tgtVit = effTarget.stats?.vitality ?? 0;
  const vitSoakPct = Math.round(100 * tgtVit / (100 + tgtVit));

  // 5% base crit chance — triples the calculated damage (standard attacks only).
  // High-DEX monsters (assassins, etc.) chip in a small bonus, capped.
  const isCrit = !isSpecial && Math.random() < (CRIT_CHANCE + getDexCritChanceBonus(monster));
  let damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  // Elemental rider damage on top of the physical/main hit. Basic attacks
  // inherit monster.elementalDamage (e.g. IceMan's icy touch); special variants
  // only use riders they explicitly carry, so a themed special like iceCast
  // (whole-damage ice) doesn't double-count by also inheriting basic riders.
  // Each (element, value) is reduced by the player's effective resistance and
  // added separately so the breakdown can be shown in the battle log.
  const incomingRiders = elementalDamage ?? (isSpecial ? null : monster.elementalDamage) ?? null;
  const incomingBreakdown = {};
  if (incomingRiders) {
    const playerResists = getEffectiveElementalResistances(target);
    for (const [element, value] of Object.entries(incomingRiders)) {
      if (!value) continue;
      const resist = playerResists[element] ?? 0;
      const rider = Math.max(0, Math.round(value * (1 - resist)));
      if (rider === 0) continue;
      incomingBreakdown[element] = rider;
      damage += rider;
    }
  }

  // Sanctuary buff — reduces all incoming party damage by a percentage.
  // magnitude is stored as a percentage (e.g. 10 = 10% reduction), capped at 100%.
  const sanctuaryUp = skillsState.sanctuary.active &&
    performance.now() < skillsState.sanctuary.expiresAt;
  const sanctuaryReduction = sanctuaryUp ? Math.min(skillsState.sanctuary.magnitude, 100) : 0;
  if (sanctuaryUp) {
    damage = Math.max(1, Math.floor(damage * (1 - sanctuaryReduction / 100)));
  }

  // Invincibility — party cannot take damage
  if (isPartyInvincible()) {
    const memberTop = document.querySelector(`#member-${target.id} .member-main`);
    if (memberTop) {
      const popup = document.createElement('span');
      popup.className = 'damage-popup damage-popup--incoming';
      popup.style.color = '#ffd700';
      popup.textContent = 'INVINCIBLE';
      memberTop.appendChild(popup);
      setTimeout(() => popup.remove(), 900);
    }
    return;
  }

  setHp(target.id, target.hp - damage, monster.name);
  flashPortraitHit(target.id);
  playPartyHitSound();
  if (isCrit) playCritSound('bash');

  // Retribution stance: reflect a portion of the damage back onto the attacker.
  const reflected = getReflectDamage(target, damage);
  if (reflected > 0 && monster.alive) {
    const result = hitMonster(monster.id, reflected, 'reflect', false, target.name);
    if (!result?.blocked) {
      addLogEntry({
        time: Date.now(),
        type: 'reflect',
        actor: 'player',
        attacker: target.name,
        target: monster.name,
        amount: result?.damage ?? reflected,
      });
    }
  }

  // Track damage taken for battle summary
  recordDamageTaken(target.name, damage);

  // Float the damage number above the character's portrait
  showMemberDamage(target.id, damage, isCrit);

  addLogEntry({
    time: Date.now(), actor: 'monster',
    attacker: monster.name, target: target.name,
    attackType: isSpecial ? 'special' : 'attack', hitChance, hit: true, crit: isCrit,
    statBonus: monster.stats?.strength ?? 10,
    baseBonus: MONSTER_BASE_ATTACK,
    mitigation: vitSoakPct,
    mitigationLabel: 'vit',
    defenceMitigation: charDefence,
    preCritDamage,
    finalDamage: damage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
    specialName: specialName ?? null,
    isAoe: isAoe ?? false,
    attackElement: (attackElement && attackElement !== 'physical') ? attackElement : null,
    elementResistance: elementResistance || 0,
    elementalBreakdown: Object.keys(incomingBreakdown).length > 0 ? incomingBreakdown : null,
    sanctuaryReduction: sanctuaryReduction || null,
  });

  // Apply on-hit status effects defined on this monster type (or override for special attacks)
  if (!target.isDead) {
    (onHitEffectsOverride ?? monster.onHitEffects ?? []).forEach(effect => {
      const effectiveChance = calcOnHitChance(
        effect.chance,
        target.stats?.resilience ?? 0,
        getEffectiveStatusResistances(target),
        effect.effectId,
      );
      if (Math.random() < effectiveChance) {
        applyStatusEffect(target.id, effect.effectId, null, effect.durationSec);
        const def = STATUS_EFFECT_DEFS[effect.effectId];
        showMessage(`<b>${target.name}</b> is afflicted with <b>${def?.name ?? effect.effectId}</b>!`, 2500);
        addLogEntry({
          time: Date.now(),
          type: 'status-effect',
          actor: 'monster',
          attacker: monster.name,
          target: target.name,
          effectId: effect.effectId,
          effectName: def?.name ?? effect.effectId,
          effectColor: def?.color ?? null,
        });
      }
    });
  }

  // Only announce a kill — routine damage is shown on the portrait popup
  if (target.isDead) {
    showMessage(`<b>${target.name}</b> HAS FALLEN!`, 3500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DEATH TWEENS
// ─────────────────────────────────────────────────────────────────────────────

function _playBlockAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  if (m.mixer && m.actions.block) {
    if (m.actions.hit && m.actions.hit.isRunning()) m.actions.hit.stop();
    if (m.actions.attack && m.actions.attack.isRunning()) m.actions.attack.stop();

    const currentAction = (m.actions.walk && m._animState === 'walk') ? m.actions.walk : (m._activeIdle || m.actions.idle);
    if (currentAction && currentAction.isRunning()) {
      m.actions.block.reset().play();
      currentAction.crossFadeTo(m.actions.block, 0.1, true);
    } else {
      m.actions.block.reset().play();
    }
  }

  // Small defensive knockback for visual weight
  const origin = { z: mesh.position.z };
  new Tween(mesh.position, tweenGroup)
    .to({ z: origin.z + 0.05 }, 60)
    .easing(Easing.Quadratic.Out)
    .chain(
      new Tween(mesh.position, tweenGroup)
        .to({ z: origin.z }, 100)
        .easing(Easing.Quadratic.In)
    )
    .start();
}

function _playHitAnimation(m, attackType, killer, elementalBreakdown = null, spellElement = null) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  if (m.name === 'Training Dummy' && !m.combatMode) {
    // Only trigger for recruits (party members)
    const isRecruit = killer && party.some(p => p.name === killer);
    if (isRecruit && m.mixer && m.actions.hit) {
      m.actions.hit.stop();
      m.actions.hit.reset().play();
    }
    return; // Skip standard red flash/knockback for dummy
  }

  // Elemental floor damage (e.g. "fire-floor", "ice-floor") — play the
  // matching elemental burst instead of blood, so a monster on lava visibly
  // takes fire damage and a monster on ice visibly takes ice damage.
  const _floorElementMatch = typeof attackType === 'string' && attackType.endsWith('-floor')
    ? attackType.slice(0, -'-floor'.length)
    : null;
  const _isFloorHit = _floorElementMatch && ELEMENTS[_floorElementMatch];

  const _isSpellHit = ['fireball', 'frostbolt', 'waterbolt', 'lightningbolt', 'holybolt', 'darkbolt', 'banishment', 'incinerate'].includes(attackType);
  if (!_isSpellHit && !_isFloorHit && m.physicalHitSound) {
    const snd = new Audio(asset(m.physicalHitSound));
    snd.volume = 0.7;
    snd.play().catch(() => {});
  }

  if (_isFloorHit) {
    createElementalBurst(mesh.position, ELEMENTS[_floorElementMatch].color);
  } else if (attackType === 'fireball' || attackType === 'frostbolt' || attackType === 'waterbolt' || attackType === 'lightningbolt' || attackType === 'holybolt' || attackType === 'darkbolt' || attackType === 'banishment' || attackType === 'incinerate') {
    // Magic spells — recolour the spark by spell element when present, otherwise
    // the existing white→orange spark plays (preserves prior look for non-elemental spells).
    const spellColor = spellElement ? ELEMENTS[spellElement]?.color : null;
    if (spellColor) {
      createElementalBurst(mesh.position, spellColor);
    } else {
      createHitSpark(mesh.position);
    }
  } else if (!m.name.includes('Skeleton')) {
    if (m.name.includes('Mushroom')) {
      createGreenBloodSplatter(mesh.position, 0.45);
    } else {
      let yOffset;
      if (m.name.includes('Treekin')) {
        yOffset = 0.05;
      } else if (['Goblin', 'Demon Spawn', 'Zombie'].some(n => m.name.includes(n))) {
        yOffset = 0.45;
      } else if (['Mummy', 'Orc', 'Ghoul', 'Iceman'].some(n => m.name.includes(n))) {
        yOffset = 0.65;
      } else {
        yOffset = 0.9;
      }
      createBloodSplatter(mesh.position, yOffset);
    }
  }

  // Elemental rider bursts — fire one small additive sprite burst per element
  // that landed (after monster weak/resist multipliers). Plays on top of the
  // splatter for fleshy targets and stands alone on skeletons / dummies that
  // skip blood, so an elemental hit always reads visually.
  if (elementalBreakdown) {
    for (const [elementId, value] of Object.entries(elementalBreakdown)) {
      if (!value) continue;
      const colour = ELEMENTS[elementId]?.color;
      if (colour) createElementalBurst(mesh.position, colour);
    }
  }

  // Standard hit flash and knockback logic below...

  if (m.mixer && m.actions.hit) {
    // If there are moving/idle animations, crossfade from the current one to hit
    const currentAction = (m.actions.walk && m._animState === 'walk') ? m.actions.walk : (m._activeIdle || m.actions.idle);
    if (currentAction) {
      m.actions.hit.reset().play();
      currentAction.crossFadeTo(m.actions.hit, 0.1, true);
    } else {
      m.actions.hit.reset().play();
    }
  }


  // Small knockback
  const origin = { z: mesh.position.z };
  new Tween(mesh.position, tweenGroup)
    .to({ z: origin.z + 0.18 }, 80)
    .easing(Easing.Quadratic.Out)
    .chain(
      new Tween(mesh.position, tweenGroup)
        .to({ z: origin.z }, 120)
        .easing(Easing.Quadratic.In)
    )
    .start();
}

function _playDeathAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  if (m.actions.death) {
    if (m.actions.idle) m.actions.idle.stop();
    if (m.actions.walk) m.actions.walk.stop();
    if (m.actions.attack) m.actions.attack.stop();
    m.actions.death.reset().play();

    // Still perform the sinking/fade-out but delayed to allow animation to play
    setTimeout(() => {
      _startFadeOut(m);
    }, 1000);
  } else {
    _startFadeOut(m);
  }
}

function _startFadeOut(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;
  const startY = mesh.position.y;
  const fadeObj = { y: startY, opacity: 1 };

  new Tween(fadeObj, tweenGroup)
    .to({ y: startY - 0.9, opacity: 0 }, 900)
    .easing(Easing.Quadratic.In)
    .onUpdate(() => {
      mesh.position.y = fadeObj.y;
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            mat.transparent = true;
            mat.opacity = fadeObj.opacity;
            mat.depthWrite = false;
          });
        }
      });
    })
    .onComplete(() => {
      if (mesh.parent) mesh.parent.remove(mesh);
      m.mesh = null;
    })
    .start();
}

// ─────────────────────────────────────────────────────────────────────────────
//  SAVE GAME — monster state serialization
// ─────────────────────────────────────────────────────────────────────────────

/** Returns { id: { alive, hp } } for all monsters on the given level. */
export function getMonsterStates(level) {
  const result = {};
  for (const m of monsters) {
    if ((m.level ?? 1) !== level) continue;
    result[m.id] = { alive: m.alive, hp: m.hp, awakeningUsed: m._awakeningUsed ?? false };
  }
  return result;
}

// ── Save / Restore ────────────────────────────────────────────────────────────

/**
 * Capture the per-monster save-relevant fields for every non-summoned monster.
 * Summoned monsters (Treeman treekin etc) are excluded — they get reset on
 * level reload anyway and saving mid-summon would be ill-defined.
 *
 * Mesh/DOM refs (m.mesh, m.hpBarFill, m.blobShadow) are NOT captured — meshes
 * are rebuilt by `loadMonstersForLevel` on the restored level.
 */
export function captureMonsterState() {
  const monsterStates = [];
  for (const m of monsters) {
    if (m.summoned) continue;
    monsterStates.push({
      id: m.id,
      level: m.level ?? 1,
      alive: m.alive,
      hp: m.hp,
      hpMax: m.hpMax,
      gridRow: m.gridRow,
      gridCol: m.gridCol,
      facing: m.facing,
      activeDebuffs: m.activeDebuffs ? JSON.parse(JSON.stringify(m.activeDebuffs)) : [],
      awakeningUsed: !!m._awakeningUsed,
      easyModeApplied: !!m._easyModeApplied,
      // Dropped-item loot left on a dead monster's corpse. Stored here so a
      // saved corpse re-spawns with the same contents on reload. Null if the
      // corpse was already fully looted or never had drops.
      corpseContents: Array.isArray(m.corpseContents) ? [...m.corpseContents] : null,
      // Quartet-style formations: per-sub HP/alive state. Plain objects so the
      // save bundle stays JSON-safe.
      members: Array.isArray(m.members)
        ? m.members.map(s => ({ subSlot: s.subSlot, hp: s.hp, hpMax: s.hpMax, alive: s.alive }))
        : null,
    });
  }
  return {
    droppedBossEssences: [..._collections.droppedBossEssences],
    killedBosses: [..._collections.killedBosses],
    spawnedFireFloors: [..._collections.spawnedFireFloors],
    spawnedLightningFloors: [..._collections.spawnedLightningFloors],
    monsters: monsterStates,
  };
}

export function restoreMonsterState(data) {
  if (!data) return;
  _collections.droppedBossEssences = new Set(data.droppedBossEssences ?? []);
  _collections.killedBosses = new Set(data.killedBosses ?? []);
  _collections.spawnedFireFloors = new Set(data.spawnedFireFloors ?? []);
  _collections.spawnedLightningFloors = new Set(data.spawnedLightningFloors ?? []);
  if (Array.isArray(data.monsters)) {
    const byKey = new Map();
    for (const s of data.monsters) byKey.set(`${s.level}:${s.id}`, s);
    for (const m of monsters) {
      if (m.summoned) continue;
      const s = byKey.get(`${m.level ?? 1}:${m.id}`);
      if (!s) continue;
      m.alive = s.alive;
      m.hp = s.hp;
      // hpMax must be restored too, otherwise an easy-mode-halved monster
      // ends up with restored hp (e.g. 50) but a fresh-init hpMax (e.g. 100),
      // and the HP bar shows partial fill even though the monster is at full
      // health. easyModeApplied=true also blocks loadMonstersForLevel from
      // re-halving the fresh hpMax.
      if (s.hpMax !== undefined) m.hpMax = s.hpMax;
      if (s.gridRow !== undefined) m.gridRow = s.gridRow;
      if (s.gridCol !== undefined) m.gridCol = s.gridCol;
      if (s.facing !== undefined) m.facing = s.facing;
      m.activeDebuffs = Array.isArray(s.activeDebuffs) ? s.activeDebuffs : [];
      if (s.awakeningUsed) m._awakeningUsed = true;
      if (s.easyModeApplied) m._easyModeApplied = true;
      m.corpseContents = Array.isArray(s.corpseContents) ? s.corpseContents : null;
      // Restore per-sub state for quartet formations. The fresh init step
      // already populated m.members at module load; we overwrite from save.
      if (Array.isArray(s.members) && Array.isArray(m.members)) {
        for (const ss of s.members) {
          const target = m.members[ss.subSlot];
          if (target) {
            target.hp = ss.hp;
            target.hpMax = ss.hpMax;
            target.alive = ss.alive;
          }
        }
      }
      // Combat scratch state is ephemeral — start fresh.
      m.engaged = false;
      m._ps = null;
      m._cs = null;
    }
  }
}


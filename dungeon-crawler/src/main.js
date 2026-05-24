import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildLevel, buildTextureZone, buildInnerTextureZone, buildFloorZone, findCell, CELL_START, changeMapArray, level0Map, level1Map, level2Map, level3Map, level4Map, level5Map, cellToWorld, isPassable, CELL_HOLE, CELL_STAIRS_UP, dungeonMap, invalidateWallTextures } from './map.js';
import ELEMENT_FLOORS from './data/element-floors.json';
import { initPlayer, initInput, setCallbacks, tweenGroup, player, FACING_ANGLES, isInFrontOfPlayer } from './player.js';
import { initLighting, updateLighting, applyLevelTheme } from './lighting.js';
import { initParticles, updateParticles, invalidateParticleTextures } from './particles.js';
import { initMinimap, drawMinimap, updateStatus, showMessage, LEVEL_NAMES } from './minimap.js';
import { initParty, updateParty, party, refreshPartyCards, autoAttack, autoRangeAttack, setHp, flashPortraitHit, showMemberDamage, isPartyUnseen, resurrectAll, getEffectiveElementalResistances, buildPartyPanel } from './party.js';
import { getItemDef } from './items.js';
import { initEquipment, tickAutoAttack, clearAutoAttackTimers, tickAutoRangeAttack, clearAutoRangeAttackTimers } from './equipment.js';
import { initMonsters, loadMonstersForLevel, updateMonsters, triggerMonsterAttack, monsters, isMonsterAt, tickMonsterElementFloorDamage } from './monster.js';
import { initRecruits, updateRecruitsMeshState, RECRUITS, recruitCharacter } from './recruits.js';
import { initObjects, clearObjects, spawnObjectsForLevel, isShopAt, isStatueAt, updateObjects, interactables, checkTrapAtPosition, partyHasItem, getCrystalShrineState, setLevel1HoleRoomSpawned, getWorldFlags, spawnArenaPortal, snapshotStarterStash, captureWorldState, restoreWorldState, getPersistedStarterStashItems, replenishPotionMerchant, checkFloorPortalStep } from './objects.js';
import { startMusic, updateAudio, setAmbientLevel, setZoneMusic, playFallSequence, prefetchBuffer, fadeOutQuestAudio, playThemeTune, fadeOutThemeTune, playSoundByUrl, playPartyHitSound, prefetchActionSounds, checkNpcDialogueProximity, setElementFloorSound } from './audio.js';
import { initBattleLog, addLogEntry } from './battle-log.js';
import { initBattleStats } from './battle-stats.js';
import { initMainMenu } from './main-menu.js';
import { initQuarks, updateQuarks } from './quarks-intro.js';
import { showHelpDialog } from './help.js';
import { consumePendingLoad, applySavePreInit, applySavePostInit, renderSavesList } from './save.js';
import { asset } from './assets.js';
import { initQuests } from './quest.js';
import { initSlashTrail } from './slash-trail.js';
import { initEssentiary, getMonsterTier, recordArenaVictory, applyTierScaling } from './essentiary.js';
import { getSkillExpertise } from './skill-tree.js';
import { MONSTER_DEFS } from './monster-defs.js';
import { inst } from './monster-factory.js';
import { schematicTrialsMap } from './levels/schematic-trials/map.js';

import './style.css';

// ─────────────────────────────────────────────
//  RENDERER & GLOBALS
// ─────────────────────────────────────────────
window.currentLevel = 0;

// ─────────────────────────────────────────────
//  ARENA MAP  (level 99 — used by The Essentiary)
// ─────────────────────────────────────────────
const ARENA_LEVEL = 99;
const SCHEMATIC_TRIALS_LEVEL = 50;
const ARENA_MAP = [
  [1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1],
  [1,0,0,8,0,9,0,0,1],
  [1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1],
  [1,0,0,0,2,0,0,0,1],
  [1,1,1,1,1,1,1,1,1],
];

// Patch hardcoded asset paths in index.html to use CDN base URL.
// Uses data-src (no src) so the browser preloader never fetches from localhost.
document.querySelectorAll('img[data-src]').forEach(img => {
  img.src = asset(img.getAttribute('data-src'));
});

// Only patch+load the intro video immediately (needed during the splash screen progress bar).
// All other videos are loaded lazily per-level via loadVideosForLevel().
{
  const introSrc = document.querySelector('#intro-video source');
  if (introSrc) {
    introSrc.src = asset(introSrc.getAttribute('data-src'));
    document.getElementById('intro-video')?.load();
  }
}


// Map of level number → video element IDs to preload when entering that level
const _VIDEO_LEVELS = {
  0: ['battle-prep-video', 'hero-door-video', 'nectar-quest-video', 'crystal-shrine-red-video', 'crystal-shrine-red-blue-video', 'portal-video'],
  1: ['ogre-video', 'mummy-video'],
  2: ['treeman-video', 'demon-video', 'giant-video', 'aqua-man-video', 'stairs-video', 'crow-wizard-video', 'statue-knights-video'],
  3: ['minotaur-video', 'minotaur-death-video', 'statue-portal-video', 'egg-video'],
  4: ['stairs-video', 'demon-ogre-video', 'lizard-man-video'],
};
const _loadedVideoIds = new Set();

function loadVideosForLevel(levelNum) {
  const ids = _VIDEO_LEVELS[levelNum] ?? [];
  ids.forEach(id => {
    if (_loadedVideoIds.has(id)) return;
    _loadedVideoIds.add(id);
    const video = document.getElementById(id);
    if (!video) return;
    const source = video.querySelector('source');
    if (!source) return;
    source.src = asset(source.getAttribute('data-src'));
    video.load();
  });
}

// Preload level 0 videos (starter room / NPC party confirm)
loadVideosForLevel(0);

// Pre-fetch back1.mp3 raw bytes now — no AudioContext needed.
// By the time the user clicks, the bytes are cached and decodeAudioData is near-instant.
const _audioPreload = prefetchBuffer(asset('/sounds/back1.mp3'));

const _themeTunePreload = prefetchBuffer(asset('/sounds/backing/theme-tune.mp3'));
prefetchBuffer(asset('/sounds/browse-member.mp3'));
prefetchBuffer(asset('/sounds/select-member.mp3'));
prefetchBuffer(asset('/sounds/party-confirmed.mp3'));
prefetchActionSounds();

// Autoplay the side video as soon as it can play.
{
  const _sideVid = document.getElementById('intro-video');
  if (_sideVid) {
    _sideVid.addEventListener('canplay', () => _sideVid.play().catch(() => { }), { once: true });
  }
}

// Disable "Start Adventure" until the theme tune is pre-fetched.
// The button also must not appear until all other splash elements have animated in
// (last element: delay 3s + duration 0.8s = 3.8s after splash shown).
let _splashShownAt = 0;  // timestamp set when splash screen becomes visible
let _themeLoaded = false;

{
  const BTN_REVEAL_DELAY = 4300; // ms after splash shown before button appears
  const _startBtn = document.getElementById('start-adventure-btn');
  const _barWrap = document.getElementById('loading-bar-wrap');

  function _revealStartBtn() {
    if (!_startBtn) return;
    _startBtn.style.opacity = '';
    _startBtn.style.animation = '';
    _startBtn.style.pointerEvents = '';
    if (_barWrap) _barWrap.style.opacity = '0';
  }

  if (_startBtn) {
    // Hide completely — no disabled state, no placeholder text
    _startBtn.style.opacity = '0';
    _startBtn.style.animation = 'none';
    _startBtn.style.pointerEvents = 'none';
    _themeTunePreload.then(() => {
      _themeLoaded = true;
      if (_splashShownAt) {
        // Splash already visible — schedule reveal for the right moment
        const elapsed = Date.now() - _splashShownAt;
        setTimeout(_revealStartBtn, Math.max(0, BTN_REVEAL_DELAY - elapsed));
      }
      // If splash not shown yet, the preStartBtn handler will schedule the reveal
    });
  }
}

const canvas = document.getElementById('renderer-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// When the GPU evicts the WebGL context (common during video decoding under memory pressure),
// Three.js restores the context but textures don't auto-reupload — force them all here.
canvas.addEventListener('webglcontextrestored', () => {
  invalidateWallTextures();
  invalidateParticleTextures();
  // Also mark any GLTF/sprite materials currently in the scene
  scene.traverse(obj => {
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const mat of mats) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
        if (mat[key]) mat[key].needsUpdate = true;
      }
    }
  });
});

// CSS2D renderer — renders HTML labels (monster HP bars) anchored in 3D space
const css2dRenderer = new CSS2DRenderer();
css2dRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
document.body.appendChild(css2dRenderer.domElement);

// Key-item hover cursor overlay
const _keyItemCursorEl = document.createElement('img');
_keyItemCursorEl.id = 'key-item-cursor';
document.body.appendChild(_keyItemCursorEl);

// ─────────────────────────────────────────────
//  SCENE  &  CAMERA
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 2, 12);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
scene.add(camera);  // Camera must be in scene graph so its children (e.g. sword) render

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  css2dRenderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ─────────────────────────────────────────────
//  BUILD WORLD
// ─────────────────────────────────────────────
buildLevel(scene);

// ─────────────────────────────────────────────
//  LIGHTING
// ─────────────────────────────────────────────
const lights = initLighting(scene);
initParticles(scene, camera);

// ─────────────────────────────────────────────
//  PLAYER
// ─────────────────────────────────────────────
initPlayer(11, 15, camera, 3);

// Cutscene "have we seen this video" flags. Single mutable object on window so
// the save system, monster.js, and gameplay code all read/write the same place.
// Add a new key here when adding a new cutscene — no other wiring needed.
window.videoFlags = {
  hasSeenOgreVideo: false,
  hasSeenPrepVideo: false,
  hasSeenMinotaurVideo: false,
  hasSeenMinotaurDeathVideo: false,
  hasSeenDemonVideo: false,
  hasSeenAquaManVideo: false,
  hasSeenCrowWizardVideo: false,
  hasSeenTreemanVideo: false,
  hasSeenL1Intro: false,
};
const videoFlags = window.videoFlags;
// Ephemeral runtime flag: true once the crow wizard video has fully finished (or was already seen on load).
// Not saved — reconstructed from hasSeenCrowWizardVideo on restore.
window._crowWizardVideoDone = false;
let prepVideoTimer = null;

// Arena (monster trial) session state. Ephemeral — set on arena entry, cleared
// on exit. NOT saved: a save mid-arena would be ill-defined; on reload the
// player is back in the hub regardless.
//   • active — true while the party is fighting in the arena
//   • tier   — current monster tier (1..3+) being fought
//   • pre    — { level, gridRow, gridCol, facing } captured at entry so the
//              party can be teleported back to the same spot on exit.
window.arenaState = { active: false, tier: null, pre: null };

function captureVideoFlags() {
  return { ...videoFlags };
}

function restoreVideoFlags(data) {
  if (!data) return;
  for (const key of Object.keys(videoFlags)) {
    videoFlags[key] = !!data[key];
  }
  if (videoFlags.hasSeenCrowWizardVideo) window._crowWizardVideoDone = true;
}

setCallbacks({
  moved() {
    drawMinimap();
    updateStatus();
    checkNpcDialogueProximity(player.gridRow, player.gridCol);
    checkFloorPortalStep();
    // ── Level 0/1 walk-through transitions ───────────────────────────────────
    // Level 0 → Level 1: stepping west to (row 13, col 7) after gate is open
    if (window.currentLevel === 0 && player.gridRow === 13 && player.gridCol === 7) {
      window.loadLevel(1);
      return;
    }
    // Level 1 → Level 0: stepping east to (row 13, col 8) — the return threshold
    if (window.currentLevel === 1 && player.gridRow === 13 && player.gridCol === 8) {
      window.loadLevel(0);
      return;
    }

    // East room (merchant/large room) zone: cols 16-23, rows 7-15
    // Present in both level 0 and level 1 (level 1 check retained for edge cases).
    if (window.currentLevel === 0) {
      const inEastRoom = player.gridCol >= 16 && player.gridCol <= 23
        && player.gridRow >= 7 && player.gridRow <= 15;
      if (inEastRoom) {
        setZoneMusic([
          asset('/sounds/backing/crafting-room.mp3'),
          asset('/sounds/backing/town-music.mp3'),
        ]);
      } else {
        setZoneMusic(null);
        fadeOutQuestAudio();
      }
    } else if (window.currentLevel === 1) {
      const inOgreRoom = player.gridCol >= 1 && player.gridCol <= 6
        && player.gridRow >= 1 && player.gridRow <= 9;
      const inMummyRoom = player.gridCol >= 11 && player.gridCol <= 15
        && player.gridRow >= 1 && player.gridRow <= 5;

      if (inOgreRoom && videoFlags.hasSeenOgreVideo) {
        setZoneMusic(asset('/sounds/backing/ogre-room.mp3'));
      } else if (inMummyRoom) {
        setZoneMusic(asset('/sounds/backing/mummy-room.mp3'));
      } else {
        setZoneMusic(null);
      }

      // Prep video triggers ONLY when confirming the NPC modal now,
      // so we remove the position-based trigger entirely.
    } else if (window.currentLevel === 2) {
      // Demon room: south section of the passage
      const inDemonRoom = player.gridRow >= 31 && player.gridRow <= 34
        && player.gridCol >= 13 && player.gridCol <= 18;
      // Aqua man pit arrival area
      const inAquaManRoom = player.gridCol === 13 && player.gridRow >= 37 && player.gridRow <= 41;

      if (inAquaManRoom) {
        setZoneMusic(asset('/sounds/water.mp3'));
      } else {
        const demon = monsters.find(m => m.name === 'Demon' && (m.level ?? 1) === 2);
        const treeman = monsters.find(m => m.name === 'Treeman');
        // Treeman room and beyond (row 16+) gets boss/fight music
        const inTreemanRoom = player.gridRow >= 16 && player.gridRow <= 29;

        if (demon && !demon.alive) {
          setZoneMusic(asset('/sounds/backing/lvl2-post-demon.mp3'));
        } else if (treeman && !treeman.alive) {
          setZoneMusic(asset('/sounds/backing/demon-room.mp3'));
        } else if (inTreemanRoom) {
          setZoneMusic(asset('/sounds/backing/level-2.mp3'));
        } else {
          setZoneMusic(asset('/sounds/backing/level-2-start.mp3'));
        }
      }

      // Treeman video: fires when player first steps into the main treeman chamber
      if (!videoFlags.hasSeenTreemanVideo && player.gridRow === 16 && player.gridCol === 17) {
        videoFlags.hasSeenTreemanVideo = true;
        if (window.playTreemanVideo) window.playTreemanVideo();
      }

      // Crow Wizard video: fires when the party is two steps inside the room (row 8, col 32),
      // giving a clear sightline to the wizard before the skeletons rise.
      // Skeletons are gated on window._crowWizardVideoDone and will not rise until the video ends.
      if (!videoFlags.hasSeenCrowWizardVideo && player.gridRow === 8 && player.gridCol === 32) {
        videoFlags.hasSeenCrowWizardVideo = true;
        playCrowWizardVideo();
      }

      // Demon video: fires in the passage at row 28, col 17 — just before the demon room
      if (!videoFlags.hasSeenDemonVideo && player.gridRow === 28 && player.gridCol === 17) {
        videoFlags.hasSeenDemonVideo = true;
        playDemonVideo();
      }
    } else if (window.currentLevel === 3) {
      const inMinotaurRoom = player.gridRow >= 8 && player.gridRow <= 14
        && player.gridCol >= 8 && player.gridCol <= 14;

      if (inMinotaurRoom && !videoFlags.hasSeenMinotaurVideo) {
        videoFlags.hasSeenMinotaurVideo = true;
        if (window.playMinotaurVideo) window.playMinotaurVideo();
      }
    } else if (window.currentLevel === 4) {
      setZoneMusic(null);
    } else if (window.currentLevel === 5) {
      setZoneMusic(asset('/sounds/backing/hall-of-heroes.mp3'));
    }

    // --- Special Grid Logic (Teleports) ---
    const cell = dungeonMap[player.gridRow][player.gridCol];
    if (window.currentLevel === 1 && player.gridRow === 1 && player.gridCol === 15) {
      tweenGroup.removeAll();
      player.moving = false;

      const blackout = document.getElementById('fall-blackout');
      if (blackout) {
        blackout.classList.remove('hidden');
        blackout.offsetHeight;
        blackout.classList.add('visible');
      }

      playFallSequence();
      showMessage("Aaaaaah! You fall through the hole!");
      window._cutscenePlaying = true;

      // Fall damage
      party.forEach((m, i) => {
        if (m.isEmpty || m.isDead) return;
        const dmg = 8 + Math.floor(Math.random() * 8); // 8–15
        setHp(i, m.hp - dmg, 'Fall Damage');
        showMemberDamage(i, dmg, false);
        flashPortraitHit(i);
        addLogEntry({ time: Date.now(), type: 'tick', target: m.name, effectId: 'fall', effectName: 'Fall Damage', amount: dmg });
      });
      playPartyHitSound();

      setTimeout(() => {
        // Spawn the secret room now that we've fallen
        setLevel1HoleRoomSpawned(true);

        // Transform the walls into a room
        for (let r = 24; r <= 26; r++) {
          for (let c = 1; c <= 3; c++) {
            level1Map[r][c] = 0;
          }
        }

        // Rebuild the map and objects to include the NPC and new floor
        changeMapArray(level1Map);
        clearObjects(scene);
        buildLevel(scene);
        spawnObjectsForLevel();

        // Teleport to the secret room (row 25, col 2)
        player.gridRow = 25;
        player.gridCol = 2;
        const w = cellToWorld(25, 2);
        camera.position.set(w.x, w.y, w.z);
        // Face South (2)
        player.facing = 2;
        camera.rotation.order = 'YXZ';
        camera.rotation.y = FACING_ANGLES[player.facing];
        drawMinimap();
        updateStatus();

        // Play the help audio once upon falling – if he's not yet saved
        const flags = getWorldFlags();
        if (!flags.monsterNpcSaved) {
          playSoundByUrl(asset('/npcs/monster-npc/help.mp3'), 1.0);
        }

        // Hide the blackout
        if (blackout) {
          blackout.classList.remove('visible');
          setTimeout(() => blackout.classList.add('hidden'), 500);
        }

        window._cutscenePlaying = false;
      }, 1000);
    }
    if (window.currentLevel === 2) {
      if (cell === CELL_HOLE) {
        tweenGroup.removeAll();
        player.moving = false;

        const blackout = document.getElementById('fall-blackout');
        if (blackout) {
          blackout.classList.remove('hidden');
          // Force reflow
          blackout.offsetHeight;
          blackout.classList.add('visible');
        }

        playFallSequence();
        showMessage("Aaaaaah! You fall through the hole!");
        window._cutscenePlaying = true;

        // Fall damage — every living party member takes 8–15 HP from the impact
        party.forEach((m, i) => {
          if (m.isEmpty || m.isDead) return;
          const dmg = 8 + Math.floor(Math.random() * 8); // 8–15
          setHp(i, m.hp - dmg, 'Fall Damage');
          showMemberDamage(i, dmg, false);
          flashPortraitHit(i);
          addLogEntry({ time: Date.now(), type: 'tick', target: m.name, effectId: 'fall', effectName: 'Fall Damage', amount: dmg });
        });
        playPartyHitSound();

        // 1. Trigger the Aqua Man video immediately so the fade-in (1.5s) begins
        // while the scream/blackout is still covering the screen.
        // Only play the video the first time the party falls AND the Aqua Man
        // is still alive — once she's dead the narrative reveal is moot.
        const aquaMan = monsters.find(m => m.name === 'Aqua Man' && (m.level ?? 1) === 2);
        const shouldPlayAquaManVideo = !videoFlags.hasSeenAquaManVideo && !!aquaMan?.alive;
        if (shouldPlayAquaManVideo) {
          videoFlags.hasSeenAquaManVideo = true;
          playAquaManVideo(() => {
            // Once the video and its fade-out are complete, release cutscene lock
            window._cutscenePlaying = false;
          });
        } else {
          // No video — release the cutscene lock shortly after the scream/land
          // sequence completes (the fall setTimeout below also runs at 1000ms).
          setTimeout(() => { window._cutscenePlaying = false; }, 1500);
        }

        // 2. Wait 1 second for the scream/land sound sequence before teleporting the party.
        setTimeout(() => {
          // Teleport to pit arrival chamber (row 37, col 13)
          player.gridRow = 37;
          player.gridCol = 13;
          const w = cellToWorld(37, 13);
          camera.position.set(w.x, w.y, w.z);
          
          // Face South (2) towards the new passage
          player.facing = 2;
          camera.rotation.order = 'YXZ';
          camera.rotation.y = FACING_ANGLES[player.facing];
          drawMinimap();
          updateStatus();

          // Move the blackout overlay back to hidden once the video overlay is opaque
          if (blackout) {
            blackout.classList.remove('visible');
            setTimeout(() => blackout.classList.add('hidden'), 500);
          }
        }, 1000);
      } else if (cell === CELL_STAIRS_UP) {
        tweenGroup.removeAll();
        player.moving = false;

        if (window.playStairsVideo) {
          window._cutscenePlaying = true;
          window.playStairsVideo(() => {
            window._cutscenePlaying = false;
            showMessage("You climb the stairs back to the upper passage.");
          });

          // Teleport while the video is covering the screen
          setTimeout(() => {
            // Teleport to far end of original passage (row 32, col 34)
            player.gridRow = 32;
            player.gridCol = 34;
            const w = cellToWorld(32, 34);
            camera.position.set(w.x, w.y, w.z);
            // Face East (1) back towards the demon room
            player.facing = 1;
            camera.rotation.order = 'YXZ';
            camera.rotation.y = FACING_ANGLES[player.facing];
            drawMinimap();
            updateStatus();
          }, 1000);
        }
      }
    }

    // Check for traps on arrival (player.moving is false when tween completes)
    if (!player.moving) {
      checkTrapAtPosition(player.gridRow, player.gridCol);
    }
  },
  reached() {
    showMessage('YOU ESCAPED!<br><small style="font-size:14px;color:#aaa">The dungeon is conquered.</small>');
  },
  blocked(r, c) {
    // Unseen cloaks the party — they can walk through monsters
    return (isMonsterAt(r, c) && !isPartyUnseen()) || isShopAt(r, c) || isStatueAt(r, c);
  }
});

initInput(camera);

// ─────────────────────────────────────────────
//  QUARKS PARTICLE EFFECTS
// ─────────────────────────────────────────────
initQuarks(scene, camera);

// ─────────────────────────────────────────────
//  MINIMAP, HUD & PARTY  (initial draw)
// ─────────────────────────────────────────────
initMinimap();
drawMinimap();
updateStatus();
buildPartyPanel();
initParty();
initEquipment();
initBattleLog();
initBattleStats();
initMainMenu();
initQuests();

// Session-setting defaults. The splash screen options override these for a
// fresh game; a loaded save overrides them in applySavePreInit below. Must
// be set BEFORE consumePendingLoad so the pre-init restore isn't clobbered.
window.easyMode = false;
window.helpEnabled = true;

// ─────────────────────────────────────────────
//  SAVE RESTORE — PRE-INIT PHASE
//  Apply recruit flags + session settings BEFORE initRecruits/initObjects so
//  the level spawner uses the saved state. Post-init phase below.
// ─────────────────────────────────────────────
const _pendingSave = consumePendingLoad();
applySavePreInit(_pendingSave);

initRecruits(scene, camera);
initObjects(scene, camera);
initSlashTrail(camera);
initEssentiary();

// ─────────────────────────────────────────────
//  MONSTERS
// ─────────────────────────────────────────────
initMonsters(scene);

// ─────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────
let lastTime = performance.now();

// Element-floor damage: each entry in element-floors.json maps a cell id to an
// element + dps + tick interval. While the player stands on a matching cell,
// every living party member takes damage of that element each tick, mitigated
// by their resistance to that element. Tunable via data/element-floors.json.
const _elementFloorTickAccum = {};
function tickElementFloorDamage(dt) {
  const cell = dungeonMap[player.gridRow]?.[player.gridCol];
  let currentFloorSound = null;

  for (const [id, def] of Object.entries(ELEMENT_FLOORS)) {
    if (cell === def.cell && def.sound) {
      currentFloorSound = def.sound;
    }

    if (cell !== def.cell) { _elementFloorTickAccum[id] = def.tickInterval; continue; }
    const acc = (_elementFloorTickAccum[id] ?? def.tickInterval) + dt;
    if (acc < def.tickInterval) { _elementFloorTickAccum[id] = acc; continue; }
    _elementFloorTickAccum[id] = acc - def.tickInterval;
    const floorLabel = id.charAt(0).toUpperCase() + id.slice(1) + ' Floor';
    let anyHit = false;
    party.forEach((m, i) => {
      if (!m || m.isEmpty || m.isDead) return;
      const resistance = getEffectiveElementalResistances(m)[def.element] ?? 0;
      if (resistance >= 1) return;
      const dmg = Math.max(1, Math.round(def.dps * (1 - resistance)));
      setHp(i, m.hp - dmg, floorLabel);
      showMemberDamage(i, dmg, false);
      flashPortraitHit(i);
      addLogEntry({ time: Date.now(), type: 'tick', target: m.name, effectId: id, effectName: floorLabel, amount: dmg });
      anyHit = true;
    });
    if (anyHit) playPartyHitSound();
  }

  setElementFloorSound(currentFloorSound);
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  tweenGroup.update(now);

  if (window._cutscenePlaying) {
    updateAudio(dt);
    renderer.render(scene, camera);
    css2dRenderer.render(scene, camera);
    return;
  }

  updateObjects(dt);
  updateLighting(lights, camera, dt);
  updateMonsters(dt, camera, scene);
  updateParticles(dt);
  updateQuarks(dt);
  updateAudio(dt);
  updateParty(dt);
  tickElementFloorDamage(dt);
  tickMonsterElementFloorDamage(dt);

  // Auto-attack: front row members attack automatically when a monster is in melee range
  if (autoAttack) {
    const currentLevel = window.currentLevel ?? 0;
    const hasTarget = monsters.some(t =>
      t.alive && !t._frozen &&
      (t.level ?? 1) === currentLevel &&
      isInFrontOfPlayer(t.gridRow, t.gridCol, 1) &&
      isPassable(t.gridRow, t.gridCol) &&
      isPassable(player.gridRow, player.gridCol)
    );
    if (hasTarget) {
      for (const i of [0, 1]) {
        const m = party[i];
        if (!m || m.isEmpty || m.isDead) continue;
        tickAutoAttack(i);
      }
    } else {
      // Monster stepped away — clear any pending fire timers so they don't
      // fire the instant combat resumes, giving the player a fresh 1-second window
      clearAutoAttackTimers();
    }
  }

  // Auto-range-attack: any party member with a bow or crossbow shoots automatically
  // when a monster is within ranged range (3 cells).  The 1-second human-feel delay
  // is baked into tickAutoRangeAttack via AUTO_EXTRA_DELAY_MS.
  if (autoRangeAttack) {
    const currentLevel = window.currentLevel ?? 0;
    const hasRangedTarget = monsters.some(t =>
      t.alive && !t._frozen &&
      (t.level ?? 1) === currentLevel &&
      isInFrontOfPlayer(t.gridRow, t.gridCol, 4) &&
      isPassable(t.gridRow, t.gridCol) &&
      isPassable(player.gridRow, player.gridCol)
    );
    if (hasRangedTarget) {
      for (const i of [0, 1, 2, 3]) {
        const m = party[i];
        if (!m || m.isEmpty || m.isDead) continue;
        tickAutoRangeAttack(i);
      }
    } else {
      // No target in range — reset pending timers for a clean start next encounter
      clearAutoRangeAttackTimers();
    }
  }

  renderer.render(scene, camera);
  css2dRenderer.render(scene, camera);
}

animate(performance.now());

// ─────────────────────────────────────────────
//  INTRO FLOW (pre-start → splash → character select → dungeon)
// ─────────────────────────────────────────────
const introOverlay = document.getElementById('intro-overlay');
const preStartScreen = document.getElementById('pre-start-screen');
const splashScreen = document.getElementById('splash-screen');
const charSelectScreen = document.getElementById('char-select-screen');
const introVideo = document.getElementById('intro-video');
const preStartBtn = document.getElementById('pre-start-btn');
const preLoadBtn = document.getElementById('pre-load-btn');
const loadGameScreen = document.getElementById('load-game-screen');
const loadGameCancelBtn = document.getElementById('load-game-cancel-btn');
const startBtn = document.getElementById('start-adventure-btn');

function _readStartOptions() {
  const diffRadio = document.querySelector('input[name="difficulty"]:checked');
  window.easyMode = diffRadio ? diffRadio.value === 'normal' : true;
  window.helpEnabled = document.getElementById('help-toggle')?.checked ?? true;
}

function finishIntro({ suppressHelp = false } = {}) {
  if (!introOverlay) return;
  fadeOutThemeTune(1500);
  introOverlay.style.transition = 'opacity 1.5s ease';
  introOverlay.style.opacity = '0';
  setTimeout(() => {
    introOverlay.querySelectorAll('video').forEach(v => {
      v.pause();
      v.removeAttribute('src');
      v.querySelectorAll('source').forEach(s => s.remove());
      v.load();
    });
    introOverlay.remove();
    startMusic();

    if (window.helpEnabled && !suppressHelp) {
      showHelpDialog({
        text: "Use the keys to move and turn.",
        image: asset("/source/wasd_qe_keys.png"),
        onDismiss: () => showHelpDialog({
          text: "Left click items in the world to interact with them."
        })
      });
    }
  }, 1500);
}

// ── Screen 1 → Screen 2: Pre-start triggers audio, shows splash ──
if (preStartBtn) {
  preStartBtn.addEventListener('click', async () => {
    await handleFirstInteraction();
    preStartScreen.style.display = 'none';
    splashScreen.style.display = 'flex';
    introVideo.play().catch(() => { });
    _splashShownAt = Date.now();
    if (_themeLoaded) {
      // Theme already ready — schedule the button reveal from now
      const startBtn = document.getElementById('start-adventure-btn');
      const barWrap = document.getElementById('loading-bar-wrap');
      setTimeout(() => {
        if (startBtn) {
          startBtn.style.opacity = '';
          startBtn.style.animation = '';
          startBtn.style.pointerEvents = '';
        }
        if (barWrap) barWrap.style.opacity = '0';
      }, 4300);
    }
  });
}

// ── Screen 1 → Load Game Screen ──
if (preLoadBtn) {
  preLoadBtn.addEventListener('click', async () => {
    await handleFirstInteraction();
    preStartScreen.style.display = 'none';
    loadGameScreen.style.display = 'flex';
    renderSavesList('#load-game-list', { requireConfirmOnLoad: false });
  });
}

if (loadGameCancelBtn) {
  loadGameCancelBtn.addEventListener('click', () => {
    loadGameScreen.style.display = 'none';
    preStartScreen.style.display = 'flex';
  });
}

// ── Screen 2 Options Sound ──
document.querySelectorAll('#difficulty-select input, #help-toggle').forEach(el => {
  el.addEventListener('change', () => {
    playSoundByUrl(asset('/sounds/browse-member.mp3'), 0.4);
  });
});

// ── Screen 2 → Screen 3: Splash submits options, shows character select ──
if (startBtn) {
  startBtn.addEventListener('click', () => {
    playSoundByUrl(asset('/sounds/party-confirmed.mp3'), 0.5);
    _readStartOptions();
    splashScreen.style.display = 'none';
    introVideo.pause();
    showCharacterSelection();
  });
}

// ── Character Selection Screen ──
function showCharacterSelection() {
  charSelectScreen.style.display = 'flex';

  const selectedIds = new Set();
  let activeRecruitId = null;

  function getVideoSrc(imagePath) {
    const filename = imagePath.split('/').pop();
    const base = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '').replace(/_head$/, '');
    return asset(`/heros/${base}_full.mp4`);
  }

  function miniCardHTML(r) {
    return `
      <div class="cs-mini-card" data-recruit-id="${r.id}">
        <img class="cs-mini-portrait" src="${asset(r.image)}" alt="${r.name}" />
      </div>
    `;
  }

  function detailHTML(r) {
    const isSelected = selectedIds.has(r.id);
    const full = selectedIds.size >= 4;
    const canAdd = !isSelected && full;
    const expertise = getSkillExpertise(r.skillTree);
    const jobIcon  = asset(`/skills/jobs/${r.job.toLowerCase().replace(/\s+/g, '-')}.webp`);
    const raceKey  = r.race.toLowerCase().includes('elf') ? 'elf' : r.race.toLowerCase();
    const raceIcon = asset(`/skills/race/${raceKey}.webp`);
    const stats = [
      { label: 'STR', val: r.stats.strength    },
      { label: 'DEX', val: r.stats.dexterity   },
      { label: 'VIT', val: r.stats.vitality    },
      { label: 'INT', val: r.stats.intelligence },
      { label: 'RES', val: r.stats.resilience  },
    ];
    return `
      <div class="cs-detail-hero-header">
        <div class="cs-detail-name">${r.name}</div>
        <div class="cs-detail-class">${r.race} - ${r.job}</div>
      </div>

      <div class="cs-detail-stats">
        ${stats.map(s => `
          <div class="cs-detail-stat-col">
            <div class="cs-detail-stat-label">${s.label}</div>
            <div class="cs-detail-stat-number">${s.val}</div>
          </div>
        `).join('')}
      </div>

      <div class="cs-highlight-header">Highlight Features</div>
      <div class="cs-highlight-row">
        <div class="cs-highlight-badge">
          <img class="cs-highlight-icon-img" src="${jobIcon}" alt="${r.job}" />
          <div class="cs-highlight-badge-value">Job:<br>${r.job}</div>
        </div>
        <div class="cs-highlight-badge">
          <img class="cs-highlight-icon-img" src="${raceIcon}" alt="${r.race}" />
          <div class="cs-highlight-badge-value">Race:<br>${r.race}</div>
        </div>
        ${expertise.entries.length === 1 ? `
        <div class="cs-highlight-badge">
          ${expertise.entries[0].icon
            ? `<img class="cs-highlight-icon-img" src="${asset(expertise.entries[0].icon)}" alt="" />`
            : `<div class="cs-highlight-icon">&#10022;</div>`}
          <div class="cs-highlight-badge-value">Weapon Skills:<br>${expertise.entries[0].name}</div>
        </div>` : ''}
      </div>
      ${expertise.entries.length > 1 ? `
      <div class="cs-highlight-row cs-highlight-row--expertise">
        ${expertise.entries.map(e => `
        <div class="cs-highlight-badge">
          ${e.icon ? `<img class="cs-highlight-icon-img" src="${asset(e.icon)}" alt="" />` : ''}
          <div class="cs-highlight-badge-value">${e.name}</div>
        </div>`).join('')}
      </div>` : ''}

      <div class="cs-detail-actions">
        <button class="cs-detail-recruit-btn ${isSelected ? 'is-selected' : ''} ${canAdd ? 'is-full' : ''}"
                data-detail-btn="${r.id}">
          ${isSelected ? '&#10003; Remove from Party' : 'Add to Party'}
        </button>
      </div>
    `;
  }

  charSelectScreen.innerHTML = `
    <div class="cs-layout">
      <div class="cs-body">
        <div class="cs-roster-col">
          <div class="cs-mini-grid">
            ${RECRUITS.map(miniCardHTML).join('')}
          </div>
        </div>
        
        <div class="cs-center-col" id="cs-video-container">
          <div class="cs-title-overlay">
            <h2 class="char-select-title">Choose Your Party</h2>
            <p class="char-select-subtitle">Select four heroes — front row fights, back row supports</p>
            <button id="quick-pick-btn" class="cs-quick-pick-btn">Quick Pick</button>
          </div>
          <video class="cs-detail-video" id="cs-main-video" autoplay loop muted playsinline style="display:none;"></video>
          <div class="cs-detail-empty" id="cs-empty-state">
            <video class="cs-detail-bg-video" autoplay loop muted playsinline>
              <source src="${asset('/videos/Haunted_Swamp_Dungeon.mp4')}" type="video/mp4" />
            </video>
            <div class="cs-detail-empty-prompt">
              <span class="cs-detail-empty-icon">⚔</span>
              Select a hero to view details
            </div>
          </div>
        </div>

        <div class="cs-right-col" id="cs-right-panel">
          <div class="cs-detail-info" id="cs-info-container">
            <!-- Hero details will be injected here -->
          </div>
          
          <div class="cs-party-corner" id="cs-party-corner">
            <div class="cs-corner-header">
              <div class="cs-party-hint" id="cs-party-hint">Select 4 heroes<br>to begin</div>
            </div>
            <div class="cs-corner-cards">
              <div class="cs-corner-card" data-slot="0"><span class="cs-corner-empty-icon">+</span></div>
              <div class="cs-corner-card" data-slot="1"><span class="cs-corner-empty-icon">+</span></div>
              <div class="cs-corner-card" data-slot="2"><span class="cs-corner-empty-icon">+</span></div>
              <div class="cs-corner-card" data-slot="3"><span class="cs-corner-empty-icon">+</span></div>
            </div>
            <button id="begin-adventure-btn">Enter Dungeon</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const miniCards = charSelectScreen.querySelectorAll('.cs-mini-card');
  const rightPanel = charSelectScreen.querySelector('#cs-right-panel');
  const infoContainer = charSelectScreen.querySelector('#cs-info-container');
  const mainVideo = charSelectScreen.querySelector('#cs-main-video');
  const emptyState = charSelectScreen.querySelector('#cs-empty-state');
  const cornerCards = charSelectScreen.querySelectorAll('.cs-corner-card');
  const beginBtn = charSelectScreen.querySelector('#begin-adventure-btn');
  const quickPickBtn = charSelectScreen.querySelector('#quick-pick-btn');

  function renderDetail(recruitId) {
    activeRecruitId = recruitId;
    const r = RECRUITS.find(x => x.id === recruitId);
    if (!r) return;
    
    // Update Video
    emptyState.style.display = 'none';
    mainVideo.style.display = 'block';
    const newSrc = getVideoSrc(r.image);
    // Only update if source changed to avoid flicker
    if (mainVideo.getAttribute('src') !== newSrc) {
      // Create a new source element
      mainVideo.innerHTML = `<source src="${newSrc}" type="video/mp4" />`;
      mainVideo.load();
      mainVideo.play().catch(e => console.warn('Hero video autoplay prevented', e));
    }
    
    // Update Info
    infoContainer.style.display = 'flex';
    infoContainer.innerHTML = detailHTML(r);

    miniCards.forEach(c =>
      c.classList.toggle('cc-active-view', c.dataset.recruitId === recruitId)
    );

    infoContainer.querySelector('[data-detail-btn]').addEventListener('click', () => {
      playSoundByUrl(asset('/sounds/select-member.mp3'), 0.4);
      toggleSelection(recruitId);
    });
  }

  function toggleSelection(id) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else if (selectedIds.size < 4) {
      selectedIds.add(id);
    }
    updateUI();
    if (activeRecruitId === id) renderDetail(id);
  }

  function updateUI() {
    const full = selectedIds.size >= 4;
    
    miniCards.forEach(card => {
      const id = card.dataset.recruitId;
      const isSelected = selectedIds.has(id);
      card.classList.toggle('cc-selected', isSelected);
      card.classList.toggle('cc-disabled', full && !isSelected);
    });

    const selectedArr = [...selectedIds];
    cornerCards.forEach((card, i) => {
      if (i < selectedArr.length) {
        const r = RECRUITS.find(x => x.id === selectedArr[i]);
        card.innerHTML = `<img src="${asset(r.image)}" alt="${r.name}" /><span class="cs-corner-name">${r.name}</span>`;
        card.classList.add('cs-slot-filled');
      } else {
        card.innerHTML = '<span class="cs-corner-empty-icon">+</span>';
        card.classList.remove('cs-slot-filled');
      }
    });

    const hint = charSelectScreen.querySelector('#cs-party-hint');
    if (hint) {
      const remaining = 4 - selectedIds.size;
      if (full) {
        hint.innerHTML = 'Party ready!';
      } else {
        hint.innerHTML = `${remaining} more hero slot${remaining !== 1 ? 's' : ''}!`;
      }
    }

    beginBtn.classList.toggle('ready', full);
    beginBtn.disabled = !full;
  }

  miniCards.forEach(card => {
    card.addEventListener('click', () => {
      playSoundByUrl(asset('/sounds/browse-member.mp3'), 0.4);
      renderDetail(card.dataset.recruitId);
    });
  });

  if (quickPickBtn) {
    quickPickBtn.addEventListener('click', () => {
      playSoundByUrl(asset('/sounds/party-confirmed.mp3'), 0.5);
      selectedIds.clear();
      // Paladin (recruit_2), Wardancer (recruit_7), White Mage (recruit_8), Wood Elf (recruit_1)
      const ids = ['recruit_2', 'recruit_7', 'recruit_8', 'recruit_1'];
      ids.forEach(id => selectedIds.add(id));
      updateUI();
      renderDetail('recruit_2');
    });
  }

  beginBtn.addEventListener('click', () => {
    if (selectedIds.size !== 4) return;
    playSoundByUrl(asset('/sounds/party-confirmed.mp3'), 0.5);
    for (const id of selectedIds) {
      const r = RECRUITS.find(x => x.id === id);
      if (r) recruitCharacter(r);
    }

    finishIntro();
  });
}

// ─────────────────────────────────────────────
//  TRAPPER'S MANUAL VIDEO OVERLAY
// ─────────────────────────────────────────────
const trapperOverlay = document.getElementById('trapper-video-overlay');
const trapperVideo = document.getElementById('trapper-video');
const skipTrapperBtn = document.getElementById('skip-trapper-btn');

window.playTrapperVideo = function (onComplete) {
  if (!trapperOverlay || !trapperVideo) {
    if (onComplete) onComplete();
    return;
  }
  let _cb = onComplete;
  trapperOverlay.classList.remove('hidden');

  function finishTrapperVideo() {
    trapperOverlay.style.opacity = '0';
    const startVol = trapperVideo.volume;
    const fadeInterval = setInterval(() => {
      if (trapperVideo.volume > 0.05) {
        trapperVideo.volume -= 0.05;
      } else {
        trapperVideo.volume = 0;
        clearInterval(fadeInterval);
      }
    }, 50);
    setTimeout(() => {
      trapperVideo.pause();
      clearInterval(fadeInterval);
      trapperVideo.volume = startVol;
      trapperOverlay.classList.add('hidden');
      if (_cb) { _cb(); _cb = null; }
    }, 1500);
  }

  if (skipTrapperBtn) skipTrapperBtn.onclick = (e) => { if (e) e.stopPropagation(); finishTrapperVideo(); };
  if (trapperVideo) trapperVideo.onended = finishTrapperVideo;

  setTimeout(() => {
    trapperOverlay.style.opacity = '1';
    trapperVideo.muted = false;
    trapperVideo.volume = 1;
    // ensure src is loaded if we use lazy loading
    if (trapperVideo.querySelector('source').dataset.src && !trapperVideo.querySelector('source').src) {
      trapperVideo.querySelector('source').src = window.asset ? window.asset(trapperVideo.querySelector('source').dataset.src) : trapperVideo.querySelector('source').dataset.src;
      trapperVideo.load();
    }
    trapperVideo.play().catch(e => {
      console.warn("Trapper video play failed:", e);
      finishTrapperVideo();
    });
  }, 50);
};

// ─────────────────────────────────────────────
//  OGRE VIDEO OVERLAY
// ─────────────────────────────────────────────
const ogreOverlay = document.getElementById('ogre-video-overlay');
const ogreVideo = document.getElementById('ogre-video');
const skipOgreBtn = document.getElementById('skip-ogre-btn');

function playOgreVideo() {
  if (!ogreOverlay || !ogreVideo) return;
  videoFlags.hasSeenOgreVideo = true;
  ogreOverlay.classList.remove('hidden');

  // Give the browser a moment to process the display change before animating opacity
  setTimeout(() => {
    ogreOverlay.style.opacity = '1';
    ogreVideo.muted = false;
    ogreVideo.volume = 1;
    ogreVideo.play().catch(e => {
      console.warn("Ogre video play failed:", e);
      finishOgreVideo();
    });
  }, 50);
}

function finishOgreVideo() {
  if (!ogreOverlay) return;
  ogreOverlay.style.opacity = '0';

  // Start the Ogre Room music as the video fades out — but not if we're in the
  // arena, where the ogre-video element is reused for the arena intro and the
  // arena music must keep playing.
  if (!window.arenaState.active) {
    setZoneMusic(asset('/sounds/backing/ogre-room.mp3'));
  }

  setTimeout(() => {
    ogreVideo.pause();
    ogreOverlay.classList.add('hidden');
  }, 1500);
}

if (skipOgreBtn) skipOgreBtn.addEventListener('click', (e) => { e.stopPropagation(); finishOgreVideo(); });
if (ogreVideo) ogreVideo.addEventListener('ended', finishOgreVideo);

// Expose so objects.js button handler can fire the video on gate open
window.playOgreVideo = playOgreVideo;

// ─────────────────────────────────────────────
//  NECTAR QUEST VIDEO OVERLAY
// ─────────────────────────────────────────────
const nectarQuestOverlay = document.getElementById('nectar-quest-video-overlay');
const nectarQuestVideo = document.getElementById('nectar-quest-video');
const skipNectarQuestBtn = document.getElementById('skip-nectar-quest-btn');
let _nectarQuestFading = false;

window.playNectarQuestVideo = function () {
  _nectarQuestFading = false;
  if (!nectarQuestOverlay || !nectarQuestVideo) return;
  nectarQuestVideo.currentTime = 0;
  nectarQuestVideo.volume = 1;
  nectarQuestOverlay.classList.remove('hidden');
  setTimeout(() => {
    nectarQuestOverlay.style.opacity = '1';
    nectarQuestVideo.play().catch(e => {
      console.warn('Nectar quest video play failed:', e);
      finishNectarQuestVideo();
    });
  }, 50);
};

function finishNectarQuestVideo() {
  if (!nectarQuestOverlay) return;
  _nectarQuestFading = true;
  nectarQuestOverlay.style.opacity = '0';
  const fadeInterval = setInterval(() => {
    if (nectarQuestVideo.volume > 0.05) {
      nectarQuestVideo.volume -= 0.05;
    } else {
      nectarQuestVideo.volume = 0;
      clearInterval(fadeInterval);
    }
  }, 50);
  setTimeout(() => {
    nectarQuestVideo.pause();
    clearInterval(fadeInterval);
    nectarQuestVideo.volume = 1;
    nectarQuestOverlay.classList.add('hidden');
    _nectarQuestFading = false;
  }, 1500);
}

if (skipNectarQuestBtn) skipNectarQuestBtn.addEventListener('click', (e) => { e.stopPropagation(); finishNectarQuestVideo(); });
if (nectarQuestVideo) {
  nectarQuestVideo.addEventListener('timeupdate', () => {
    if (!_nectarQuestFading && nectarQuestVideo.duration && nectarQuestVideo.currentTime >= nectarQuestVideo.duration - 2.5) {
      finishNectarQuestVideo();
    }
  });
}

// ─────────────────────────────────────────────
//  TREEMAN VIDEO OVERLAY
// ─────────────────────────────────────────────
const treemanOverlay = document.getElementById('treeman-video-overlay');
const treemanVideo = document.getElementById('treeman-video');
const skipTreemanBtn = document.getElementById('skip-treeman-btn');
let _treemanCallback = null;

window.playTreemanVideo = function (onComplete) {
  videoFlags.hasSeenTreemanVideo = true;
  _treemanCallback = onComplete;
  if (!treemanOverlay || !treemanVideo) {
    if (_treemanCallback) _treemanCallback();
    return;
  }
  treemanOverlay.classList.remove('hidden');

  setTimeout(() => {
    treemanOverlay.style.opacity = '1';
    treemanVideo.muted = false;
    treemanVideo.volume = 1;
    treemanVideo.play().catch(e => {
      console.warn("Treeman video play failed:", e);
      finishTreemanVideo();
    });
  }, 50);
};

function finishTreemanVideo() {
  if (!treemanOverlay) {
    if (_treemanCallback) _treemanCallback();
    return;
  }
  treemanOverlay.style.opacity = '0';

  // Fade out audio
  const startVol = treemanVideo.volume;
  const fadeInterval = setInterval(() => {
    if (treemanVideo.volume > 0.05) {
      treemanVideo.volume -= 0.05;
    } else {
      treemanVideo.volume = 0;
      clearInterval(fadeInterval);
    }
  }, 50);

  setTimeout(() => {
    treemanVideo.pause();
    clearInterval(fadeInterval);
    treemanVideo.volume = startVol; // Reset for next time
    treemanOverlay.classList.add('hidden');
    if (_treemanCallback) {
      _treemanCallback();
      _treemanCallback = null;
    }
  }, 1500);
}

if (skipTreemanBtn) skipTreemanBtn.addEventListener('click', (e) => { e.stopPropagation(); finishTreemanVideo(); });
if (treemanVideo) treemanVideo.addEventListener('ended', finishTreemanVideo);

// ─────────────────────────────────────────────
//  MUMMY VIDEO OVERLAY
// ─────────────────────────────────────────────
const mummyOverlay = document.getElementById('mummy-video-overlay');
const mummyVideo = document.getElementById('mummy-video');
const skipMummyBtn = document.getElementById('skip-mummy-btn');
let _mummyCallback = null;

window.playMummyVideo = function (onComplete) {
  _mummyCallback = onComplete;
  if (!mummyOverlay || !mummyVideo) {
    if (_mummyCallback) _mummyCallback();
    return;
  }
  mummyOverlay.classList.remove('hidden');

  setTimeout(() => {
    mummyOverlay.style.opacity = '1';
    mummyVideo.play().catch(e => {
      console.warn("Mummy video play failed:", e);
      finishMummyVideo();
    });
  }, 50);
};

function finishMummyVideo() {
  if (!mummyOverlay) {
    if (_mummyCallback) _mummyCallback();
    return;
  }
  mummyOverlay.style.opacity = '0';

  setTimeout(() => {
    mummyVideo.pause();
    mummyOverlay.classList.add('hidden');
    if (_mummyCallback) {
      _mummyCallback();
      _mummyCallback = null;
    }
  }, 1500);
}

if (skipMummyBtn) skipMummyBtn.addEventListener('click', (e) => { e.stopPropagation(); finishMummyVideo(); });
if (mummyVideo) mummyVideo.addEventListener('ended', finishMummyVideo);

// ─────────────────────────────────────────────
//  BATTLE PREP VIDEO OVERLAY
// ─────────────────────────────────────────────
const battlePrepOverlay = document.getElementById('battle-prep-video-overlay');
const battlePrepVideo = document.getElementById('battle-prep-video');
const skipBattlePrepBtn = document.getElementById('skip-battle-prep-btn');
let _battlePrepCallback = null;

window.playBattlePrepVideo = function (onComplete) {
  _battlePrepCallback = onComplete;
  if (!battlePrepOverlay || !battlePrepVideo) {
    if (_battlePrepCallback) _battlePrepCallback();
    return;
  }
  battlePrepOverlay.classList.remove('hidden');

  setTimeout(() => {
    battlePrepOverlay.style.opacity = '1';
    battlePrepVideo.play().catch(e => {
      console.warn("Battle prep video play failed:", e);
      finishBattlePrepVideo();
    });
  }, 50);
};

function finishBattlePrepVideo() {
  if (!battlePrepOverlay) {
    if (_battlePrepCallback) _battlePrepCallback();
    return;
  }
  battlePrepOverlay.style.opacity = '0';

  setTimeout(() => {
    battlePrepVideo.pause();
    battlePrepOverlay.classList.add('hidden');
    if (_battlePrepCallback) {
      _battlePrepCallback();
      _battlePrepCallback = null;
    }
    // Remove the option to drop party members after this dramatic event
    
  }, 1500);
}

if (skipBattlePrepBtn) skipBattlePrepBtn.addEventListener('click', (e) => { e.stopPropagation(); finishBattlePrepVideo(); });
if (battlePrepVideo) battlePrepVideo.addEventListener('ended', finishBattlePrepVideo);

// ─────────────────────────────────────────────
//  MINOTAUR VIDEO OVERLAY
// ─────────────────────────────────────────────
const minotaurOverlay = document.getElementById('minotaur-video-overlay');
const minotaurVideo = document.getElementById('minotaur-video');
const skipMinotaurBtn = document.getElementById('skip-minotaur-btn');
let _minotaurCallback = null;

window.playMinotaurVideo = function (onComplete) {
  _minotaurCallback = onComplete;
  if (!minotaurOverlay || !minotaurVideo) {
    if (_minotaurCallback) _minotaurCallback();
    return;
  }
  minotaurOverlay.classList.remove('hidden');

  setTimeout(() => {
    minotaurOverlay.style.opacity = '1';
    minotaurVideo.play().catch(e => {
      console.warn("Minotaur video play failed:", e);
      finishMinotaurVideo();
    });
  }, 50);
};

function finishMinotaurVideo() {
  if (!minotaurOverlay) {
    if (_minotaurCallback) _minotaurCallback();
    return;
  }
  minotaurOverlay.style.opacity = '0';

  setTimeout(() => {
    minotaurVideo.pause();
    minotaurOverlay.classList.add('hidden');
    if (_minotaurCallback) {
      _minotaurCallback();
      _minotaurCallback = null;
    }
  }, 1500);
}

if (skipMinotaurBtn) skipMinotaurBtn.addEventListener('click', (e) => { e.stopPropagation(); finishMinotaurVideo(); });
if (minotaurVideo) minotaurVideo.addEventListener('ended', finishMinotaurVideo);

// ─────────────────────────────────────────────
//  MINOTAUR DEATH VIDEO OVERLAY
// ─────────────────────────────────────────────
const minotaurDeathOverlay = document.getElementById('minotaur-death-video-overlay');
const minotaurDeathVideo = document.getElementById('minotaur-death-video');
const skipMinotaurDeathBtn = document.getElementById('skip-minotaur-death-btn');
let _minotaurDeathCallback = null;
let _minotaurDeathSafetyTimer = null;

window.playMinotaurDeathVideo = function (onComplete) {
  _minotaurDeathCallback = onComplete;
  if (!minotaurDeathOverlay || !minotaurDeathVideo) {
    if (_minotaurDeathCallback) _minotaurDeathCallback();
    return;
  }
  minotaurDeathOverlay.classList.remove('hidden');

  // Safety fallback: if the video never fires 'ended' (e.g. stalls mid-play),
  // force-close the overlay after 60 s so the game is never permanently blacked out.
  _minotaurDeathSafetyTimer = setTimeout(() => {
    console.warn("Minotaur death video safety timeout — forcing finish");
    finishMinotaurDeathVideo();
  }, 60000);

  setTimeout(() => {
    minotaurDeathOverlay.style.opacity = '1';
    minotaurDeathVideo.play().catch(e => {
      console.warn("Minotaur death video play failed:", e);
      finishMinotaurDeathVideo();
    });
  }, 50);
};

function finishMinotaurDeathVideo() {
  if (_minotaurDeathSafetyTimer) {
    clearTimeout(_minotaurDeathSafetyTimer);
    _minotaurDeathSafetyTimer = null;
  }
  if (!minotaurDeathOverlay) {
    if (_minotaurDeathCallback) _minotaurDeathCallback();
    return;
  }
  minotaurDeathOverlay.style.opacity = '0';

  setTimeout(() => {
    minotaurDeathVideo.pause();
    minotaurDeathVideo.currentTime = 0;
    minotaurDeathOverlay.classList.add('hidden');
    if (_minotaurDeathCallback) {
      _minotaurDeathCallback();
      _minotaurDeathCallback = null;
    }
  }, 1500);
}

if (skipMinotaurDeathBtn) skipMinotaurDeathBtn.addEventListener('click', (e) => { e.stopPropagation(); finishMinotaurDeathVideo(); });
if (minotaurDeathVideo) {
  minotaurDeathVideo.addEventListener('ended', finishMinotaurDeathVideo);
  minotaurDeathVideo.addEventListener('error', () => {
    console.warn("Minotaur death video error — forcing finish");
    finishMinotaurDeathVideo();
  });
}

// ─────────────────────────────────────────────
//  DEMON VIDEO OVERLAY
// ─────────────────────────────────────────────
const demonOverlay = document.getElementById('demon-video-overlay');
const demonVideo = document.getElementById('demon-video');
const skipDemonBtn = document.getElementById('skip-demon-btn');

window.playDemonVideo = playDemonVideo;
function playDemonVideo() {
  if (!demonOverlay || !demonVideo) return;
  demonOverlay.classList.remove('hidden');

  setTimeout(() => {
    demonOverlay.style.opacity = '1';
    demonVideo.muted = false;
    demonVideo.volume = 1;
    demonVideo.play().catch(e => {
      console.warn("Demon video play failed:", e);
      finishDemonVideo();
    });
  }, 50);
}

function finishDemonVideo() {
  if (!demonOverlay) return;
  demonOverlay.style.opacity = '0';

  const startVol = demonVideo.volume;
  const fadeInterval = setInterval(() => {
    if (demonVideo.volume > 0.05) {
      demonVideo.volume -= 0.05;
    } else {
      demonVideo.volume = 0;
      clearInterval(fadeInterval);
    }
  }, 50);

  setTimeout(() => {
    demonVideo.pause();
    clearInterval(fadeInterval);
    demonVideo.volume = startVol;
    demonOverlay.classList.add('hidden');
  }, 1500);
}

if (skipDemonBtn) skipDemonBtn.addEventListener('click', (e) => { e.stopPropagation(); finishDemonVideo(); });
if (demonVideo) demonVideo.addEventListener('ended', finishDemonVideo);

// ─────────────────────────────────────────────
//  CROW WIZARD VIDEO
// ─────────────────────────────────────────────
const crowWizardOverlay = document.getElementById('crow-wizard-video-overlay');
const crowWizardVideo = document.getElementById('crow-wizard-video');
const skipCrowWizardBtn = document.getElementById('skip-crow-wizard-btn');

function playCrowWizardVideo() {
  if (!crowWizardOverlay || !crowWizardVideo) return;
  crowWizardOverlay.classList.remove('hidden');

  setTimeout(() => {
    crowWizardOverlay.style.opacity = '1';
    crowWizardVideo.muted = false;
    crowWizardVideo.volume = 1;
    crowWizardVideo.play().catch(e => {
      console.warn("Crow Wizard video play failed:", e);
      finishCrowWizardVideo();
    });
  }, 50);
}

function finishCrowWizardVideo() {
  if (!crowWizardOverlay) return;
  crowWizardOverlay.style.opacity = '0';

  const startVol = crowWizardVideo.volume;
  const fadeInterval = setInterval(() => {
    if (crowWizardVideo.volume > 0.05) {
      crowWizardVideo.volume -= 0.05;
    } else {
      crowWizardVideo.volume = 0;
      clearInterval(fadeInterval);
    }
  }, 50);

  setTimeout(() => {
    crowWizardVideo.pause();
    clearInterval(fadeInterval);
    crowWizardVideo.volume = startVol;
    crowWizardOverlay.classList.add('hidden');
    window._crowWizardVideoDone = true;
  }, 1500);
}

if (skipCrowWizardBtn) skipCrowWizardBtn.addEventListener('click', (e) => { e.stopPropagation(); finishCrowWizardVideo(); });
if (crowWizardVideo) crowWizardVideo.addEventListener('ended', finishCrowWizardVideo);

// ─────────────────────────────────────────────
//  STATUE KNIGHTS VIDEO OVERLAY
// ─────────────────────────────────────────────
const statueKnightsOverlay = document.getElementById('statue-knights-video-overlay');
const statueKnightsVideo = document.getElementById('statue-knights-video');
const skipStatueKnightsBtn = document.getElementById('skip-statue-knights-btn');
let _statueKnightsCallback = null;

window.playStatueKnightsVideo = function (onComplete) {
  _statueKnightsCallback = onComplete;
  if (!statueKnightsOverlay || !statueKnightsVideo) {
    if (_statueKnightsCallback) _statueKnightsCallback();
    return;
  }
  statueKnightsVideo.currentTime = 0;
  statueKnightsVideo.volume = 1;
  statueKnightsOverlay.classList.remove('hidden');
  setTimeout(() => {
    statueKnightsOverlay.style.opacity = '1';
    statueKnightsVideo.play().catch(e => {
      console.warn('Statue knights video play failed:', e);
      finishStatueKnightsVideo();
    });
  }, 50);
};

function finishStatueKnightsVideo() {
  if (!statueKnightsOverlay) {
    if (_statueKnightsCallback) _statueKnightsCallback();
    return;
  }
  statueKnightsOverlay.style.opacity = '0';

  const startVol = statueKnightsVideo.volume;
  const fadeInterval = setInterval(() => {
    if (statueKnightsVideo.volume > 0.05) {
      statueKnightsVideo.volume -= 0.05;
    } else {
      statueKnightsVideo.volume = 0;
      clearInterval(fadeInterval);
    }
  }, 50);

  setTimeout(() => {
    statueKnightsVideo.pause();
    clearInterval(fadeInterval);
    statueKnightsVideo.volume = startVol;
    statueKnightsOverlay.classList.add('hidden');
    if (_statueKnightsCallback) {
      _statueKnightsCallback();
      _statueKnightsCallback = null;
    }
  }, 1500);
}

if (skipStatueKnightsBtn) skipStatueKnightsBtn.addEventListener('click', (e) => { e.stopPropagation(); finishStatueKnightsVideo(); });
if (statueKnightsVideo) statueKnightsVideo.addEventListener('ended', finishStatueKnightsVideo);

// ─────────────────────────────────────────────
//  OTTER VIDEO SEQUENCE
// ─────────────────────────────────────────────
window.playOtterVideoSequence = function() {
  const ogreOverlay = document.getElementById('demon-ogre-video-overlay');
  const ogreVid = document.getElementById('demon-ogre-video');
  const lizardOverlay = document.getElementById('lizard-man-video-overlay');
  const lizardVid = document.getElementById('lizard-man-video');

  if (!ogreOverlay || !ogreVid || !lizardOverlay || !lizardVid) return;

  function playLizard() {
    lizardOverlay.classList.remove('hidden');
    setTimeout(() => {
      lizardOverlay.style.opacity = '1';
      lizardVid.play().catch(console.warn);
    }, 50);
  }

  function finishLizard() {
    lizardOverlay.style.opacity = '0';
    setTimeout(() => {
      lizardVid.pause();
      lizardOverlay.classList.add('hidden');
    }, 500);
  }
  document.getElementById('skip-lizard-man-btn').onclick = (e) => { if (e) e.stopPropagation(); finishLizard(); };
  lizardVid.onended = finishLizard;

  function finishOgre() {
    ogreOverlay.style.opacity = '0';
    setTimeout(() => {
      ogreVid.pause();
      ogreOverlay.classList.add('hidden');
      setTimeout(playLizard, 1000); // Followed a second later
    }, 500);
  }
  document.getElementById('skip-demon-ogre-btn').onclick = (e) => { if (e) e.stopPropagation(); finishOgre(); };
  ogreVid.onended = finishOgre;

  ogreOverlay.classList.remove('hidden');
  setTimeout(() => {
    ogreOverlay.style.opacity = '1';
    ogreVid.play().catch(console.warn);
  }, 50);
};

// ─────────────────────────────────────────────
//  ARENA INTRO VIDEO
// ─────────────────────────────────────────────
const _ARENA_INTRO_VIDEOS = {
  'demon_ogre':        { overlay: 'demon-ogre-video-overlay',            video: 'demon-ogre-video',            skip: 'skip-demon-ogre-btn',            src: '/videos/demon-ogre.mp4' },
  'lizardMan':         { overlay: 'lizard-man-video-overlay',            video: 'lizard-man-video',            skip: 'skip-lizard-man-btn',            src: '/videos/lizard-man.mp4' },
  'ogre':              { overlay: 'ogre-arena-video-overlay',            video: 'ogre-arena-video',            skip: 'skip-ogre-arena-btn',            src: '/videos/ogre.mp4' },
  'aqua_man':          { overlay: 'aqua-man-arena-video-overlay',        video: 'aqua-man-arena-video',        skip: 'skip-aqua-man-arena-btn',        src: '/videos/aqua-man-arena.mp4' },
  'crocodile_warrior': { overlay: 'crocodile-warrior-arena-video-overlay', video: 'crocodile-warrior-arena-video', skip: 'skip-crocodile-warrior-arena-btn', src: '/videos/crocodile-warrior-arena.mp4' },
  'crow_wizard':       { overlay: 'crow-wizard-arena-video-overlay',     video: 'crow-wizard-arena-video',     skip: 'skip-crow-wizard-arena-btn',     src: '/videos/crow-wizard-arena.mp4' },
  'demon':             { overlay: 'demon-arena-video-overlay',           video: 'demon-arena-video',           skip: 'skip-demon-arena-btn',           src: '/videos/demon-arena.mp4' },
  'minotaur':          { overlay: 'minotaur-arena-video-overlay',        video: 'minotaur-arena-video',        skip: 'skip-minotaur-arena-btn',        src: '/videos/minotaur-arena.mp4' },
  'giant':             { overlay: 'giant-arena-video-overlay',           video: 'giant-arena-video',           skip: 'skip-giant-arena-btn',           src: '/videos/giant-arena.mp4' },
  'treeman':           { overlay: 'treeman-arena-video-overlay',         video: 'treeman-arena-video',         skip: 'skip-treeman-arena-btn',         src: '/videos/treeman-arena.mp4' },
  'iron_warden':       { overlay: 'iron-warden-arena-video-overlay',      video: 'iron-warden-arena-video',      skip: 'skip-iron-warden-arena-btn',      src: '/videos/iron-warden-arena.mp4' },
};

function _playArenaIntroVideo(monsterId, onFinish) {
  const cfg = _ARENA_INTRO_VIDEOS[monsterId];
  if (!cfg) { onFinish?.(); return; }
  const overlay = document.getElementById(cfg.overlay);
  const vid     = document.getElementById(cfg.video);
  const skipBtn = document.getElementById(cfg.skip);
  if (!overlay || !vid) { onFinish?.(); return; }

  function finish() {
    overlay.style.opacity = '0';
    setTimeout(() => {
      vid.pause();
      overlay.classList.add('hidden');
      onFinish?.();
    }, 500);
    if (skipBtn) skipBtn.onclick = null;
    vid.onended = null;
  }

  // Set the src directly (same approach as arena music) and load
  vid.src = asset(cfg.src);
  vid.load();

  if (skipBtn) skipBtn.onclick = (e) => { if (e) e.stopPropagation(); finish(); };
  vid.onended = finish;

  overlay.classList.remove('hidden');

  function startPlayback() {
    overlay.style.opacity = '1';
    vid.play().catch(console.warn);
  }

  vid.addEventListener('canplay', () => setTimeout(startPlayback, 50), { once: true });
}

// ─────────────────────────────────────────────
//  AQUA MAN VIDEO OVERLAY
// ─────────────────────────────────────────────
const aquaManOverlay = document.getElementById('aqua-man-video-overlay');
const aquaManVideo = document.getElementById('aqua-man-video');
const skipAquaManBtn = document.getElementById('skip-aqua-man-btn');

function playAquaManVideo(onComplete) {
  if (!aquaManOverlay || !aquaManVideo) {
    if (onComplete) onComplete();
    return;
  }
  let _cb = onComplete;
  aquaManOverlay.classList.remove('hidden');

  function finishAquaManVideo() {
    aquaManOverlay.style.opacity = '0';
    const startVol = aquaManVideo.volume;
    const fadeInterval = setInterval(() => {
      if (aquaManVideo.volume > 0.05) {
        aquaManVideo.volume -= 0.05;
      } else {
        aquaManVideo.volume = 0;
        clearInterval(fadeInterval);
      }
    }, 50);
    setTimeout(() => {
      aquaManVideo.pause();
      clearInterval(fadeInterval);
      aquaManVideo.volume = startVol;
      aquaManOverlay.classList.add('hidden');
      if (_cb) { _cb(); _cb = null; }
    }, 1500);
  }

  if (skipAquaManBtn) skipAquaManBtn.onclick = (e) => { if (e) e.stopPropagation(); finishAquaManVideo(); };
  if (aquaManVideo) aquaManVideo.onended = finishAquaManVideo;

  setTimeout(() => {
    aquaManOverlay.style.opacity = '1';
    setZoneMusic(asset('/sounds/water.mp3'));
    aquaManVideo.play().catch(e => {
      console.warn("Aqua Man video play failed:", e);
      finishAquaManVideo();
    });
  }, 50);
}
window.playAquaManVideo = playAquaManVideo;

// ─────────────────────────────────────────────
//  GIANT VIDEO OVERLAY
// ─────────────────────────────────────────────
const giantOverlay = document.getElementById('giant-video-overlay');
const giantVideo = document.getElementById('giant-video');
const skipGiantBtn = document.getElementById('skip-giant-btn');

function playGiantVideo(onComplete) {
  if (!giantOverlay || !giantVideo) {
    if (onComplete) onComplete();
    return;
  }
  let _cb = onComplete;
  giantOverlay.classList.remove('hidden');

  function finishGiantVideo() {
    giantOverlay.style.opacity = '0';
    const startVol = giantVideo.volume;
    const fadeInterval = setInterval(() => {
      if (giantVideo.volume > 0.05) {
        giantVideo.volume -= 0.05;
      } else {
        giantVideo.volume = 0;
        clearInterval(fadeInterval);
      }
    }, 50);
    setTimeout(() => {
      giantVideo.pause();
      clearInterval(fadeInterval);
      giantVideo.volume = startVol;
      giantOverlay.classList.add('hidden');
      if (_cb) { _cb(); _cb = null; }
    }, 1500);
  }

  if (skipGiantBtn) skipGiantBtn.onclick = (e) => { if (e) e.stopPropagation(); finishGiantVideo(); };
  if (giantVideo) giantVideo.onended = finishGiantVideo;

  setTimeout(() => {
    giantOverlay.style.opacity = '1';
    giantVideo.play().catch(e => {
      console.warn("Giant video play failed:", e);
      finishGiantVideo();
    });
  }, 50);
}
window.playGiantVideo = playGiantVideo;


// ─────────────────────────────────────────────
//  STAIRS VIDEO OVERLAY
// ─────────────────────────────────────────────
const stairsOverlay = document.getElementById('stairs-video-overlay');
const stairsVideoElement = document.getElementById('stairs-video');
const skipStairsBtn = document.getElementById('skip-stairs-btn');
let _stairsVideoCallback = null;

window.playStairsVideo = function (onComplete) {
  _stairsVideoCallback = onComplete;
  if (!stairsOverlay || !stairsVideoElement) {
    if (_stairsVideoCallback) _stairsVideoCallback();
    return;
  }
  stairsOverlay.classList.remove('hidden');
  // Set opacity immediately (the 1.5s transition will still apply from 0 to 1,
  // but starting it now ensures the black background covers the scene ASAP)
  stairsOverlay.style.opacity = '1';

  stairsVideoElement.play().catch(e => {
    console.warn("Stairs video play failed:", e);
    finishStairsVideo();
  });
}

function finishStairsVideo() {
  if (!stairsOverlay) {
    if (_stairsVideoCallback) _stairsVideoCallback();
    return;
  }
  stairsOverlay.style.opacity = '0';

  setTimeout(() => {
    stairsVideoElement.pause();
    stairsOverlay.classList.add('hidden');
    if (_stairsVideoCallback) {
      _stairsVideoCallback();
      _stairsVideoCallback = null;
    }
  }, 1500);
}

if (skipStairsBtn) skipStairsBtn.addEventListener('click', (e) => { e.stopPropagation(); finishStairsVideo(); });
if (stairsVideoElement) stairsVideoElement.addEventListener('ended', finishStairsVideo);

// ─────────────────────────────────────────────
//  EGG TRANSPORT VIDEO OVERLAY
// ─────────────────────────────────────────────
const eggVideoOverlay = document.getElementById('egg-video-overlay');
const eggVideoElement = document.getElementById('egg-video');
const skipEggBtn = document.getElementById('skip-egg-btn');
let _eggVideoCallback = null;

window.playEggVideo = function (onComplete) {
  _eggVideoCallback = onComplete;
  if (!eggVideoOverlay || !eggVideoElement) {
    if (_eggVideoCallback) _eggVideoCallback();
    return;
  }
  eggVideoOverlay.classList.remove('hidden');
  eggVideoOverlay.style.opacity = '1';

  eggVideoElement.play().catch(e => {
    console.warn("Egg video play failed:", e);
    finishEggVideo();
  });
};

function finishEggVideo() {
  if (!eggVideoOverlay) {
    if (_eggVideoCallback) _eggVideoCallback();
    return;
  }
  eggVideoOverlay.style.opacity = '0';

  setTimeout(() => {
    eggVideoElement.pause();
    eggVideoElement.currentTime = 0;
    eggVideoOverlay.classList.add('hidden');
    if (_eggVideoCallback) {
      _eggVideoCallback();
      _eggVideoCallback = null;
    }
  }, 1500);
}

if (skipEggBtn) skipEggBtn.addEventListener('click', (e) => { e.stopPropagation(); finishEggVideo(); });
if (eggVideoElement) eggVideoElement.addEventListener('ended', finishEggVideo);

// ─────────────────────────────────────────────
//  HALL OF HEROES VIDEO OVERLAY
// ─────────────────────────────────────────────
const heroDoorVideoOverlay = document.getElementById('hero-door-video-overlay');
const heroDoorVideoElement = document.getElementById('hero-door-video');
const skipHeroDoorBtn = document.getElementById('skip-hero-door-btn');
let _heroDoorVideoCallback = null;

window.playHeroDoorVideo = function (onComplete) {
  _heroDoorVideoCallback = onComplete;
  if (!heroDoorVideoOverlay || !heroDoorVideoElement) {
    if (_heroDoorVideoCallback) _heroDoorVideoCallback();
    return;
  }
  heroDoorVideoOverlay.classList.remove('hidden');
  heroDoorVideoOverlay.style.opacity = '1';

  heroDoorVideoElement.play().catch(e => {
    console.warn("Hero door video play failed:", e);
    finishHeroDoorVideo();
  });
};

function finishHeroDoorVideo() {
  if (!heroDoorVideoOverlay) {
    if (_heroDoorVideoCallback) _heroDoorVideoCallback();
    return;
  }
  
  // Hide the video overlay and pause the video
  heroDoorVideoOverlay.style.opacity = '0';
  setTimeout(() => {
    heroDoorVideoOverlay.classList.add('hidden');
    heroDoorVideoElement.pause();
    heroDoorVideoElement.currentTime = 0;
  }, 1500);

  // Show the level loading overlay with a progress bar
  const overlay = document.getElementById('level-load-overlay');
  const fill = document.getElementById('level-load-bar-fill');
  const text = document.getElementById('level-load-text');
  
  if (overlay && fill) {
    if (text) text.textContent = 'Entering the Hall of Heroes\u2026';
    fill.style.transition = 'none';
    fill.style.width = '0%';
    overlay.classList.add('visible');
    
    // Smooth progress bar over 3 seconds
    requestAnimationFrame(() => {
      fill.style.transition = 'width 3s linear';
      fill.style.width = '100%';
    });

    setTimeout(() => {
      overlay.classList.remove('visible');
      if (_heroDoorVideoCallback) {
        _heroDoorVideoCallback();
        _heroDoorVideoCallback = null;
      }
      // Reset bar for future reuse after the fade-out
      setTimeout(() => {
        fill.style.transition = 'none';
        fill.style.width = '0%';
      }, 500);
    }, 3200);
  } else {
    // Fallback if overlay elements aren't found
    if (_heroDoorVideoCallback) {
      _heroDoorVideoCallback();
      _heroDoorVideoCallback = null;
    }
  }
}

if (skipHeroDoorBtn) skipHeroDoorBtn.addEventListener('click', (e) => { e.stopPropagation(); finishHeroDoorVideo(); });
if (heroDoorVideoElement) heroDoorVideoElement.addEventListener('ended', finishHeroDoorVideo);

// ─────────────────────────────────────────────
//  PORTAL VIDEO OVERLAY
// ─────────────────────────────────────────────
const portalOverlay = document.getElementById('portal-video-overlay');
const portalVideo = document.getElementById('portal-video');
const skipPortalBtn = document.getElementById('skip-portal-btn');
let _portalCallback = null;

window.playPortalVideo = function (onComplete) {
  _portalCallback = onComplete;
  if (!portalOverlay || !portalVideo) {
    if (_portalCallback) _portalCallback();
    return;
  }
  portalOverlay.classList.remove('hidden');

  setTimeout(() => {
    portalOverlay.style.opacity = '1';
    portalVideo.play().catch(e => {
      console.warn("Portal video play failed:", e);
      finishPortalVideo();
    });
  }, 50);
};

function _showLevelTitle(levelNum) {
  const overlay = document.getElementById('level-title-overlay');
  const text = document.getElementById('level-title-text');
  if (!overlay || !text) return;
  text.textContent = LEVEL_NAMES[levelNum] ?? `Level ${levelNum}`;
  overlay.classList.remove('hidden');
  // Force reflow so the transition fires
  overlay.getBoundingClientRect();
  overlay.classList.add('visible');
  playSoundByUrl(asset('/sounds/new-level.mp3'), 1.0);
  // Hold for 2s then fade out
  setTimeout(() => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 800);
  }, 2000);
}
// Expose for cross-module use (save-load uses it to announce the loaded level).
window._showLevelTitle = _showLevelTitle;

function finishPortalVideo() {
  if (!portalOverlay) {
    if (_portalCallback) _portalCallback();
    return;
  }

  // Fire the level transition immediately so the new level loads under the overlay.
  // The overlay then fades out to reveal the new level, not the old one.
  if (_portalCallback) {
    // Mark before callback so we can detect the new level number after
    const prevLevel = window.currentLevel;
    _portalCallback();
    _portalCallback = null;
    // After loadLevel fires, window.currentLevel is the new level
    const newLevel = window.currentLevel;
    if (newLevel !== prevLevel && !_portalVisitedLevels.has(newLevel)) {
      _portalVisitedLevels.add(newLevel);
      // Show announcement once the portal overlay finishes fading out
      setTimeout(() => _showLevelTitle(newLevel), 1500);
    }
  }

  portalVideo.pause();
  portalOverlay.style.opacity = '0';
  setTimeout(() => {
    portalOverlay.classList.add('hidden');
  }, 1500);
}

if (skipPortalBtn) skipPortalBtn.addEventListener('click', (e) => { e.stopPropagation(); finishPortalVideo(); });
if (portalVideo) portalVideo.addEventListener('ended', finishPortalVideo);

// ─────────────────────────────────────────────
//  STATUE PORTAL VIDEO OVERLAY
// ─────────────────────────────────────────────
const statuePortalOverlay = document.getElementById('statue-portal-video-overlay');
const statuePortalVideo = document.getElementById('statue-portal-video');
const skipStatuePortalBtn = document.getElementById('skip-statue-portal-btn');
let _statuePortalCallback = null;

window.playStatuePortalVideo = function (onComplete) {
  _statuePortalCallback = onComplete;
  if (!statuePortalOverlay || !statuePortalVideo) {
    if (_statuePortalCallback) _statuePortalCallback();
    return;
  }
  statuePortalOverlay.classList.remove('hidden');

  setTimeout(() => {
    statuePortalOverlay.style.opacity = '1';
    statuePortalVideo.play().catch(e => {
      console.warn("Statue portal video play failed:", e);
      finishStatuePortalVideo();
    });
  }, 50);
};

function finishStatuePortalVideo() {
  if (!statuePortalOverlay) {
    if (_statuePortalCallback) _statuePortalCallback();
    return;
  }
  statuePortalOverlay.style.opacity = '0';

  setTimeout(() => {
    statuePortalVideo.pause();
    statuePortalOverlay.classList.add('hidden');
    if (_statuePortalCallback) {
      _statuePortalCallback();
      _statuePortalCallback = null;
    }
  }, 1500);
}

if (skipStatuePortalBtn) skipStatuePortalBtn.addEventListener('click', (e) => { e.stopPropagation(); finishStatuePortalVideo(); });
if (statuePortalVideo) statuePortalVideo.addEventListener('ended', finishStatuePortalVideo);

// ─────────────────────────────────────────────
//  CRYSTAL SHRINE VIDEO OVERLAYS
// ─────────────────────────────────────────────
const crystalShrineRedOverlay = document.getElementById('crystal-shrine-red-video-overlay');
const crystalShrineRedVideo = document.getElementById('crystal-shrine-red-video');
const skipCrystalShrineRedBtn = document.getElementById('skip-crystal-shrine-red-btn');
let _crystalShrineRedCallback = null;

window.playCrystalShrineRedVideo = function (onComplete) {
  _crystalShrineRedCallback = onComplete;
  if (!crystalShrineRedOverlay || !crystalShrineRedVideo) {
    if (_crystalShrineRedCallback) _crystalShrineRedCallback();
    return;
  }
  crystalShrineRedOverlay.classList.remove('hidden');
  setTimeout(() => {
    crystalShrineRedOverlay.style.opacity = '1';
    crystalShrineRedVideo.play().catch(e => {
      console.warn("Crystal shrine red video play failed:", e);
      finishCrystalShrineRedVideo();
    });
  }, 50);
};

function finishCrystalShrineRedVideo() {
  if (!crystalShrineRedOverlay) {
    if (_crystalShrineRedCallback) _crystalShrineRedCallback();
    return;
  }
  crystalShrineRedOverlay.style.opacity = '0';
  setTimeout(() => {
    crystalShrineRedVideo.pause();
    crystalShrineRedOverlay.classList.add('hidden');
    if (_crystalShrineRedCallback) {
      _crystalShrineRedCallback();
      _crystalShrineRedCallback = null;
    }
  }, 1500);
}

if (skipCrystalShrineRedBtn) skipCrystalShrineRedBtn.addEventListener('click', (e) => { e.stopPropagation(); finishCrystalShrineRedVideo(); });
if (crystalShrineRedVideo) crystalShrineRedVideo.addEventListener('ended', finishCrystalShrineRedVideo);

const crystalShrineRedBlueOverlay = document.getElementById('crystal-shrine-red-blue-video-overlay');
const crystalShrineRedBlueVideo = document.getElementById('crystal-shrine-red-blue-video');
const skipCrystalShrineRedBlueBtn = document.getElementById('skip-crystal-shrine-red-blue-btn');
let _crystalShrineRedBlueCallback = null;

window.playCrystalShrineRedBlueVideo = function (onComplete) {
  _crystalShrineRedBlueCallback = onComplete;
  if (!crystalShrineRedBlueOverlay || !crystalShrineRedBlueVideo) {
    if (_crystalShrineRedBlueCallback) _crystalShrineRedBlueCallback();
    return;
  }
  crystalShrineRedBlueOverlay.classList.remove('hidden');
  setTimeout(() => {
    crystalShrineRedBlueOverlay.style.opacity = '1';
    crystalShrineRedBlueVideo.play().catch(e => {
      console.warn("Crystal shrine red+blue video play failed:", e);
      finishCrystalShrineRedBlueVideo();
    });
  }, 50);
};

function finishCrystalShrineRedBlueVideo() {
  if (!crystalShrineRedBlueOverlay) {
    if (_crystalShrineRedBlueCallback) _crystalShrineRedBlueCallback();
    return;
  }
  crystalShrineRedBlueOverlay.style.opacity = '0';
  setTimeout(() => {
    crystalShrineRedBlueVideo.pause();
    crystalShrineRedBlueOverlay.classList.add('hidden');
    if (_crystalShrineRedBlueCallback) {
      _crystalShrineRedBlueCallback();
      _crystalShrineRedBlueCallback = null;
    }
  }, 1500);
}

if (skipCrystalShrineRedBlueBtn) skipCrystalShrineRedBlueBtn.addEventListener('click', (e) => { e.stopPropagation(); finishCrystalShrineRedBlueVideo(); });
if (crystalShrineRedBlueVideo) crystalShrineRedBlueVideo.addEventListener('ended', finishCrystalShrineRedBlueVideo);

function handleFirstInteraction() {
  window.removeEventListener('mousedown', handleFirstInteraction);
  window.removeEventListener('click', handleFirstInteraction);
  window.removeEventListener('keydown', handleFirstInteraction);
  return playThemeTune();
}

// ─────────────────────────────────────────────
//  LEVEL LOADING
// ─────────────────────────────────────────────

// In-memory only — tracks which levels have had their "announce on portal" title
// overlay shown, so we don't show it repeatedly on re-entry within a single session.
let _portalVisitedLevels = new Set();

window.loadLevel = function (levelNum) {
  // Lazily load videos needed for this level
  loadVideosForLevel(levelNum);

  // First-ever entry into level 1: show a black loading screen for 10 seconds
  // so the GLB assets have time to stream in before the player sees anything.
  if (levelNum === 1 && !videoFlags.hasSeenL1Intro) {
    videoFlags.hasSeenL1Intro = true;
    const overlay = document.getElementById('level-load-overlay');
    const fill = document.getElementById('level-load-bar-fill');
    // Show overlay immediately
    if (overlay) overlay.classList.add('visible');
    // Kick off progress bar on next frame so the transition triggers properly
    requestAnimationFrame(() => {
      if (fill) {
        fill.style.transition = 'width 10s linear';
        fill.style.width = '100%';
      }
    });
    // After 10 s, hide the overlay
    setTimeout(() => {
      if (overlay) overlay.classList.remove('visible');
      setTimeout(() => {
        if (fill) {
          fill.style.transition = 'none';
          fill.style.width = '0%';
        }
      }, 400);
    }, 10000);
  }

  const oldLevel = window.currentLevel;

  // Snapshot the starter-stash contents before L0 is torn down so its state
  // survives across level visits. Skipped during a save-load: the stash mesh
  // currently in the scene is the init-time spawn with default contents, and
  // applySavePostInit has already loaded the correct `_persistedStarterStashItems`
  // — snapshotting now would clobber the saved data with the defaults.
  if (oldLevel === 0 && levelNum !== 0 && !window._isRestoring) {
    snapshotStarterStash();
  }

  // Top up the potion merchant on first entry to each new dungeon level.
  if (levelNum >= 1 && levelNum <= 5) {
    const prevReached = window.currentLevelReached ?? 0;
    if (levelNum > prevReached) {
      const gained = levelNum - prevReached;
      window.currentLevelReached = levelNum;
      for (let i = 0; i < gained; i++) replenishPotionMerchant(2);
    }
  }

  window.currentLevel = levelNum;

  // Switch ambient music to match the new level
  setAmbientLevel(levelNum);

  // Apply per-level lighting palette (ambient/fog/fill colors)
  applyLevelTheme(scene, lights, levelNum);

  // 1. Swap Map Array
  const maps = [level0Map, level1Map, level2Map, level3Map, level4Map, level5Map];
  maps[SCHEMATIC_TRIALS_LEVEL] = schematicTrialsMap;
  changeMapArray(maps[levelNum] ?? level0Map);

  // 2. Rebuild map meshes for walls/floors
  buildLevel(scene);

  // Level 1: ogre room (rows 0–6, cols 0–6, NW corner) uses ogre-wall texture
  if (levelNum === 1) {
    buildTextureZone(
      scene,
      [
        [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],
        [1,0],[1,6],
        [2,0],[2,6],
        [3,0],[3,6],
        [4,0],[4,6],
        [5,0],[5,6],
        [6,0],[6,2],[6,3],[6,4],[6,5],[6,6],
      ],
      [],
      asset('/textures/ogre-wall.webp'),
      null
    );

    // Level 1: Mushroom area (inner walls only)
    const mFloors = [
      [11,11], [11,12], [11,13],
      [12,11], [12,12], [12,13],
      [13,12], [14,12],
      [15,9], [15,10], [15,11], [15,12], [15,13], [15,14],
      [16,9], [17,9], [18,9], [19,9],
      [16,13], [17,11], [17,12], [17,13], [18,11], [19,11], [19,12], [19,13]
    ];
    buildFloorZone(
      scene,
      mFloors,
      asset('/textures/fungal-floor.webp')
    );
    buildInnerTextureZone(
      scene,
      mFloors,
      asset('/textures/fungus-wall.webp')
    );
  }

  // Level 2: overlay pit-corridor (rows 37–41, col 3) with wet-wall / black-stone textures
  if (levelNum === 2) {
    buildTextureZone(
      scene,
      // Wall cells: left col (2) and right col (4) flanking the corridor, plus north cap
      [
        [36, 12], [37, 12], [38, 12], [39, 12], [40, 12], [41, 12],
        [36, 14], [37, 14], [38, 14], [39, 14], [40, 14], [41, 14],
        [36, 13],
      ],
      // Floor cells: the walkable corridor column
      [[37, 13], [38, 13], [39, 13], [40, 13], [41, 13]],
      asset('/textures/wet-wall.webp'),
      asset('/textures/black-stone2.webp')
    );

    // Level 2: Crow Wizard room (rows 7–9, cols 20–25) + approach corridor (row 8, cols 15–19)
    // + north exit corridor (col 24, rows 4–6) + annex room (rows 1–3, cols 22–26)
    buildTextureZone(
      scene,
      [
        // approach corridor walls
        [7, 25],[7, 26],[7, 27],[7, 28],[7, 29],
        [9, 25],[9, 26],[9, 27],[9, 28],[9, 29],
        // crow room perimeter ([6, 34] omitted — now the north doorway)
        [6, 30],[6, 31],[6, 32],[6, 33],[6, 35],
        [10, 30],[10, 31],[10, 32],[10, 33],[10, 34],[10, 35],
        [7, 36],[8, 36],[9, 36],
        // north exit corridor sides (col 24, rows 4–6)
        [4, 33],[4, 35],
        [5, 33],[5, 35],
        // annex room perimeter
        [0, 32],[0, 33],[0, 34],[0, 35],[0, 36],   // north (map edge)
        [1, 31],[2, 31],[3, 31],                  // west wall
        [1, 37],[2, 37],[3, 37],                  // east wall
        [3, 32],[3, 33],[3, 35],[3, 36],           // south wall (doorway at [3, 34])
      ],
      [],
      asset('/textures/crow-wall.webp'),
      null
    );

    // Level 2: Iron Warden room (cols 7-9, rows 3-5) + chest room behind portcullis (cols 3-5, rows 3-5)
    buildFloorZone(
      scene,
      [
        [3,3],[3,4],[3,5],   [3,7],[3,8],[3,9],
        [4,3],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],
        [5,3],[5,4],[5,5],   [5,7],[5,8],[5,9],
      ],
      asset('/textures/swamp-floor.png'),
      'swamp'
    );

    // Level 2: Ice area (inner walls only)
    const iceFloors = [
      [7, 12], [7, 13], [7, 14], [7, 19], [7, 20], [7, 21], [7, 22], [7, 23], [7, 24],
      [8, 12], [8, 13], [8, 14], [8, 15], [8, 16], [8, 17], [8, 18], [8, 19], [8, 20], [8, 21], [8, 22], [8, 23], [8, 24],
      [9, 12], [9, 13], [9, 14], [9, 19], [9, 20], [9, 21], [9, 22], [9, 23], [9, 24],
      // Ice gauntlet: corridor south of mushroom room and reward room with chest
      [10, 13], [11, 13], [12, 13], [13, 13],
      [14, 12], [14, 13], [14, 14]
    ];
    buildFloorZone(
      scene,
      iceFloors,
      asset('/textures/dungeon-ice-floor.webp')
    );
    buildInnerTextureZone(
      scene,
      iceFloors,
      asset('/textures/ice-wall.webp')
    );
  }

  // Level 4: demon-wall / black-stone2 textures cover all areas EXCEPT the
  // entry room (rows 12–15, cols 6–14) which uses default stone/floor textures.
  //
  // Zones covered:
  //   rows  0–11  all cols          — vault, passage, east boss room, east connector
  //   rows 12–16  cols 0–2          — west connector corridor (narrow south tunnel)
  //   rows 17–26  cols 0–11         — west boss room (Lizard Man lair) + its perimeter walls
  //   all rows    cols 15+          — eastern walls and extended boundary walls
  if (levelNum === 4) {
    const wallCells = [];
    const floorCells = [];
    level4Map.forEach((row, r) => row.forEach((cell, c) => {
      const inNorthZone     = r <= 11;
      const inWestConnector = r >= 12 && r <= 16 && c <= 2;
      const inWestBossRoom  = r >= 17 && r <= 26 && c <= 11;
      const inEastZone      = c >= 15;
      if (inNorthZone || inWestConnector || inWestBossRoom || inEastZone) {
        if (cell === 1 || cell === 7) wallCells.push([r, c]);
        else if (cell !== CELL_HOLE) floorCells.push([r, c]);
      }
    }));
    buildTextureZone(scene, wallCells, floorCells,
      asset('/textures/demon-wall.webp'),
      asset('/textures/black-stone2.webp')
    );
  }

  // 3. Clear and respawn level objects
  clearObjects(scene);
  spawnObjectsForLevel();
  updateRecruitsMeshState();

  // 5. Load monster models for this level (skips dead monsters)
  loadMonstersForLevel(scene, levelNum);

  // 4. Move player to start of new map
  const start = findCell(CELL_START);
  player.gridRow = start.row;
  player.gridCol = start.col;
  const w = cellToWorld(start.row, start.col);
  camera.position.set(w.x, w.y, w.z);

  if (levelNum === 1 && oldLevel === 0) {
    // Preserve facing direction from level 0
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 0 && oldLevel === 1) {
    // Returning to the starter room — place just inside the gate, preserve facing
    player.gridRow = 13;
    player.gridCol = 9;
    const wRet = cellToWorld(13, 9);
    camera.position.set(wRet.x, wRet.y, wRet.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 3 && oldLevel === 1) {
    player.facing = (player.facing + 2) % 4; // Turn 180 degrees
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 2) {
    // Face East to look down the starting corridor
    player.facing = 1;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 4) {
    // Face North into the vault
    player.facing = 0;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 5) {
    // Spawn directly in front of the return hero-door (south wall, row 16),
    // facing south so the player sees the door and can walk back through it.
    player.gridRow = 15;
    player.gridCol = 12;
    const wHero = cellToWorld(15, 12);
    camera.position.set(wHero.x, wHero.y, wHero.z);
    player.facing = 0; // North — door is behind them to the south
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 0 && oldLevel === 2) {
    // Returning from Level 2 via blue portal — place in starter room, facing north
    player.gridRow = 13;
    player.gridCol = 13;
    const wRet2 = cellToWorld(13, 13);
    camera.position.set(wRet2.x, wRet2.y, wRet2.z);
    player.facing = 0; // North
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === SCHEMATIC_TRIALS_LEVEL) {
    // Schematic Trials — face north into the N corridor
    player.facing = 0;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 0 && oldLevel === 5) {
    // Returning from Hall of Heroes — place near the hero door, face north
    player.gridRow = 14;
    player.gridCol = 20;
    const wRet = cellToWorld(14, 20);
    camera.position.set(wRet.x, wRet.y, wRet.z);
    player.facing = 0; // North — door is behind them to the east
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  }

  // 5. Update Minimap bounds
  drawMinimap();
  updateStatus();

  // Level 2 music logic
  if (levelNum === 2) {
    const demon = monsters.find(m => m.name === 'Demon' && (m.level ?? 1) === 2);
    const treeman = monsters.find(m => m.name === 'Treeman');
    const inTreemanRoom = player.gridRow >= 16 && player.gridRow <= 29;
    if (demon && !demon.alive) {
      setZoneMusic(asset('/sounds/backing/lvl2-post-demon.mp3'));
    } else if (treeman && !treeman.alive) {
      setZoneMusic(asset('/sounds/backing/demon-room.mp3'));
    } else if (inTreemanRoom) {
      setZoneMusic(asset('/sounds/backing/level-2.mp3'));
    } else {
      // Both alive and not in Treeman room — play exploration music for the new dungeon area
      setZoneMusic(asset('/sounds/backing/level-2-start.mp3'));
    }
  }

  // Level 4 music — clear any zone override so the level ambient pool plays
  if (levelNum === 4) {
    setZoneMusic(null);
  }

  // Hall of Heroes — always plays its theme
  if (levelNum === 5) {
    setZoneMusic(asset('/sounds/backing/hall-of-heroes.mp3'));
  }

  // Schematic Trials — borrow the demon-room track for an arcane feel
  if (levelNum === SCHEMATIC_TRIALS_LEVEL) {
    setZoneMusic(asset('/sounds/backing/demon-room.mp3'));
  }
};

// ─────────────────────────────────────────────
//  ARENA  — enter / exit (The Essentiary)
// ─────────────────────────────────────────────

function _arenaFade(cb) {
  const blackout = document.getElementById('fall-blackout');
  if (!blackout) { cb(); return; }
  blackout.classList.remove('hidden');
  blackout.offsetHeight; // force reflow
  blackout.classList.add('visible');
  setTimeout(() => {
    cb();
    blackout.classList.remove('visible');
    setTimeout(() => blackout.classList.add('hidden'), 520);
  }, 550);
}

function _showArenaResult(text, className) {
  const overlay = document.getElementById('arena-result-overlay');
  const banner  = document.getElementById('arena-result-banner');
  if (!overlay || !banner) return;
  banner.textContent = text;
  banner.className   = className;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => banner.classList.add('result-show'));
  setTimeout(() => {
    banner.classList.remove('result-show');
    setTimeout(() => overlay.classList.add('hidden'), 520);
  }, 2000);
}

window._arenaEnter = function (monsterId) {
  const def = MONSTER_DEFS[monsterId];
  if (!def) { console.warn('Arena: unknown monster key', monsterId); return; }
  const tier = getMonsterTier(monsterId);
  const scaledDef = applyTierScaling(def, tier);

  // Save state to restore after the fight
  window.arenaState.pre = {
    level:   window.currentLevel,
    gridRow: player.gridRow,
    gridCol: player.gridCol,
    facing:  player.facing,
  };
  window.arenaState.active = true;
  window.arenaState.tier = tier;

  // Pre-load the party-hit sound buffer so it's ready instantly on first hit
  prefetchBuffer(asset('/sounds/actions/party-hit.mp3'));

  // Start arena music immediately — before the fade so it's audible straight away
  setAmbientLevel(ARENA_LEVEL);
  setZoneMusic(asset('/sounds/backing/arena.mp3'));

  _arenaFade(() => {
    window._isRestoring = true;
    window.currentLevel = ARENA_LEVEL;

    // Hide recruit wall frescoes — they live directly in the scene at level-0
    // grid positions and are NOT removed by clearObjects(), so they must be
    // toggled via the visibility helper.
    updateRecruitsMeshState();

    // Build arena geometry
    changeMapArray(ARENA_MAP);
    buildLevel(scene);

    // Overlay arena-wall.jpg on walls, arena-floor.jpg on every non-wall cell
    const wallCells = [], floorCells = [];
    ARENA_MAP.forEach((row, r) => row.forEach((cell, c) => {
      if (cell === 1) wallCells.push([r, c]);
      else floorCells.push([r, c]);
    }));
    buildTextureZone(scene, wallCells, floorCells,
      asset('/textures/arena-wall.webp'),
      asset('/textures/arena-floor.webp'));

    clearObjects(scene);
    spawnObjectsForLevel();

    // Remove any stale arena monsters then create a fresh one
    for (let i = monsters.length - 1; i >= 0; i--) {
      if (monsters[i].level === ARENA_LEVEL) {
        if (monsters[i].mesh) scene.remove(monsters[i].mesh);
        monsters.splice(i, 1);
      }
    }

    // Clone GLB paths from the first matching template in any level
    const template = monsters.find(m => m.name === def.name);
    let arenaMonster = null;
    if (template) {
      arenaMonster = inst(
        scaledDef, 9999, 1, 4,
        template.glbIdle, template.glbAttack, template.attackSound,
        template.scale, 0, 0, ARENA_LEVEL,
        null, template.glbDeath, template.glbHit,
        template.glbWalk, template.glbIdleAlt, template.glbCombatIdle
      );
      // Copy multi-attack variants from the template so arena fights use the
      // same attack roster as the dungeon (e.g. Ogre's Furious Double Strike).
      if (template.attacks) arenaMonster.attacks = template.attacks;
      monsters.push(arenaMonster);
      loadMonstersForLevel(scene, ARENA_LEVEL);
    } else {
      console.warn('Arena: no template found for', def.name);
    }

    // Place player at start cell
    const start = findCell(CELL_START);
    player.gridRow = start.row;
    player.gridCol = start.col;
    player.facing  = 0; // North
    const w = cellToWorld(start.row, start.col);
    camera.position.set(w.x, w.y, w.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[0];

    drawMinimap();
    updateStatus();
    window._isRestoring = false;

    // Show loading screen until the monster mesh has finished streaming in.
    // The fall-blackout fades out after this callback returns, so the loading
    // overlay takes over and covers the canvas until the GLB is ready.
    const loadOverlay = document.getElementById('level-load-overlay');
    const loadText    = document.getElementById('level-load-text');
    const loadFill    = document.getElementById('level-load-bar-fill');
    if (loadOverlay && arenaMonster) {
      if (loadText) loadText.textContent = 'Entering the Arena\u2026';
      if (loadFill) { loadFill.style.transition = 'none'; loadFill.style.width = '0%'; }
      loadOverlay.classList.add('visible');
      requestAnimationFrame(() => {
        if (loadFill) { loadFill.style.transition = 'width 2s linear'; loadFill.style.width = '80%'; }
      });

      const loadStart = performance.now();
      const _pollId = setInterval(() => {
        if (arenaMonster.mesh && performance.now() - loadStart >= 900) {
          clearInterval(_pollId);
          if (loadFill) { loadFill.style.transition = 'width 0.15s ease'; loadFill.style.width = '100%'; }
          setTimeout(() => {
            loadOverlay.classList.remove('visible');
            _playArenaIntroVideo(monsterId, () => {
              const tierLabel = tier > 1 ? ` — Tier ${tier}` : '';
              _showArenaResult(`Fighting ${def.name}${tierLabel} · Let the battle begin!`, 'result-intro');
            });
            setTimeout(() => {
              if (loadFill) { loadFill.style.transition = 'none'; loadFill.style.width = '0%'; }
            }, 400);
          }, 200);
        }
      }, 80);
    }
  });

  // Callbacks fired by monster.js (victory) and party.js (defeat)
  window._arenaVictory = (row, col) => {
    recordArenaVictory(monsterId);
    _showArenaResult('Victory!', 'result-victory');
    // Spawn a blue portal at the arena start location (7, 4) so it doesn't overlap loot.
    if (spawnArenaPortal) spawnArenaPortal(7, 4);
  };
  window._arenaDefeat = () => {
    _showArenaResult('Defeated...', 'result-defeat');
    setTimeout(() => window._arenaExit(false), 2600);
  };
};

window._arenaExit = function (won) {
  window.arenaState.active = false;
  window.arenaState.tier = null;

  _arenaFade(() => {
    window._isRestoring = true;

    // Revive party on defeat (no permadeath — restore to 25% HP)
    if (!won) {
      resurrectAll();
      party.forEach(m => {
        if (!m.isEmpty) m.hp = Math.max(1, Math.floor(m.hpMax * 0.25));
      });
      refreshPartyCards();
    }

    // Remove arena monsters from the shared array
    for (let i = monsters.length - 1; i >= 0; i--) {
      if (monsters[i].level === ARENA_LEVEL) {
        if (monsters[i].mesh) scene.remove(monsters[i].mesh);
        if (monsters[i].hpBarFill) monsters[i].hpBarFill.parentElement?.remove();
        monsters.splice(i, 1);
      }
    }

    // Restore pre-arena state
    const pre = window.arenaState.pre ?? { level: 0, gridRow: 13, gridCol: 14, facing: 2 };
    window.currentLevel = pre.level;
    const maps = [level0Map, level1Map, level2Map, level3Map, level4Map, level5Map];
    changeMapArray(maps[pre.level] ?? level0Map);
    buildLevel(scene);
    clearObjects(scene);
    spawnObjectsForLevel();
    updateRecruitsMeshState();
    loadMonstersForLevel(scene, pre.level);
    setAmbientLevel(pre.level);
    setZoneMusic(null);

    player.gridRow = pre.gridRow;
    player.gridCol = pre.gridCol;
    player.facing  = pre.facing;
    const w = cellToWorld(pre.gridRow, pre.gridCol);
    camera.position.set(w.x, w.y, w.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[pre.facing];

    drawMinimap();
    updateStatus();
    window._isRestoring = false;
  });
};

const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const mouse = new THREE.Vector2();
let _lastRayTime = 0;
let _hoveredButtonSphere = null; // tracks which button is currently glowing

function _setButtonGlow(sphere, on) {
  const meshes = sphere?.userData?.glowMeshes;
  if (!meshes?.length) return;
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (mat.emissive !== undefined) {
        mat.emissive.setHex(on ? 0xe8c87a : 0x000000);
        mat.emissiveIntensity = on ? 0.6 : 0;
      }
    }
  }
}

window.addEventListener('mousemove', (e) => {
  // Only apply 3D world raycasting if interacting with the canvas directly
  if (e.target !== canvas) {
    document.body.classList.remove('cursor-interact');
    _keyItemCursorEl.style.display = 'none';
    return;
  }

  const now = performance.now();
  if (now - _lastRayTime < 66) return;
  _lastRayTime = now;

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactables, false);

  let isHoveringInteractable = false;
  let hoveredBtn = null;
  let keyItemIcon = null;
  for (let hit of intersects) {
    const ud = hit.object.userData;
    if (ud && (ud.isButton || ud.isChest || ud.isArmorStand || ud.isCrystal || ud.isBonePile || ud.isRecruit || ud.isPartyConfirmNPC || ud.isDialogueNPC || ud.isDamageTrap || ud.isEgg || ud.isTeleportTorch || ud.isAlchemyWorkshop || ud.isAnvil || ud.isShop || ud.isDroppedItem || ud.isHeroDoor || ud.isCrystalShrine || ud.isPortalActivatorStatue || ud.isKeyhole || ud.isPitLadder)) {
      if (hit.object.visible) {
        isHoveringInteractable = true;
        if (ud.isButton) hoveredBtn = hit.object;

        // Key-item cursor: show the matching item icon if the party has it
        if (ud.isKeyhole && ud.requiredKey && partyHasItem(ud.requiredKey)) {
          const def = getItemDef(ud.requiredKey);
          if (def?.icon) keyItemIcon = asset(def.icon);
        } else if (ud.isCrystalShrine) {
          const state = getCrystalShrineState();
          if (state === 0 && partyHasItem('Red Crystal')) {
            const def = getItemDef('Red Crystal');
            if (def?.icon) keyItemIcon = asset(def.icon);
          } else if (state === 1 && partyHasItem('Blue Crystal')) {
            const def = getItemDef('Blue Crystal');
            if (def?.icon) keyItemIcon = asset(def.icon);
          }
        }

        break;
      }
    }
  }

  // Update button glow — turn off previous, turn on current
  if (hoveredBtn !== _hoveredButtonSphere) {
    _setButtonGlow(_hoveredButtonSphere, false);
    _setButtonGlow(hoveredBtn, true);
    _hoveredButtonSphere = hoveredBtn;
  }

  // Key-item floating icon
  if (keyItemIcon) {
    if (_keyItemCursorEl.src !== keyItemIcon) _keyItemCursorEl.src = keyItemIcon;
    _keyItemCursorEl.style.display = 'block';
    _keyItemCursorEl.style.left = e.clientX + 20 + 'px';
    _keyItemCursorEl.style.top = e.clientY + 'px';
  } else {
    _keyItemCursorEl.style.display = 'none';
  }

  if (isHoveringInteractable) {
    document.body.classList.add('cursor-interact');
  } else {
    document.body.classList.remove('cursor-interact');
  }
});

console.log('%c Grid Dungeon Crawler ', 'background:#333;color:#e8c87a;font-size:14px;padding:4px 8px;');
console.log('Map: 0=floor 1=wall 2=start 3=exit | Controls: W/S=move  Q/E=turn  A/D=strafe  Arrows=move+turn');

// ─────────────────────────────────────────────
//  SAVE RESTORE — POST-INIT PHASE
// ─────────────────────────────────────────────
if (_pendingSave) {
  applySavePostInit(_pendingSave, {
    camera,
    loadLevel: window.loadLevel,
    finishIntro,
  });
}

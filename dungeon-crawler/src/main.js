import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildLevel, findCell, CELL_START, changeMapArray, level0Map, level1Map, level2Map, level3Map, level4Map, level5Map, cellToWorld, isPassable, CELL_HOLE, CELL_STAIRS_UP, dungeonMap, invalidateWallTextures } from './map.js';
import { initPlayer, initInput, setCallbacks, tweenGroup, player, FACING_ANGLES, isInFrontOfPlayer } from './player.js';
import { initLighting, updateLighting } from './lighting.js';
import { initParticles, updateParticles, invalidateParticleTextures } from './particles.js';
import { initMinimap, drawMinimap, updateStatus, showMessage } from './minimap.js';
import { initParty, updateParty, party, setPartyGold, refreshPartyCards, autoAttack, autoRangeAttack, setAutoAttack, setAutoRangeAttack, setHp, flashPortraitHit, showMemberDamage, isPartyUnseen } from './party.js';
import { initEquipment, hideDropButton, updateEffectiveStats, tickAutoAttack, clearAutoAttackTimers, tickAutoRangeAttack, clearAutoRangeAttackTimers } from './equipment.js';
import { initMonsters, loadMonstersForLevel, updateMonsters, triggerMonsterAttack, monsters, isMonsterAt } from './monster.js';
import { initRecruits, updateRecruitsMeshState, RECRUITS } from './recruits.js';
import { initObjects, clearObjects, spawnObjectsForLevel, isShopAt, isStatueAt, updateObjects, interactables, checkTrapAtPosition, getContainerStates, setPendingContainerOverrides, getWorldFlags, setWorldFlags } from './objects.js';
import { startMusic, updateAudio, setAmbientLevel, setZoneMusic, playFallSequence, prefetchBuffer } from './audio.js';
import { initBattleLog } from './battle-log.js';
import { initBattleStats } from './battle-stats.js';
import { initMainMenu } from './main-menu.js';
import { consumePendingLoad, autoSave } from './save-game.js';
import { initQuarks, updateQuarks } from './quarks-intro.js';
import { showHelpDialog } from './help.js';
import { asset } from './assets.js';
import { initQuests, setQuestLog } from './quest.js';

import './style.css';

// ─────────────────────────────────────────────
//  RENDERER & GLOBALS
// ─────────────────────────────────────────────
window.currentLevel = 0;

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
    introSrc.src = asset(introSrc.getAttribute('src'));
    document.getElementById('intro-video')?.load();
  }
}

// Map of level number → video element IDs to preload when entering that level
const _VIDEO_LEVELS = {
  0: ['battle-prep-video', 'hero-door-video'],
  1: ['ogre-video', 'mummy-video', 'demon-video', 'aqua-man-video', 'portal-video'],
  2: ['treeman-video', 'giant-video'],
  3: ['minotaur-video', 'minotaur-death-video', 'statue-portal-video', 'egg-video'],
  4: ['stairs-video'],
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
    source.src = asset(source.getAttribute('src'));
    video.load();
  });
}

// Preload level 0 videos (starter room / NPC party confirm)
loadVideosForLevel(0);

// Pre-fetch back1.mp3 raw bytes now — no AudioContext needed.
// By the time the user clicks, the bytes are cached and decodeAudioData is near-instant.
const _audioPreload = prefetchBuffer(asset('/sounds/back1.mp3'));

// Disable "Start Adventure" until the intro video has buffered enough to play
// AND the background music file has been pre-fetched. Show a progress bar while loading.
{
  const _startBtn = document.getElementById('start-adventure-btn');
  const _easyBtn = document.getElementById('easy-mode-btn');
  const _introVid = document.getElementById('intro-video');
  const _barFill = document.getElementById('loading-bar-fill');
  const _barWrap = document.getElementById('loading-bar-wrap');
  if (_startBtn && _introVid) {
    _startBtn.disabled = true;
    _startBtn.textContent = 'Loading…';
    if (_easyBtn) _easyBtn.disabled = true;

    const _setProgress = (pct) => {
      if (_barFill) _barFill.style.width = `${Math.round(pct)}%`;
    };

    const _enable = () => {
      _setProgress(100);
      _startBtn.disabled = false;
      _startBtn.textContent = 'Start Adventure';
      if (_easyBtn) _easyBtn.disabled = false;
      if (_barWrap) _barWrap.style.opacity = '0';
    };

    // Progress bar driven by video buffering
    _introVid.addEventListener('progress', () => {
      if (!_introVid.duration) return;
      try {
        const pct = (_introVid.buffered.end(_introVid.buffered.length - 1) / _introVid.duration) * 100;
        _setProgress(pct);
      } catch (_) { /* buffered range not available yet */ }
    });

    // Gate on both: video ready to play AND music pre-fetched
    const _videoReady = new Promise(resolve => {
      _introVid.addEventListener('canplaythrough', resolve, { once: true });
      _introVid.addEventListener('error', resolve, { once: true });
    });
    Promise.all([_videoReady, _audioPreload]).then(_enable);
  }
}

const canvas = document.getElementById('renderer-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

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

// ─────────────────────────────────────────────
//  SCENE  &  CAMERA
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 2, 12);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);

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
const start = findCell(CELL_START);
initPlayer(start.row, start.col, camera);

let hasSeenOgreVideo = false;
let hasSeenPrepVideo = false;
let hasSeenMinotaurVideo = false;
let hasSeenMinotaurDeathVideo = false;
let hasSeenDemonVideo = false;
let hasSeenAquaManVideo = false;
window.hasSeenTreemanVideo = false;
let prepVideoTimer = null;

// Bridge video flags to save system via window._saveFlags
window._saveFlags = { hasSeenOgreVideo, hasSeenPrepVideo, hasSeenMinotaurVideo, hasSeenMinotaurDeathVideo, hasSeenDemonVideo, hasSeenAquaManVideo };

setCallbacks({
  moved() {
    drawMinimap();
    updateStatus();
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
        setZoneMusic(asset('/sounds/backing/town-music.mp3'));
      } else {
        setZoneMusic(null);
      }
    } else if (window.currentLevel === 1) {
      const inOgreRoom = player.gridCol >= 1 && player.gridCol <= 6
        && player.gridRow >= 1 && player.gridRow <= 9;
      const inMummyRoom = player.gridCol >= 11 && player.gridCol <= 15
        && player.gridRow >= 1 && player.gridRow <= 5;

      if (inOgreRoom && hasSeenOgreVideo) {
        setZoneMusic('/sounds/backing/ogre-room.mp3');
      } else if (inMummyRoom) {
        setZoneMusic('/sounds/backing/mummy-room.mp3');
      } else {
        setZoneMusic(null);
      }

      if (!hasSeenOgreVideo && player.gridRow === 6 && player.gridCol === 1) {
        hasSeenOgreVideo = true; window._saveFlags.hasSeenOgreVideo = true;
        playOgreVideo();
      }

      // Prep video triggers ONLY when confirming the NPC modal now,
      // so we remove the position-based trigger entirely.
    } else if (window.currentLevel === 2) {
      // Demon room: the big chamber at the south end of the passage
      const inDemonRoom = player.gridRow >= 14 && player.gridRow <= 20
        && player.gridCol >= 3 && player.gridCol <= 8;
      const inAquaManRoom = player.gridCol === 3 && player.gridRow >= 22 && player.gridRow <= 26;

      if (inAquaManRoom) {
        setZoneMusic('/sounds/water.mp3');
      } else {
        const treeman = monsters.find(m => m.name === 'Treeman');
        if (treeman && !treeman.alive) {
          setZoneMusic('/sounds/backing/demon-room.mp3');
        } else {
          setZoneMusic(null);
        }
      }

      if (inDemonRoom && !hasSeenDemonVideo) {
        hasSeenDemonVideo = true; window._saveFlags.hasSeenDemonVideo = true;
        playDemonVideo();
      }
    } else if (window.currentLevel === 3) {
      const inMinotaurRoom = player.gridRow >= 8 && player.gridRow <= 14
        && player.gridCol >= 8 && player.gridCol <= 14;

      if (inMinotaurRoom && !hasSeenMinotaurVideo) {
        hasSeenMinotaurVideo = true; window._saveFlags.hasSeenMinotaurVideo = true;
        if (window.playMinotaurVideo) window.playMinotaurVideo();
      }
    }

    // --- Special Grid Logic (Teleports) ---
    const cell = dungeonMap[player.gridRow][player.gridCol];
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
          setHp(i, m.hp - dmg);
          showMemberDamage(i, dmg, false);
          flashPortraitHit(i);
        });

        // Wait 1 second before teleporting and playing the video
        setTimeout(() => {
          // Teleport to pit arrival chamber (row 22, col 3)
          player.gridRow = 22;
          player.gridCol = 3;
          const w = cellToWorld(22, 3);
          camera.position.set(w.x, w.y, w.z);
          // Face South (2) towards the new passage
          player.facing = 2;
          camera.rotation.order = 'YXZ';
          camera.rotation.y = FACING_ANGLES[player.facing];
          drawMinimap();
          updateStatus();

          // Hide the blackout now — the video overlay covers the scene
          if (blackout) {
            blackout.classList.remove('visible');
            setTimeout(() => blackout.classList.add('hidden'), 500);
          }

          // Force play the video as the transition experience
          if (!hasSeenAquaManVideo) {
            hasSeenAquaManVideo = true;
            window._saveFlags.hasSeenAquaManVideo = true;
          }
          playAquaManVideo(() => {
            window._cutscenePlaying = false;
          });
        }, 1000);
      } else if (cell === CELL_STAIRS_UP) {
        tweenGroup.removeAll();
        player.moving = false;

        // Teleport to far end of original passage (row 17, col 28) immediately
        player.gridRow = 17;
        player.gridCol = 28;
        const w = cellToWorld(17, 28);
        camera.position.set(w.x, w.y, w.z);
        // Face West (3) back towards the demon room
        player.facing = 3;
        camera.rotation.order = 'YXZ';
        camera.rotation.y = FACING_ANGLES[player.facing];
        drawMinimap();
        updateStatus();

        if (window.playStairsVideo) {
          window.playStairsVideo(() => {
            showMessage("You climb the stairs back to the upper passage.");
          });
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
initParty();
initEquipment();
initBattleLog();
initBattleStats();
initMainMenu();
initQuests();

// ─────────────────────────────────────────────
//  SAVE RESTORE — PRE-INIT PHASE
//  Set up overrides BEFORE objects/monsters init so the first spawn uses saved state.
// ─────────────────────────────────────────────
const _pendingSave = consumePendingLoad();
if (_pendingSave?.recruits) {
  for (const r of RECRUITS) r.isRecruited = !!_pendingSave.recruits[r.id];
}

initRecruits(scene, camera);
initObjects(scene, camera);

// ─────────────────────────────────────────────
//  MONSTERS
// ─────────────────────────────────────────────
initMonsters(scene);

// ─────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────
let lastTime = performance.now();

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

  // Auto-attack: front row members attack automatically when a monster is in melee range
  if (autoAttack) {
    const currentLevel = window.currentLevel ?? 0;
    const hasTarget = monsters.some(t =>
      t.alive &&
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
      t.alive &&
      (t.level ?? 1) === currentLevel &&
      isInFrontOfPlayer(t.gridRow, t.gridCol, 3) &&
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
//  DEV INFO
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  INTRO VIDEO & SPLASH
// ─────────────────────────────────────────────
const introOverlay = document.getElementById('intro-overlay');
const splashScreen = document.getElementById('splash-screen');
const videoContainer = document.getElementById('video-container');
const introVideo = document.getElementById('intro-video');
const startBtn = document.getElementById('start-adventure-btn');
window.easyMode = false;
window.helpEnabled = true;
const skipBtn = document.getElementById('skip-intro-btn');

function _readStartOptions() {
  const diffRadio = document.querySelector('input[name="difficulty"]:checked');
  window.easyMode = diffRadio ? diffRadio.value === 'normal' : true;
  window.helpEnabled = document.getElementById('help-toggle')?.checked ?? true;
}

function finishIntro() {
  if (!introOverlay) return;
  introOverlay.style.transition = 'opacity 1.5s ease';
  introOverlay.style.opacity = '0';
  setTimeout(() => {
    introVideo.pause();
    introOverlay.remove();

    if (window.helpEnabled) {
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

if (startBtn) {
  startBtn.addEventListener('click', () => {
    _readStartOptions();
    splashScreen.classList.add('hidden');
    videoContainer.classList.remove('hidden');
    introVideo.play().catch(e => {
      console.warn("Video play failed:", e);
      finishIntro();
    });
    // Trigger music/audio context via the same click
    handleFirstInteraction();
  });
}

if (introVideo) {
  introVideo.addEventListener('ended', finishIntro);
}
if (skipBtn) {
  skipBtn.addEventListener('click', finishIntro);
}

// ─────────────────────────────────────────────
//  OGRE VIDEO OVERLAY
// ─────────────────────────────────────────────
const ogreOverlay = document.getElementById('ogre-video-overlay');
const ogreVideo = document.getElementById('ogre-video');
const skipOgreBtn = document.getElementById('skip-ogre-btn');

function playOgreVideo() {
  if (!ogreOverlay || !ogreVideo) return;
  ogreOverlay.classList.remove('hidden');

  // Give the browser a moment to process the display change before animating opacity
  setTimeout(() => {
    ogreOverlay.style.opacity = '1';
    ogreVideo.play().catch(e => {
      console.warn("Ogre video play failed:", e);
      finishOgreVideo();
    });
  }, 50);
}

function finishOgreVideo() {
  if (!ogreOverlay) return;
  ogreOverlay.style.opacity = '0';

  // Start the Ogre Room music as the video fades out
  setZoneMusic('/sounds/backing/ogre-room.mp3');

  setTimeout(() => {
    ogreVideo.pause();
    ogreOverlay.remove();
  }, 1500);
}

if (skipOgreBtn) skipOgreBtn.addEventListener('click', finishOgreVideo);
if (ogreVideo) ogreVideo.addEventListener('ended', finishOgreVideo);

// ─────────────────────────────────────────────
//  TREEMAN VIDEO OVERLAY
// ─────────────────────────────────────────────
const treemanOverlay = document.getElementById('treeman-video-overlay');
const treemanVideo = document.getElementById('treeman-video');
const skipTreemanBtn = document.getElementById('skip-treeman-btn');
let _treemanCallback = null;

window.playTreemanVideo = function (onComplete) {
  window.hasSeenTreemanVideo = true;
  _treemanCallback = onComplete;
  if (!treemanOverlay || !treemanVideo) {
    if (_treemanCallback) _treemanCallback();
    return;
  }
  treemanOverlay.classList.remove('hidden');

  setTimeout(() => {
    treemanOverlay.style.opacity = '1';
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

if (skipTreemanBtn) skipTreemanBtn.addEventListener('click', finishTreemanVideo);
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

if (skipMummyBtn) skipMummyBtn.addEventListener('click', finishMummyVideo);
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
    hideDropButton();
  }, 1500);
}

if (skipBattlePrepBtn) skipBattlePrepBtn.addEventListener('click', finishBattlePrepVideo);
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

if (skipMinotaurBtn) skipMinotaurBtn.addEventListener('click', finishMinotaurVideo);
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

if (skipMinotaurDeathBtn) skipMinotaurDeathBtn.addEventListener('click', finishMinotaurDeathVideo);
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

if (skipDemonBtn) skipDemonBtn.addEventListener('click', finishDemonVideo);
if (demonVideo) demonVideo.addEventListener('ended', finishDemonVideo);

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

  if (skipAquaManBtn) skipAquaManBtn.onclick = finishAquaManVideo;
  if (aquaManVideo) aquaManVideo.onended = finishAquaManVideo;

  setTimeout(() => {
    aquaManOverlay.style.opacity = '1';
    setZoneMusic('/sounds/water.mp3');
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

  if (skipGiantBtn) skipGiantBtn.onclick = finishGiantVideo;
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

if (skipStairsBtn) skipStairsBtn.addEventListener('click', finishStairsVideo);
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

if (skipEggBtn) skipEggBtn.addEventListener('click', finishEggVideo);
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
  heroDoorVideoOverlay.style.opacity = '0';

  setTimeout(() => {
    heroDoorVideoElement.pause();
    heroDoorVideoElement.currentTime = 0;
    heroDoorVideoOverlay.classList.add('hidden');
    if (_heroDoorVideoCallback) {
      _heroDoorVideoCallback();
      _heroDoorVideoCallback = null;
    }
  }, 1500);
}

if (skipHeroDoorBtn) skipHeroDoorBtn.addEventListener('click', finishHeroDoorVideo);
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

function finishPortalVideo() {
  if (!portalOverlay) {
    if (_portalCallback) _portalCallback();
    return;
  }
  portalOverlay.style.opacity = '0';

  setTimeout(() => {
    portalVideo.pause();
    portalOverlay.classList.add('hidden');
    if (_portalCallback) {
      _portalCallback();
      _portalCallback = null;
    }
  }, 1500);
}

if (skipPortalBtn) skipPortalBtn.addEventListener('click', finishPortalVideo);
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

if (skipStatuePortalBtn) skipStatuePortalBtn.addEventListener('click', finishStatuePortalVideo);
if (statuePortalVideo) statuePortalVideo.addEventListener('ended', finishStatuePortalVideo);
function handleFirstInteraction() {
  startMusic();
  window.removeEventListener('click', handleFirstInteraction);
  window.removeEventListener('keydown', handleFirstInteraction);
}
window.addEventListener('click', handleFirstInteraction);
window.addEventListener('keydown', handleFirstInteraction);

// ─────────────────────────────────────────────
//  LEVEL LOADING
// ─────────────────────────────────────────────
let _level1FirstLoad = true; // shows loading screen on first entry to level 1

// Container states keyed by level number — persists looted state across level transitions
let _visitedLevelContainers = {};

window.loadLevel = function (levelNum) {
  // Capture current level's container states before leaving (skip during save restore)
  if (!window._isRestoring) {
    _visitedLevelContainers[window.currentLevel] = getContainerStates();
    autoSave(levelNum, { containers: { ..._visitedLevelContainers }, flags: getWorldFlags() });
  }

  // Lazily load videos needed for this level
  loadVideosForLevel(levelNum);

  // First-ever entry into level 1: show a black loading screen for 10 seconds
  // so the GLB assets have time to stream in before the player sees anything.
  if (levelNum === 1 && _level1FirstLoad) {
    _level1FirstLoad = false;
    const overlay = document.getElementById('level-load-overlay');
    const fill = document.getElementById('level-load-bar-fill');
    // Show overlay immediately
    overlay.classList.add('visible');
    // Kick off progress bar on next frame so the transition triggers properly
    requestAnimationFrame(() => {
      fill.style.transition = 'width 10s linear';
      fill.style.width = '100%';
    });
    // After 10 s fade out and release pointer events
    setTimeout(() => {
      overlay.classList.remove('visible');
      // Reset bar after the fade-out completes so it's clean if ever reused
      setTimeout(() => {
        fill.style.transition = 'none';
        fill.style.width = '0%';
      }, 400);
    }, 10000);
  }

  const oldLevel = window.currentLevel;
  window.currentLevel = levelNum;

  // Switch ambient music to match the new level
  setAmbientLevel(levelNum);

  // 1. Swap Map Array
  const maps = [level0Map, level1Map, level2Map, level3Map, level4Map, level5Map];
  changeMapArray(maps[levelNum] ?? level0Map);

  // 2. Rebuild map meshes for walls/floors
  buildLevel(scene);

  // 3. Clear and respawn level objects
  clearObjects(scene);
  setPendingContainerOverrides(_visitedLevelContainers[levelNum] ?? null);
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
    // Face South to see the room and Treeman
    player.facing = 2;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 4) {
    // Face North into the vault
    player.facing = 0;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 5) {
    // Entering the Hall of Heroes — face north into the hall
    player.facing = 0;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 0 && oldLevel === 5) {
    // Returning from Hall of Heroes — place near the hero door, face west into the room
    player.gridRow = 14;
    player.gridCol = 20;
    const wRet = cellToWorld(14, 20);
    camera.position.set(wRet.x, wRet.y, wRet.z);
    player.facing = 3; // West (toward the hero door at col 21)
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  }

  // 5. Update Minimap bounds
  drawMinimap();
  updateStatus();

  // If Treeman is dead, ensure Level 2 music is override
  if (levelNum === 2) {
    const treeman = monsters.find(m => m.name === 'Treeman');
    if (treeman && !treeman.alive) {
      setZoneMusic('/sounds/backing/demon-room.mp3');
    }
  }
};

const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const mouse = new THREE.Vector2();
let _lastRayTime = 0;

window.addEventListener('mousemove', (e) => {
  // Only apply 3D world raycasting if interacting with the canvas directly
  if (e.target !== canvas) {
    document.body.classList.remove('cursor-interact');
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
  for (let hit of intersects) {
    const ud = hit.object.userData;
    if (ud && (ud.isButton || ud.isChest || ud.isArmorStand || ud.isCrystal || ud.isBonePile || ud.isRecruit || ud.isPartyConfirmNPC || ud.isDialogueNPC || ud.isDamageTrap || ud.isEgg || ud.isTeleportTorch || ud.isAlchemyWorkshop || ud.isAnvil || ud.isShop || ud.isDroppedItem || ud.isHeroDoor)) {
      if (hit.object.visible) {
        isHoveringInteractable = true;
        break;
      }
    }
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
//  SAVE GAME — RESTORE ON LOAD
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  SAVE RESTORE — POST-INIT PHASE
//  Restore party, gold, position, and level after objects/monsters are initialized.
//  World state (containers, monsters, flags, recruits) was already applied in the pre-init phase.
// ─────────────────────────────────────────────
(function _applyPendingLoad() {
  const save = _pendingSave;
  if (!save) return;

  // 1. Restore party members
  for (let i = 0; i < 4; i++) {
    const src = save.party[i];
    const dest = party[i];
    for (const k of Object.keys(dest)) delete dest[k];
    Object.assign(dest, JSON.parse(JSON.stringify(src)));
    dest.cooldownTimers = {};
    if (!dest.isEmpty) updateEffectiveStats(dest);
  }

  // 2. Restore gold
  setPartyGold(save.partyGold ?? 0);

  // 3. Restore auto-attack toggles
  if (save.autoAttack !== undefined) setAutoAttack(save.autoAttack);
  if (save.autoRangeAttack !== undefined) setAutoRangeAttack(save.autoRangeAttack);

  // 4. Restore quest log
  if (save.questLog) setQuestLog(save.questLog);

  // 5. Restore world state (container contents, world flags) then load target level
  if (save.worldState) {
    _visitedLevelContainers = save.worldState.containers ?? {};
    setWorldFlags(save.worldState.flags ?? null);
  } else {
    _visitedLevelContainers = {};
  }
  const targetLevel = save.targetLevel ?? 0;
  window._isRestoring = true;
  window.loadLevel(targetLevel);
  window._isRestoring = false;

  // 5. Refresh HUD
  refreshPartyCards();
  drawMinimap();
  updateStatus();

  // Skip the intro overlay so the player is dropped straight into the game
  finishIntro();
})();


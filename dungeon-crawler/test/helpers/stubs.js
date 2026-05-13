/**
 * test/helpers/stubs.js
 *
 * No-op stubs for src/audio.js and src/minimap.js.
 * Vitest's alias config redirects both module specifiers here, so any save-state
 * module that imports from those files gets these silent no-ops instead of the real
 * implementations (which require a browser audio context or DOM elements).
 *
 * Every named export used anywhere in the src/ tree is listed here.
 * Unknown imports silently resolve to `undefined` via the catch-all proxy, but
 * explicit stubs are clearer about intent.
 */

// ── audio.js stubs ────────────────────────────────────────────────────────────
export const playActionSound      = () => {};
export const playCritSound        = () => {};
export const playHealSound        = () => {};
export const playPortalSound      = () => {};
export const playKeyLockSound     = () => {};
export const playGateOpeningSound = () => {};
export const playHitSound         = () => {};
export const playPartyHitSound    = () => {};
export const playShieldBlockSound = () => {};
export const playGoldSound        = () => {};
export const playBoneSound        = () => {};
export const startMusic           = () => {};
export const setAmbientLevel      = () => {};
export const setZoneMusic         = () => {};
export const setInCombat          = () => {};
export const clearCombat          = () => {};
export const playItemSound        = () => {};
export const playAlchemySound     = () => {};
export const playAlchemyFailSound = () => {};
export const playSkillSound       = () => {};
export const playSpellCabinetSound= () => {};
export const playChestOpenSound   = () => {};
export const playWeaponRackSound  = () => {};
export const playLevelUpSound     = () => {};
export const playLevelUpConfirmSound = () => {};
export const playShopkeeperSound  = () => {};
export const playAnvilSound       = () => {};
export const playCraftFailSound   = () => {};
export const playCraftHqSound     = () => {};
export const playSoundByUrl       = () => Promise.resolve(null);
export const playQuestAudio       = () => Promise.resolve(null);
export const fadeOutQuestAudio    = () => {};
export const playSuccessSound     = () => {};
export const playLearntSound      = () => {};
export const playTrapSound        = () => {};
export const playButtonClickSound = () => {};
export const playNpcDialogue      = () => Promise.resolve(null);
export const isNpcDialoguePlaying = () => false;
export const isInCombat           = () => false;
export const prefetchActionSounds = () => {};
export const prefetchBuffer       = () => Promise.resolve(null);
export const playInventorySortSound = () => {};

// ── minimap.js stubs ──────────────────────────────────────────────────────────
export const showMessage   = () => {};
export const drawMinimap   = () => {};
export const updateStatus  = () => {};
export const changeZoom    = () => {};
export const changeSize    = () => {};
export const toggleFullscreen = () => {};
export const resetPan      = () => {};

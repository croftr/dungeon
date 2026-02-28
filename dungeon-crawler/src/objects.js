import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CELL, dungeonMap, CELL_FLOOR } from './map.js';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, isInFrontOfPlayer, player } from './player.js';
import { showMessage } from './minimap.js';
import { getItemDef } from './items.js';
import { party, drawPortrait, resurrectAll, partyGold, removeGold, addGold } from './party.js';
import { playHealSound, playBoneSound, playPortalSound, playShopkeeperSound, playAlchemySound, playAnvilSound } from './audio.js';
import MERCHANT_DATA from './data/merchant.json';

export const objects = [];

const _mixers = [];
const _intervals = [];

export function updateObjects(dt) {
    for (const mixer of _mixers) mixer.update(dt);
}

// ─────────────────────────────────────────────
//  CHEST / MERCHANT SHARED STATE
// ─────────────────────────────────────────────
let _chestCtxOpen = false;
// Tracks which modal's "Sent to" label to update ('chest-sent-label' or 'merchant-sent-label')
let _activeSentLabelId = 'chest-sent-label';

// ─────────────────────────────────────────────
//  SHOP GRID BLOCKING
// ─────────────────────────────────────────────
const _shopGridCells = new Set(); // "row,col" keys — treated as impassable

export function isShopAt(r, c) {
    return _shopGridCells.has(`${r},${c}`);
}

// ─────────────────────────────────────────────
//  MERCHANT STOCK & PRICES
// ─────────────────────────────────────────────
const MERCHANT_STOCK = MERCHANT_DATA.stock;
const MERCHANT_PRICES = MERCHANT_DATA.prices;

// Items still available for sale (items bought are removed permanently)
let _merchantAvailable = [...MERCHANT_STOCK];
// Items the player has added to the basket this session (cleared on close without buying)
let _merchantBasket = [];
// Items the player has selected to sell { charIndex, invIndex, name }
let _merchantSellBasket = [];
// Current merchant tab
let _merchantMode = 'buy';

const ALCHEMY_SLOTS = 9; // 8 ingredients + 1 result
const _alchemyContents = Array(ALCHEMY_SLOTS).fill(null);
let _alchemyModalOpen = false;

let objectsGroup = new THREE.Group();

export function clearObjects(scene) {
    scene.remove(objectsGroup);
    objectsGroup = new THREE.Group();
    scene.add(objectsGroup);
    // Properly clean up animations and timers
    _mixers.length = 0;
    for (const id of _intervals) clearInterval(id);
    _intervals.length = 0;
    _shopGridCells.clear();
}

export function initObjects(scene, camera) {
    const gltfLoader = new GLTFLoader();
    scene.add(objectsGroup);

    spawnObjectsForLevel(gltfLoader);

    window.addEventListener('click', (e) => {
        // If any modal overlay is currently visible, let the DOM handle it — don't raycast.
        const cabinetOverlay = document.getElementById('cabinet-overlay');
        const chestOverlay = document.getElementById('chest-overlay');
        const corpseOverlay = document.getElementById('corpse-overlay');
        const equipOverlay = document.getElementById('equip-overlay');
        const merchantOverlay = document.getElementById('merchant-overlay');
        const alchemyOverlay = document.getElementById('alchemy-overlay');
        if (
            (cabinetOverlay && !cabinetOverlay.classList.contains('chest-hidden')) ||
            (chestOverlay && !chestOverlay.classList.contains('chest-hidden')) ||
            (corpseOverlay && !corpseOverlay.classList.contains('chest-hidden')) ||
            (equipOverlay && !equipOverlay.classList.contains('equip-hidden')) ||
            (merchantOverlay && !merchantOverlay.classList.contains('merchant-hidden')) ||
            (alchemyOverlay && !alchemyOverlay.classList.contains('chest-hidden'))
        ) return;

        // Raycast
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(objectsGroup.children, true);

        for (let hit of intersects) {
            let obj = hit.object;
            if (obj.userData.isButton) {
                // Check if player is facing the wall at (8, 8) from (8, 7)
                if (isInFrontOfPlayer(8, 8, 1)) {
                    // Small button press animation
                    new Tween(obj.position)
                        .to({ x: 0.01 }, 100)
                        .easing(Easing.Quadratic.Out)
                        .chain(new Tween(obj.position).to({ x: 0.04 }, 100).easing(Easing.Quadratic.In))
                        .start();
                    // Hardcoded portcullis open
                    const p = objects.find(o => o.name === 'Portcullis' && o.gridRow === 7 && o.gridCol === 7);
                    if (p) openPortcullis(p);
                } else {
                    showMessage("You can't reach that from here.");
                }
                break;
            } else if (obj.userData.isChest) {
                // Check if player is standing on the same square as the chest
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);

                if (isOnSameSquare) {
                    openChestModal(obj);
                } else {
                    showMessage("Stand on the chest to open it.");
                }
                break;
            } else if (obj.userData.isCrystal) {
                // Check if player is standing on the same square as the crystal
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);

                if (isOnSameSquare) {
                    resurrectAll();
                    playHealSound();
                    showMessage("The glowing crystals pulse with life-giving energy!");

                    // Small flash of light animation
                    if (obj.userData.light) {
                        const originalIntensity = obj.userData.light.intensity;
                        new Tween({ i: originalIntensity })
                            .to({ i: originalIntensity * 4 }, 200)
                            .easing(Easing.Quadratic.Out)
                            .onUpdate((o) => { obj.userData.light.intensity = o.i; })
                            .chain(
                                new Tween({ i: originalIntensity * 4 })
                                    .to({ i: originalIntensity }, 800)
                                    .easing(Easing.Quadratic.In)
                                    .onUpdate((o) => { obj.userData.light.intensity = o.i; })
                            )
                            .start();
                    }
                } else {
                    showMessage("Stand on the crystals to feel their power.");
                }
                break;
            } else if (obj.userData.isBonePile) {
                // Check if player is in front of the bone pile (within 1 square)
                if (isInFrontOfPlayer(obj.userData.gridRow, obj.userData.gridCol, 1)) {
                    playBoneSound();
                    openCorpseModal(obj);
                } else {
                    showMessage("The corpse lies just out of reach.");
                }
            } else if (obj.userData.isPortal) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    showMessage("You step into the swirling blue portal...");
                    playPortalSound();
                    if (window.loadLevel) window.loadLevel(obj.userData.targetLevel);
                } else {
                    showMessage("Step closer to the portal to enter.");
                }
                break;
            } else if (obj.userData.isShop) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    playShopkeeperSound();
                    openMerchantModal();
                } else {
                    showMessage("The merchant watches you from behind the counter.");
                }
                break;
            } else if (obj.userData.isSpellCabinet) {
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);
                if (isOnSameSquare) {
                    openSpellCabinetModal(obj);
                } else {
                    showMessage("Stand on the cabinet to open it.");
                }
                break;
            } else if (obj.userData.isAlchemyWorkshop) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    openAlchemyModal();
                } else {
                    showMessage("You can't reach the workshop from here.");
                }
                break;
            } else if (obj.userData.isDroppedItem) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    import('./equipment.js').then(equip => {
                        let added = false;
                        for (let i = 0; i < 4; i++) {
                            if (equip.addItemToInventory(i, obj.userData.itemName)) {
                                added = true;
                                showMessage(`Picked up ${obj.userData.itemName}.`);
                                obj.parent.remove(obj);
                                break;
                            }
                        }
                        if (!added) {
                            showMessage("Inventory is full!");
                        }
                    });
                } else {
                    showMessage("Move closer to pick it up.");
                }
                break;
            } else if (obj.userData.isAnvil) {
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);
                if (isOnSameSquare) {
                    playAnvilSound();
                    openAnvilModal(obj);
                } else {
                    showMessage("Stand by the anvil to use it.");
                }
                break;
            } else if (obj.userData.isKeyhole) {
                if (isInFrontOfPlayer(obj.userData.gridRow, obj.userData.gridCol, 1)) {
                    const p = objects.find(o => o.name === 'Portcullis' && o.gridRow === obj.userData.targetRow && o.gridCol === obj.userData.targetCol);
                    if (p) {
                        if (!p.isOpen) {
                            showMessage("You turn the key. The portcullis grinds open.");
                            playPortalSound(); // metallic grind would be better but let's use this
                            openPortcullis(p);
                        } else {
                            showMessage("The portcullis is already open.");
                        }
                    }
                } else {
                    showMessage("You can't reach the keyhole from here.");
                }
                break;
            }
        }
    });

    // Modal Close Logic
    const closeBtn = document.getElementById('chest-close');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('chest-overlay').classList.add('chest-hidden');
            _hideChestCtxMenu();
            import('./equipment.js').then(m => m.hideTooltip());
        };
    }

    // Merchant modal close
    const merchantCloseBtn = document.getElementById('merchant-close');
    if (merchantCloseBtn) {
        merchantCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('merchant-overlay').classList.add('merchant-hidden');
            _hideChestCtxMenu();
            import('./equipment.js').then(m => m.hideTooltip());
        };
    }

    // Anvil modal close
    const anvilCloseBtn = document.getElementById('anvil-close');
    if (anvilCloseBtn) {
        anvilCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('anvil-overlay').classList.add('chest-hidden');
            _hideChestCtxMenu();
            import('./equipment.js').then(m => m.hideTooltip());
        };
    }

    // Merchant buy button
    const merchantBuyBtn = document.getElementById('merchant-buy-btn');
    if (merchantBuyBtn) {
        merchantBuyBtn.onclick = (e) => {
            e.stopPropagation();
            _buyItems();
        };
    }

    // Merchant sell button
    const merchantSellBtn = document.getElementById('merchant-sell-btn');
    if (merchantSellBtn) {
        merchantSellBtn.onclick = (e) => {
            e.stopPropagation();
            _sellItems();
        };
    }

    // Merchant tab buttons
    const tabBuy = document.getElementById('merchant-tab-buy');
    const tabSell = document.getElementById('merchant-tab-sell');
    if (tabBuy) tabBuy.onclick = (e) => { e.stopPropagation(); _switchMerchantTab('buy'); };
    if (tabSell) tabSell.onclick = (e) => { e.stopPropagation(); _switchMerchantTab('sell'); };

    // Cabinet modal close
    const cabinetCloseBtn = document.getElementById('cabinet-close');
    if (cabinetCloseBtn) {
        cabinetCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('cabinet-overlay').classList.add('chest-hidden');
            _hideChestCtxMenu();
            import('./equipment.js').then(m => m.hideTooltip());
        };
    }

    // Corpse modal close
    const corpseCloseBtn = document.getElementById('corpse-close');
    if (corpseCloseBtn) {
        corpseCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('corpse-overlay').classList.add('chest-hidden');
            _hideChestCtxMenu();
            import('./equipment.js').then(m => m.hideTooltip());
        };
    }

    // Alchemy modal close
    const alchemyCloseBtn = document.getElementById('alchemy-close');
    if (alchemyCloseBtn) {
        alchemyCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('alchemy-overlay').classList.add('chest-hidden');
            _alchemyModalOpen = false;
            _hideAlchemyItemPicker();
            _hideChestCtxMenu();
            import('./equipment.js').then(m => m.hideTooltip());
        };
    }

    // Alchemy picker close
    const alchemyPickerCloseBtn = document.getElementById('alchemy-picker-close');
    if (alchemyPickerCloseBtn) {
        alchemyPickerCloseBtn.onclick = (e) => {
            e.stopPropagation();
            _hideAlchemyItemPicker();
        };
    }

    // Transmute button
    const transmuteBtn = document.getElementById('alchemy-transmute-btn');
    if (transmuteBtn) {
        transmuteBtn.onclick = (e) => {
            e.stopPropagation();
            _transmute();
        };
    }

    // Stop ALL clicks inside the cabinet overlay from reaching the window listener
    // (so clicking items inside doesn't trigger world raycasting either)
    const cabinetOverlay = document.getElementById('cabinet-overlay');
    if (cabinetOverlay) {
        cabinetOverlay.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for chest overlay
    const chestOverlayEl = document.getElementById('chest-overlay');
    if (chestOverlayEl) {
        chestOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for corpse overlay
    const corpseOverlayEl = document.getElementById('corpse-overlay');
    if (corpseOverlayEl) {
        corpseOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for merchant overlay
    const merchantOverlayEl = document.getElementById('merchant-overlay');
    if (merchantOverlayEl) {
        merchantOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for alchemy overlay
    const alchemyOverlayEl = document.getElementById('alchemy-overlay');
    if (alchemyOverlayEl) {
        alchemyOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for anvil overlay
    const anvilOverlayEl = document.getElementById('anvil-overlay');
    if (anvilOverlayEl) {
        anvilOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Dismiss chest context menu on outside click
    document.addEventListener('mousedown', (e) => {
        if (!_chestCtxOpen) return;
        const menu = document.getElementById('chest-ctx-menu');
        if (!menu.contains(e.target)) _hideChestCtxMenu();
    });
}

export function addChest(scene, loader, col, row, rotY, offsetZ = 0, contents = [], modelPath = '/items/Meshy_AI_Treasure_Chest_0221184131_texture.glb', interactive = true) {
    loader.load(modelPath, (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.3);
        model.position.set(col * CELL, 0.23, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (interactive) {
                    child.userData.isChest = true;
                    child.userData.gridRow = row;
                    child.userData.gridCol = col;
                    child.userData.contents = contents;
                }

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}


export function spawnObjectsForLevel() {
    const gltfLoader = new GLTFLoader();
    const level = window.currentLevel || 1;
    objects.length = 0; // clear logical array

    if (level === 1) {
        // Chest in the starter room
        addChest(objectsGroup, gltfLoader, 11, 13, 0, 0.7, [
            'Leather Boots', 'Steel Arrows', 'Poison Arrows', 'Torch',
            'Leather Cap', 'Iron Helm', 'Padded Vest', 'Leather Belt',
            'Adventurer\'s Belt', 'Chain Shirt', 'Plate Cuirass',
            'Iron Gauntlets', 'Chainmail Leggings', 'Iron-Shod Boots',
            'Greatsword', 'War Hammer', 'Longbow',
            'Ring of Strength', 'Ring of Dexterity', 'Ring of Dexterity', 'Ring of Resilience', 'Ring of Wisdom', 'Ring of Vigour',
            'Elven Dagger'
        ]);
        // New Chest at the end of the long passage
        addChest(objectsGroup, gltfLoader, 7, 1, 0, -0.7, [
            'Leather Gloves', 'Cloth Trousers', 'Worn Boots', 'Dagger', 'Axe', 'Ring of Vigour', 'Mace', 'Ring of Wisdom'
        ]);
        // Crystals in the starter room
        addCrystals(objectsGroup, gltfLoader, 9, 11, 0, -0.7);
        // Bone pile in the passage
        addBonePile(objectsGroup, gltfLoader, 1, 27);
        // Corpse in the starter room area (with empty slots for inventory)
        addBonePile(objectsGroup, gltfLoader, 11, 12, [
            null, null, null, null, null,
            null, null, null, null, null,
            null, null, null, null, null,
            null, null, null, null, null,
            null, null, null, null, null
        ]);

        // Spell Cabinet in the starter room
        addSpellCabinet(objectsGroup, gltfLoader, 12, 13, Math.PI, 0.6, [
            'Scroll of Fireball',
            'Scroll of Heal',
            'Scroll of Regeneration',
            'Scroll of Cure Poison',
        ]);

        // Shop against the east wall of the 8×8 room, centre row
        // col 23 is the last floor cell before the east wall (col 24); offsetX pushes it flush
        addShop(objectsGroup, gltfLoader, 23, 11, -Math.PI / 2, -0.2, 0);

        // Decorative chest beside the merchant (same cell, nudged south, non-interactive)
        addChest(objectsGroup, gltfLoader, 23, 11, -Math.PI / 2, 0.7, [], '/items/chest1.glb', false);

        // Portal to Level 2
        // Positioned at col 13, row 13 against the East wall.
        // It's on an East wall, so rotate it Math.PI / 2 radians to face West (inward to the room).
        addPortal(objectsGroup, gltfLoader, 13, 13, 2, Math.PI / 2, 0.85, 0);

        // Alchemy Workshop in the big east room against the south wall
        addAlchemyWorkshop(objectsGroup, gltfLoader, 19, 14, 0, 0, 0.85);

        // Anvil in the big east room against the north wall
        addAnvil(objectsGroup, gltfLoader, 19, 7, 0, 0, -0.85, ['Life Essence', 'Life Essence']);

        // Jester against the north wall of the east room
        addJester(objectsGroup, gltfLoader, 17, 7, 0, 0, -0.8);

        // Portcullis: Row 7, Col 7.
        addPortcullis(objectsGroup, gltfLoader, 7, 7);

        // Button for portcullis
        const buttonContainer = new THREE.Group();
        const plateGeo = new THREE.BoxGeometry(0.05, 0.3, 0.2);
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x443322 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        buttonContainer.add(plate);

        const btnGeo = new THREE.BoxGeometry(0.08, 0.12, 0.12);
        const btnMat = new THREE.MeshLambertMaterial({ color: 0xaa2222 });
        const btn = new THREE.Mesh(btnGeo, btnMat);
        btn.position.x = 0.04;
        btn.userData = { isButton: true, target: 'portcullis' };
        buttonContainer.add(btn);

        buttonContainer.position.set(8 * CELL - 1.0, 1.25, 8 * CELL);
        objectsGroup.add(buttonContainer);

    } else if (level === 2) {
        // Portal back to Level 1.
        addPortal(objectsGroup, gltfLoader, 5, 1, 1, 0, 0, -0.85);

        // Opposite side of the room (South wall).
        // It's at the end of the long south passage now.
        // row=12, col=5
        // Math.PI faces North.
        addPortal(objectsGroup, gltfLoader, 5, 12, 3, Math.PI, 0, 0.85);

        // Locked Portcullis at the entrance of the passage (moved 2 squares back for vestibule)
        addPortcullis(objectsGroup, gltfLoader, 5, 8);

        // Keyhole next to the portcullis on the West wall (moved 1.0 grid squares back for accessibility)
        addKeyhole(objectsGroup, gltfLoader, 5, 8, Math.PI / 2, -0.85, -2.0);
    } else if (level === 3) {
        // Portal back to Level 2.
        // Start position in level 3 is [5, 1], against the West wall (col 0)
        // Math.PI/2 faces East (into the room)
        addPortal(objectsGroup, gltfLoader, 1, 5, 2, Math.PI / 2, -0.85, 0);
    }
}

function addPortcullis(scene, loader, col, row) {
    const portcullis = {
        name: 'Portcullis',
        path: '/items/Meshy_AI_Iron_Portcullis_0221184348_texture.glb',
        gridRow: row,
        gridCol: col,
        x: col * CELL,
        z: row * CELL,
        isOpen: false
    };
    loader.load(portcullis.path, (gltf) => {
        const model = gltf.scene;
        model.scale.set(1.15, 0.9, 1.15);
        model.position.set(portcullis.x, 1.1, portcullis.z);
        scene.add(model);
        portcullis.mesh = model;
    });
    objects.push(portcullis);
}

function addKeyhole(scene, loader, col, row, rotY, offsetX = 0, offsetZ = 0, targetRow = null, targetCol = null) {
    loader.load('/items/keyhole.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.2); // half the previous size (0.4)
        model.position.set(col * CELL + offsetX, 0.95, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isKeyhole = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                // Which portcullis does it open? If not specified, open the one on its own cell
                child.userData.targetRow = targetRow !== null ? targetRow : row;
                child.userData.targetCol = targetCol !== null ? targetCol : col;

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addPortal(scene, loader, col, row, targetLevel, rotY = 0, offsetX = 0, offsetZ = 0) {
    loader.load('/items/Meshy_AI_Blue_Portal_0222102604_texture.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.6, row * CELL + offsetZ);
        model.rotation.y = rotY;

        // Add a gentle rotation animation to the portal? Not directly supported here unless we put it in an update loop.
        // We can just add a light for atmosphere.
        const light = new THREE.PointLight(0x0088ff, 4, 4);
        light.position.set(col * CELL + offsetX, 0.6, row * CELL + offsetZ);
        scene.add(light);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = false;
                child.userData.isPortal = true;
                child.userData.targetLevel = targetLevel;
                child.userData.gridRow = row;
                child.userData.gridCol = col;

                // Fix pixelation by ensuring smooth filtering and max texture resolution across all material maps
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addShop(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    _shopGridCells.add(`${row},${col}`); // block player movement through this cell
    loader.load('/npcs/merchant1/merchant-idle.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.5);
        model.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isShop = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(gltf.animations[0]).play();
            _mixers.push(mixer);
        }

        scene.add(model);
    });
}





function addSpellCabinet(scene, loader, col, row, rotY, offsetZ = 0, contents = []) {
    loader.load('/items/spell-cabinet.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL, 0.65, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isSpellCabinet = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addCrystals(scene, loader, col, row, rotY, offsetX = 0) {
    loader.load('/items/Meshy_AI_Crystals_0221193313_texture.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        // Positioned at 0.5 to touch the floor
        model.position.set(col * CELL + offsetX, 0.5, row * CELL);
        model.rotation.y = rotY;

        // Add a mystical light source at the crystals
        const light = new THREE.PointLight(0x00ffff, 5, 3);
        light.position.set(col * CELL + offsetX, 0.8, row * CELL);
        scene.add(light);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isCrystal = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.light = light; // Store light reference for animation

                if (child.material) {
                    // Give them a nice cyan mystical glow
                    child.material.emissive = new THREE.Color(0x00ffff);
                    child.material.emissiveIntensity = 0.5;

                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addAlchemyWorkshop(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, interactive = true) {
    loader.load('/items/Alchemy_Workshop.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.5, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (interactive) {
                    child.userData.isAlchemyWorkshop = true;
                    child.userData.gridRow = row;
                    child.userData.gridCol = col;
                }

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(gltf.animations[0]).play();
            _mixers.push(mixer);
        }

        scene.add(model);

        // Add a subtle alchemical glow
        const light = new THREE.PointLight(0x44ff44, 3, 4);
        light.position.set(col * CELL + offsetX, 1.2, row * CELL + offsetZ);
        scene.add(light);
    });
}

function addAnvil(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, contents = []) {
    loader.load('/items/anvil.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.5, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isAnvil = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addJester(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    const paths = [
        '/npcs/jester/Meshy_AI_Animation_Agree_Gesture_withSkin.glb',
        '/npcs/jester/Meshy_AI_Animation_Alert_withSkin.glb'
    ];
    const models = [];

    let loadedCount = 0;
    paths.forEach((path, index) => {
        loader.load(path, (gltf) => {
            const model = gltf.scene;
            model.scale.setScalar(0.7);
            model.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
            model.rotation.y = rotY;
            model.visible = (index === 0);

            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => {
                            ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                                if (mat[mapName]) {
                                    mat[mapName].magFilter = THREE.LinearFilter;
                                    mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                    mat[mapName].anisotropy = 16;
                                }
                            });
                        });
                    }
                }
            });

            if (gltf.animations && gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                mixer.clipAction(gltf.animations[0]).play();
                _mixers.push(mixer);
            }

            models[index] = model;
            scene.add(model);

            loadedCount++;
            if (loadedCount === paths.length) {
                // Alternating logic
                let currentIdx = 0;
                const intervalId = setInterval(() => {
                    // Safety check: if models are removed from group, clear interval
                    if (!models[0].parent) {
                        clearInterval(intervalId);
                        return;
                    }
                    models[currentIdx].visible = false;
                    currentIdx = (currentIdx + 1) % models.length;
                    models[currentIdx].visible = true;
                }, 6000); // switch every 6 seconds
                _intervals.push(intervalId);
            }
        });
    });
}

export function openPortcullis(p) {
    if (p.isOpen) return;
    p.isOpen = true;
    showMessage("The portcullis slowly grinds open...");

    // Play a heavy grinding sound if available (simulated)
    const grindAudio = new Audio('/sounds/actions/bash.mp3'); // or a better sound if found
    grindAudio.volume = 0.5;
    grindAudio.play().catch(e => { });

    // Animate mesh up
    new Tween(p.mesh.position, tweenGroup)
        .to({ y: 3.3 }, 2500)
        .easing(Easing.Quadratic.InOut)
        .onComplete(() => {
            // Update map passability
            dungeonMap[p.gridRow][p.gridCol] = CELL_FLOOR;
        })
        .start();
}

export function openChestModal(chestObj) {
    _activeSentLabelId = 'chest-sent-label';
    const overlay = document.getElementById('chest-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('chest-sent-label').textContent = '';

    const slots = document.querySelectorAll('.chest-slot');
    const contents = chestObj.userData.contents || [];

    import('./equipment.js').then(equip => {
        _bindChestSlots(equip, slots, contents);
    });
}

export function openSpellCabinetModal(cabinetObj) {
    _activeSentLabelId = 'cabinet-sent-label';
    const overlay = document.getElementById('cabinet-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('cabinet-sent-label').textContent = '';

    const slots = document.querySelectorAll('.cabinet-slot');
    const contents = cabinetObj.userData.contents || [];

    import('./equipment.js').then(equip => {
        _bindChestSlots(equip, slots, contents);
    });
}

export function openAnvilModal(anvilObj) {
    _activeSentLabelId = 'anvil-sent-label';
    const overlay = document.getElementById('anvil-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('anvil-sent-label').textContent = '';

    const slots = document.querySelectorAll('.anvil-slot');
    const contents = anvilObj.userData.contents || [];

    import('./equipment.js').then(equip => {
        _bindChestSlots(equip, slots, contents);
    });
}

export function openCorpseModal(corpseObj) {
    _activeSentLabelId = 'corpse-sent-label';
    const overlay = document.getElementById('corpse-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('corpse-sent-label').textContent = '';

    const slots = document.querySelectorAll('.corpse-slot');
    const contents = corpseObj.userData.contents || [];

    import('./equipment.js').then(equip => {
        _bindChestSlots(equip, slots, contents);
    });
}

export function openMerchantModal() {
    _merchantBasket = [];
    _merchantSellBasket = [];
    _merchantMode = 'buy';
    document.getElementById('merchant-overlay').classList.remove('merchant-hidden');
    _switchMerchantTab('buy');
}

function _switchMerchantTab(mode) {
    _merchantMode = mode;
    const buyBody = document.getElementById('merchant-body');
    const sellBody = document.getElementById('merchant-sell-body');
    const tabBuy = document.getElementById('merchant-tab-buy');
    const tabSell = document.getElementById('merchant-tab-sell');

    if (mode === 'buy') {
        buyBody.style.display = 'flex';
        sellBody.style.display = 'none';
        tabBuy.classList.add('merchant-tab-active');
        tabSell.classList.remove('merchant-tab-active');
        _renderMerchantShop();
        _renderMerchantBasket();
        _updateMerchantTotals();
    } else {
        buyBody.style.display = 'none';
        sellBody.style.display = 'flex';
        tabBuy.classList.remove('merchant-tab-active');
        tabSell.classList.add('merchant-tab-active');
        _renderMerchantPartyItems();
        _renderMerchantSellBasket();
        _updateMerchantSellTotals();
    }
}

function _renderMerchantShop() {
    const grid = document.getElementById('merchant-grid');
    grid.innerHTML = '';

    import('./equipment.js').then(equip => {
        _merchantAvailable
            .filter(name => !_merchantBasket.includes(name))
            .forEach(name => {
                const itemDef = getItemDef(name);
                if (!itemDef) return;

                const slot = document.createElement('div');
                slot.className = 'merch-slot';

                const img = document.createElement('img');
                img.src = itemDef.icon;
                img.title = name;
                slot.appendChild(img);

                const price = document.createElement('div');
                price.className = 'merch-price';
                price.textContent = `${MERCHANT_PRICES[name] ?? '?'}g`;
                slot.appendChild(price);

                slot.addEventListener('click', () => {
                    _merchantBasket.push(name);
                    _renderMerchantShop();
                    _renderMerchantBasket();
                    _updateMerchantTotals();
                });

                equip.attachTooltipListeners(slot, () => ({ name }));

                grid.appendChild(slot);
            });
    });
}

function _renderMerchantBasket() {
    const grid = document.getElementById('merchant-basket-grid');
    grid.innerHTML = '';

    import('./equipment.js').then(equip => {
        _merchantBasket.forEach((name, idx) => {
            const itemDef = getItemDef(name);
            if (!itemDef) return;

            const slot = document.createElement('div');
            slot.className = 'merch-slot';

            const img = document.createElement('img');
            img.src = itemDef.icon;
            img.title = name;
            slot.appendChild(img);

            const price = document.createElement('div');
            price.className = 'merch-price';
            price.textContent = `${MERCHANT_PRICES[name] ?? '?'}g`;
            slot.appendChild(price);

            // Click basket item → return it to the shop
            slot.addEventListener('click', () => {
                _merchantBasket.splice(idx, 1);
                _renderMerchantShop();
                _renderMerchantBasket();
                _updateMerchantTotals();
            });

            equip.attachTooltipListeners(slot, () => ({ name }));

            grid.appendChild(slot);
        });
    });
}

function _updateMerchantTotals() {
    const total = _merchantBasket.reduce((sum, name) => sum + (MERCHANT_PRICES[name] ?? 0), 0);

    document.getElementById('merchant-total-val').textContent = total;
    document.getElementById('merchant-gold-val').textContent = partyGold;

    const buyBtn = document.getElementById('merchant-buy-btn');
    buyBtn.disabled = _merchantBasket.length === 0 || partyGold < total;
}

function _buyItems() {
    const total = _merchantBasket.reduce((sum, name) => sum + (MERCHANT_PRICES[name] ?? 0), 0);
    if (partyGold < total) return;

    import('./equipment.js').then(equip => {
        const boughtItems = [];
        const failedItems = [];

        // Try to add each item to inventory
        for (const itemName of _merchantBasket) {
            let added = false;
            // Try to find a slot in any party member's inventory
            for (let i = 0; i < 4; i++) {
                if (party[i].isEmpty) continue;
                if (equip.addItemToInventory(i, itemName)) {
                    added = true;
                    boughtItems.push(itemName);
                    break;
                }
            }
            if (!added) {
                failedItems.push(itemName);
            }
        }

        // Calculate cost of successfully bought items
        const spent = boughtItems.reduce((sum, name) => sum + (MERCHANT_PRICES[name] ?? 0), 0);

        if (spent > 0) {
            removeGold(spent);
            showMessage(`Bought ${boughtItems.length} items for ${spent} gold.`);
        }

        if (failedItems.length > 0) {
            showMessage(`Could not carry ${failedItems.length} items (inventory full).`);
        }

        // Remove bought items from available stock
        for (const item of boughtItems) {
            const stockIdx = _merchantAvailable.indexOf(item);
            if (stockIdx > -1) _merchantAvailable.splice(stockIdx, 1);
        }

        // Basket should now only contain failed items
        _merchantBasket = failedItems;

        _renderMerchantShop();
        _renderMerchantBasket();
        _updateMerchantTotals();
    });
}

// ── Sell-side helpers ────────────────────────────────────────────────────

function _getMerchantSellPrice(name) {
    const def = getItemDef(name);
    if (!def) return 0;
    // Offer 50% of merchant buy price if stocked; otherwise use item base value
    if (MERCHANT_PRICES[name] != null) return Math.floor(MERCHANT_PRICES[name] * 0.5);
    return def.value ?? 0;
}

function _renderMerchantPartyItems() {
    const grid = document.getElementById('merchant-party-grid');
    grid.innerHTML = '';

    const CHARACTER_LABELS = ['A', 'B', 'C', 'D'];

    import('./equipment.js').then(equip => {
        for (let ci = 0; ci < 4; ci++) {
            const member = party[ci];
            if (!member || member.isEmpty) continue;

            member.inventory.forEach((item, invIdx) => {
                if (!item) return;
                // Skip if already in the sell basket
                if (_merchantSellBasket.some(e => e.charIndex === ci && e.invIndex === invIdx)) return;

                const def = getItemDef(item.name);
                if (!def) return;

                const sellPrice = _getMerchantSellPrice(item.name);

                const slot = document.createElement('div');
                slot.className = 'merch-slot';

                const tag = document.createElement('div');
                tag.className = 'merch-char-tag';
                tag.textContent = CHARACTER_LABELS[ci];
                slot.appendChild(tag);

                const img = document.createElement('img');
                img.src = def.icon;
                img.title = item.name;
                slot.appendChild(img);

                const price = document.createElement('div');
                price.className = 'merch-price';
                price.textContent = `${sellPrice}g`;
                slot.appendChild(price);

                slot.addEventListener('click', () => {
                    _merchantSellBasket.push({ charIndex: ci, invIndex: invIdx, name: item.name });
                    _renderMerchantPartyItems();
                    _renderMerchantSellBasket();
                    _updateMerchantSellTotals();
                });

                equip.attachTooltipListeners(slot, () => ({ name: item.name }));

                grid.appendChild(slot);
            });
        }
    });
}

function _renderMerchantSellBasket() {
    const grid = document.getElementById('merchant-sell-basket-grid');
    grid.innerHTML = '';

    import('./equipment.js').then(equip => {
        _merchantSellBasket.forEach((entry, idx) => {
            const def = getItemDef(entry.name);
            if (!def) return;

            const sellPrice = _getMerchantSellPrice(entry.name);

            const slot = document.createElement('div');
            slot.className = 'merch-slot';

            const img = document.createElement('img');
            img.src = def.icon;
            img.title = entry.name;
            slot.appendChild(img);

            const price = document.createElement('div');
            price.className = 'merch-price';
            price.textContent = `${sellPrice}g`;
            slot.appendChild(price);

            // Click → return item to party panel
            slot.addEventListener('click', () => {
                _merchantSellBasket.splice(idx, 1);
                _renderMerchantPartyItems();
                _renderMerchantSellBasket();
                _updateMerchantSellTotals();
            });

            equip.attachTooltipListeners(slot, () => ({ name: entry.name }));

            grid.appendChild(slot);
        });
    });
}

function _updateMerchantSellTotals() {
    const total = _merchantSellBasket.reduce((sum, e) => sum + _getMerchantSellPrice(e.name), 0);

    document.getElementById('merchant-sell-total-val').textContent = total;
    document.getElementById('merchant-sell-gold-val').textContent = partyGold;

    const sellBtn = document.getElementById('merchant-sell-btn');
    sellBtn.disabled = _merchantSellBasket.length === 0;
}

function _sellItems() {
    if (_merchantSellBasket.length === 0) return;

    const total = _merchantSellBasket.reduce((sum, e) => sum + _getMerchantSellPrice(e.name), 0);
    const soldNames = _merchantSellBasket.map(e => e.name);

    // Remove items from inventory (process in reverse index order per character to avoid index shifting)
    const byChar = {};
    for (const entry of _merchantSellBasket) {
        if (!byChar[entry.charIndex]) byChar[entry.charIndex] = [];
        byChar[entry.charIndex].push(entry.invIndex);
    }
    for (const ci of Object.keys(byChar)) {
        const indices = byChar[ci].sort((a, b) => b - a); // descending so splicing doesn't shift
        for (const idx of indices) {
            party[ci].inventory[idx] = null;
        }
    }

    addGold(total);
    showMessage(`Sold ${soldNames.length} item${soldNames.length > 1 ? 's' : ''} for ${total} gold.`);

    _merchantSellBasket = [];
    _renderMerchantPartyItems();
    _renderMerchantSellBasket();
    _updateMerchantSellTotals();
}

function _bindChestSlots(equip, slots, contents) {
    slots.forEach((slot, i) => {
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null;
        slot.oncontextmenu = null;

        const itemName = contents[i];
        if (itemName) {
            const itemDef = getItemDef(itemName);
            if (itemDef) {
                slot.classList.add('occupied');
                const img = document.createElement('img');
                img.src = itemDef.icon;
                img.title = itemDef.name;
                slot.appendChild(img);

                // Left-click → send to first available party member
                slot.onclick = () => {
                    const defaultIdx = party.findIndex(m => !m.isEmpty);
                    if (defaultIdx !== -1) _sendChestItem(equip, slots, contents, i, itemDef, defaultIdx);
                };

                // Right-click → pick recipient
                slot.oncontextmenu = (e) => {
                    e.preventDefault();
                    _showChestCtxMenu(e.clientX, e.clientY, equip, slots, contents, i, itemDef);
                };
            }
        }

        // Hover tooltip — call this for ALL slots to ensure listeners are updated or cleared
        equip.attachTooltipListeners(slot, () => contents[i] ? { name: contents[i] } : null);
    });
}

function _sendChestItem(equip, slots, contents, slotIdx, itemDef, targetIdx) {
    const target = party[targetIdx];
    const success = equip.addItemToInventory(targetIdx, itemDef.name);
    if (success) {
        if (_activeSentLabelId) {
            const label = document.getElementById(_activeSentLabelId);
            if (label) label.textContent = `Sent to ${target.name}`;
        }
        contents[slotIdx] = null;
        const slot = slots[slotIdx];
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null;
        slot.oncontextmenu = null;
        equip.hideTooltip();
    } else {
        showMessage(`${target.name}'s inventory is full!`);
    }
}

function _showChestCtxMenu(x, y, equip, slots, contents, slotIdx, itemDef) {
    const menu = document.getElementById('chest-ctx-menu');
    const list = document.getElementById('chest-ctx-list');
    list.innerHTML = '';

    party.filter(m => !m.isEmpty).forEach(target => {
        const targetIdx = party.indexOf(target);
        const row = document.createElement('div');
        row.className = 'inv-ctx-give-item';

        const canvas = document.createElement('canvas');
        canvas.width = 26;
        canvas.height = 26;
        drawPortrait(canvas, target);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = target.name;

        row.appendChild(canvas);
        row.appendChild(nameSpan);
        row.addEventListener('click', () => {
            _sendChestItem(equip, slots, contents, slotIdx, itemDef, targetIdx);
            _hideChestCtxMenu();
        });
        list.appendChild(row);
    });

    menu.classList.remove('chest-ctx-hidden');
    _chestCtxOpen = true;

    // Position near cursor, flip if near viewport edges
    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let lx = x + 6;
    let ly = y + 4;
    if (lx + mw > vw - 8) lx = x - mw - 6;
    if (ly + mh > vh - 8) ly = y - mh - 4;
    menu.style.left = lx + 'px';
    menu.style.top = ly + 'px';
}

// ── Recipes: [ [ingredients...], resultName ] ────────────────────────────────
const ALCHEMY_RECIPES = [
    { ingredients: ['Life Essence', 'Life Berry'], result: 'Healing Potion' },
    { ingredients: ['Life Essence', 'Poison Vial'], result: 'Cure Poison Potion' },
];

function _transmute() {
    // Gather ingredients (slots 0-7)
    const ingredients = _alchemyContents.slice(0, 8).filter(Boolean);

    if (ingredients.length === 0) {
        showMessage('Add ingredients before transmuting.');
        return;
    }

    // Try each recipe
    let matchedResult = null;
    for (const recipe of ALCHEMY_RECIPES) {
        const pool = [...ingredients];
        let matched = true;
        for (const needed of recipe.ingredients) {
            const idx = pool.indexOf(needed);
            if (idx === -1) { matched = false; break; }
            pool.splice(idx, 1);
        }
        if (matched) {
            matchedResult = recipe.result;
            break;
        }
    }

    // Consume all ingredients regardless of outcome
    for (let i = 0; i < 8; i++) _alchemyContents[i] = null;

    if (matchedResult) {
        _alchemyContents[8] = matchedResult;
        showMessage(`Transmutation successful! You created a ${matchedResult}.`);
        playAlchemySound();
    } else {
        _alchemyContents[8] = null;
        showMessage('The transmutation failed — ingredients lost.');
    }

    _renderAlchemySlots();
}

export function openAlchemyModal() {
    _alchemyModalOpen = true;
    playAlchemySound();
    _activeSentLabelId = null;
    const overlay = document.getElementById('alchemy-overlay');
    overlay.classList.remove('chest-hidden');

    _renderAlchemySlots();
}

/**
 * Renders the current _alchemyContents into the alchemy modal slots.
 */
function _renderAlchemySlots() {
    const slots = document.querySelectorAll('.alchemy-slot');
    import('./equipment.js').then(equip => {
        slots.forEach((slot, i) => {
            slot.innerHTML = '';
            slot.classList.remove('occupied');
            slot.onclick = null;
            slot.oncontextmenu = null;

            const itemName = _alchemyContents[i];
            if (!itemName) {
                // Empty slot hint
                if (i < 8) { // Only for ingredient slots, not result
                    slot.onclick = (e) => _showAlchemyItemPicker(e.clientX, e.clientY, i);
                    equip.attachTooltipListeners(slot, () => ({ name: "Empty Ingredient Slot", description: "Click to select an ingredient from your party's inventory." }));
                }
                return;
            }

            const itemDef = getItemDef(itemName);
            if (!itemDef) return;

            slot.classList.add('occupied');
            const img = document.createElement('img');
            img.src = itemDef.icon;
            img.title = itemDef.name;
            slot.appendChild(img);

            // Left-click → send to first available party member (remove from academy)
            slot.onclick = () => {
                const defaultIdx = party.findIndex(m => !m.isEmpty);
                if (defaultIdx !== -1) {
                    const success = equip.addItemToInventory(defaultIdx, itemName);
                    if (success) {
                        _alchemyContents[i] = null;
                        _renderAlchemySlots();
                        equip.hideTooltip();
                    } else {
                        showMessage(`${party[defaultIdx].name}'s inventory is full!`);
                    }
                }
            };

            // Right-click → pick recipient
            slot.oncontextmenu = (e) => {
                e.preventDefault();
                _showAlchemyCtxMenu(e.clientX, e.clientY, equip, i, itemDef);
            };

            // Hover tooltip
            equip.attachTooltipListeners(slot, () => _alchemyContents[i] ? { name: _alchemyContents[i] } : null);
        });
    });
}

/**
 * Shows a context menu to pick which party member takes the item from alchemy.
 */
function _showAlchemyCtxMenu(x, y, equip, slotIdx, itemDef) {
    const menu = document.getElementById('chest-ctx-menu');
    const list = document.getElementById('chest-ctx-list');
    list.innerHTML = '';

    party.filter(m => !m.isEmpty).forEach(target => {
        const targetIdx = party.indexOf(target);
        const row = document.createElement('div');
        row.className = 'inv-ctx-give-item';

        const canvas = document.createElement('canvas');
        canvas.width = 26;
        canvas.height = 26;
        drawPortrait(canvas, target);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = target.name;

        row.appendChild(canvas);
        row.appendChild(nameSpan);
        row.addEventListener('click', () => {
            const success = equip.addItemToInventory(targetIdx, itemDef.name);
            if (success) {
                _alchemyContents[slotIdx] = null;
                _renderAlchemySlots();
                equip.hideTooltip();
            } else {
                showMessage(`${target.name}'s inventory is full!`);
            }
            _hideChestCtxMenu();
        });
        list.appendChild(row);
    });

    menu.classList.remove('chest-ctx-hidden');
    _chestCtxOpen = true;

    // Position near cursor
    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let lx = x + 6;
    let ly = y + 4;
    if (lx + mw > vw - 8) lx = x - mw - 6;
    if (ly + mh > vh - 8) ly = y - mh - 4;
    menu.style.left = lx + 'px';
    menu.style.top = ly + 'px';
}

/**
 * Shows a picker with all unequipped loot items from the party's collective inventory.
 */
function _showAlchemyItemPicker(x, y, slotIdx) {
    const picker = document.getElementById('alchemy-picker');
    const grid = document.getElementById('alchemy-picker-grid');
    grid.innerHTML = '';

    let hasLoot = false;

    import('./equipment.js').then(equip => {
        party.forEach((member, memberIdx) => {
            if (member.isEmpty) return;

            member.inventory.forEach((item, invIdx) => {
                if (!item) return;
                const itemName = item.name; // inventory stores { name, slot } objects
                const def = getItemDef(itemName);
                if (def?.slot !== 'loot') return;

                hasLoot = true;
                const slot = document.createElement('div');
                slot.className = 'picker-slot';

                const img = document.createElement('img');
                img.src = def.icon;
                img.title = `${def.name} (${member.name})`;
                slot.appendChild(img);

                // Mini portrait of owner
                const owner = document.createElement('div');
                owner.className = 'picker-slot-owner';
                const canvas = document.createElement('canvas');
                canvas.width = 14;
                canvas.height = 14;
                drawPortrait(canvas, member);
                owner.appendChild(canvas);
                slot.appendChild(owner);

                slot.onclick = () => {
                    // Move item: store string name in alchemy, clear inventory slot
                    _alchemyContents[slotIdx] = itemName;
                    member.inventory[invIdx] = null;
                    _renderAlchemySlots();
                    _hideAlchemyItemPicker();
                    equip.hideTooltip();
                };

                equip.attachTooltipListeners(slot, () => ({ name: def.name, description: `Held by ${member.name}. Click to add to workshop.` }));
                grid.appendChild(slot);
            });
        });

        if (!hasLoot) {
            const msg = document.createElement('div');
            msg.className = 'picker-empty-msg';
            msg.textContent = "No ingredients found in party inventory.";
            grid.appendChild(msg);
        }

        picker.classList.remove('picker-hidden');

        // Position near clicked slot
        const pw = picker.offsetWidth || 280;
        const ph = picker.offsetHeight || 200;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Prefer showing it above the clicked point
        let lx = x - (pw / 2);
        let ly = y - ph - 10;

        if (lx < 10) lx = 10;
        if (lx + pw > vw - 10) lx = vw - pw - 10;
        if (ly < 10) ly = y + 20; // Flip below if no space above
        if (ly + ph > vh - 10) ly = vh - ph - 10;

        picker.style.left = lx + 'px';
        picker.style.top = ly + 'px';
    });
}

function _hideAlchemyItemPicker() {
    const picker = document.getElementById('alchemy-picker');
    if (picker) picker.classList.add('picker-hidden');
}

/**
 * Returns true if the alchemy modal is currently visible.
 */
export function isAlchemyModalOpen() {
    return _alchemyModalOpen;
}

/**
 * Tries to add an item to the first available ingredient slot (0-7).
 */
export function addItemToAlchemy(itemName) {
    for (let i = 0; i < 8; i++) {
        if (_alchemyContents[i] === null) {
            _alchemyContents[i] = itemName;
            if (_alchemyModalOpen) _renderAlchemySlots();
            return true;
        }
    }
    showMessage("The alchemy workshop ingredient slots are full!");
    return false;
}

function _hideChestCtxMenu() {
    document.getElementById('chest-ctx-menu').classList.add('chest-ctx-hidden');
    _chestCtxOpen = false;
}

function addBonePile(scene, loader, col, row, contents = []) {
    loader.load('/items/Meshy_AI_Bone_pile_0221211647_texture.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.4);
        model.position.set(col * CELL, 0.05, row * CELL);
        model.rotation.y = Math.random() * Math.PI * 2;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isBonePile = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

export function spawnCorpse(col, row, droppedItems = []) {
    // Create corpse with 25 inventory slots — fill first slots with any dropped items
    const corpseContents = [
        null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null
    ];

    // Place dropped items into the first available slots
    let slotIdx = 0;
    for (const itemName of droppedItems) {
        if (slotIdx >= corpseContents.length) break;
        corpseContents[slotIdx] = itemName;
        slotIdx++;
    }

    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/items/Meshy_AI_Bone_pile_0221211647_texture.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.4);
        model.position.set(col * CELL, 0.05, row * CELL);
        model.rotation.y = Math.random() * Math.PI * 2;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isBonePile = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = corpseContents;

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        objectsGroup.add(model);
    });
}

export function spawnDroppedItem(col, row, itemName) {
    const geometry = new THREE.SphereGeometry(0.15, 8, 8);
    const material = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        emissive: 0xff8800,
        emissiveIntensity: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(col * CELL, 0.5, row * CELL);

    mesh.userData.isDroppedItem = true;
    mesh.userData.itemName = itemName;
    mesh.userData.gridCol = col;
    mesh.userData.gridRow = row;

    // Optional: add a light
    const light = new THREE.PointLight(0xffaa00, 1, 3);
    light.position.set(0, 0.2, 0);
    mesh.add(light);

    // Animation
    const originY = mesh.position.y;
    new Tween(mesh.position, tweenGroup)
        .to({ y: originY + 0.2 }, 1000)
        .easing(Easing.Quadratic.InOut)
        .yoyo(true)
        .repeat(Infinity)
        .start();

    objectsGroup.add(mesh);
}

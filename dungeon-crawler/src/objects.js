import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CELL, dungeonMap, CELL_FLOOR } from './map.js';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, isInFrontOfPlayer, player } from './player.js';
import { showMessage } from './minimap.js';
import { getItemDef } from './items.js';

export const objects = [];

export function initObjects(scene, camera) {
    const gltfLoader = new GLTFLoader();

    // Chest in the starter room (moved to the South wall)
    addChest(scene, gltfLoader, 11, 13, 0, 0.7);

    // New Chest at the end of the long passage: Row 1, Col 7.
    addChest(scene, gltfLoader, 7, 1, 0, -0.7);

    // Portcullis: Row 7, Col 7.
    const portcullis = {
        name: 'Portcullis',
        path: '/items/Meshy_AI_Iron_Portcullis_0221184348_texture.glb',
        gridRow: 7,
        gridCol: 7,
        x: 7 * CELL,
        z: 7 * CELL,
        scale: 0.8,
        isOpen: false
    };
    gltfLoader.load(portcullis.path, (gltf) => {
        const model = gltf.scene;
        model.scale.set(1.15, 0.9, 1.15); // scaled to fit the corridor
        model.position.set(portcullis.x, 1.1, portcullis.z);
        scene.add(model);
        portcullis.mesh = model;
    });
    objects.push(portcullis);

    // Button for portcullis: Row 8, Col 8 (Wall). 
    // Player stands at Row 8, Col 7 to press it.
    const buttonContainer = new THREE.Group();
    // Backing plate
    const plateGeo = new THREE.BoxGeometry(0.05, 0.3, 0.2);
    const plateMat = new THREE.MeshLambertMaterial({ color: 0x443322 });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    buttonContainer.add(plate);

    // The actual button
    const btnGeo = new THREE.BoxGeometry(0.08, 0.12, 0.12);
    const btnMat = new THREE.MeshLambertMaterial({ color: 0xaa2222 });
    const btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.x = 0.04;
    btn.userData = { isButton: true, target: 'portcullis' };
    buttonContainer.add(btn);

    // Positioned on the East wall of Row 8, Col 7
    buttonContainer.position.set(8 * CELL - 1.0, 1.25, 8 * CELL);
    scene.add(buttonContainer);

    window.addEventListener('click', (e) => {
        // Raycast
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        for (let hit of intersects) {
            let obj = hit.object;
            if (obj.userData.isButton) {
                // Check if player is facing the wall at (8, 8) from (8, 7)
                if (isInFrontOfPlayer(8, 8, 1)) {
                    openPortcullis(portcullis);
                    // Small button press animation
                    new Tween(obj.position)
                        .to({ x: 0.01 }, 100)
                        .easing(Easing.Quadratic.Out)
                        .chain(new Tween(obj.position).to({ x: 0.04 }, 100).easing(Easing.Quadratic.In))
                        .start();
                } else {
                    showMessage("You can't reach that from here.");
                }
                break;
            } else if (obj.userData.isChest) {
                // Check if player is standing on the same square as the chest
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);

                if (isOnSameSquare) {
                    openChestModal();
                } else {
                    showMessage("Stand on the chest to open it.");
                }
                break;
            }
        }
    });

    // Modal Close Logic
    const closeBtn = document.getElementById('chest-close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById('chest-overlay').classList.add('chest-hidden');
        };
    }
}

function addChest(scene, loader, col, row, rotY, offsetZ = 0) {
    loader.load('/items/Meshy_AI_Treasure_Chest_0221184131_texture.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.3);
        model.position.set(col * CELL, 0.23, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isChest = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
            }
        });

        scene.add(model);
    });
}

function openPortcullis(p) {
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

function openChestModal() {
    const overlay = document.getElementById('chest-overlay');
    overlay.classList.remove('chest-hidden');

    const slots = document.querySelectorAll('.chest-slot');
    const boots = getItemDef('Leather Boots');

    slots.forEach((slot, i) => {
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null; // Clear previous handlers

        if (i === 0 && boots) {
            slot.classList.add('occupied');
            const img = document.createElement('img');
            img.src = boots.icon;
            img.title = boots.name;
            slot.appendChild(img);

            slot.onclick = () => {
                // Top-left character is index 0
                import('./equipment.js').then(m => {
                    const success = m.addItemToInventory(0, boots.name);
                    if (success) {
                        showMessage(`Aldric picks up ${boots.name}.`);
                        slot.innerHTML = '';
                        slot.classList.remove('occupied');
                        slot.onclick = null;
                        // Close modal after picking up the item
                        overlay.classList.add('chest-hidden');
                    } else {
                        showMessage("Inventory is full!");
                    }
                });
            };
        }
    });
}

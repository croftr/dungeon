import * as THREE from 'three';
import Proton from 'three.proton.js';

let proton;
let sceneRef;
let cameraRef;
let textureLoader = new THREE.TextureLoader();

// A simple circular gradient texture for sparks
let sparkTexture;

function createSparkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Create soft gradient
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 200, 50, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(canvas);
}

export function initParticles(scene, camera) {
    proton = new Proton();
    sceneRef = scene;
    cameraRef = camera;

    // Use SpriteRender which is best for simple glowing particles
    proton.addRender(new Proton.SpriteRender(scene));

    sparkTexture = createSparkTexture();
}

export function updateParticles(dt) {
    if (proton) {
        proton.update(); // three.proton handles internal dt or we could pass it if required by specific version.
        // Wait, three.proton's update might take dt or might not depending on version. We'll just call update().
    }
}

export function createHitSpark(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Emit 15-25 particles in one quick burst
    emitter.rate = new Proton.Rate(new Proton.Span(15, 25), new Proton.Span(0.01));

    // Initialization
    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.5, 1.5)); // three.js units
    emitter.addInitialize(new Proton.Life(0.2, 0.4)); // Very fast death

    // Animate outward from center, 360 degrees
    emitter.addInitialize(new Proton.V(5, new Proton.Vector3D(0, 1, 0), 180));

    // Set material
    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    // Position
    if (position) {
        // Spark near the center of the mesh
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.5, position.z)));
    } else if (cameraRef) {
        // Fallback: spawn 2 units in front of camera
        const dir = new THREE.Vector3();
        cameraRef.getWorldDirection(dir);
        const pos = new THREE.Vector3().copy(cameraRef.position).add(dir.multiplyScalar(2));
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(pos.x, pos.y, pos.z)));
    }

    // Behaviours during particle life
    emitter.addBehaviour(new Proton.Alpha(1, 0)); // Fade out
    emitter.addBehaviour(new Proton.Scale(1, 0.1)); // Shrink
    emitter.addBehaviour(new Proton.Color('#ffffff', '#ff6600')); // Turn orange
    emitter.addBehaviour(new Proton.RandomDrift(2, 2, 2, 0.05));

    // Emit for just a split second
    emitter.emit();
    proton.addEmitter(emitter);

    // Stop emitting after 100ms
    setTimeout(() => {
        emitter.stopEmit();
        // Give particles time to die, then remove the emitter from the engine
        setTimeout(() => {
            proton.removeEmitter(emitter);
        }, 500);
    }, 100);
}

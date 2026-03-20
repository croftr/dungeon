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

export function createCritSpark(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // 3× particle count vs normal hit spark (45–65 vs 15–25)
    emitter.rate = new Proton.Rate(new Proton.Span(45, 65), new Proton.Span(0.01));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.8, 2.5));  // larger than normal (0.5–1.5)
    emitter.addInitialize(new Proton.Life(0.3, 0.6));    // longer than normal (0.2–0.4)
    emitter.addInitialize(new Proton.V(8, new Proton.Vector3D(0, 1, 0), 180)); // faster than normal (5)

    // Gold SpriteMaterial — same setup as createHitSpark but distinct colour
    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.5, position.z)));
    }

    emitter.addBehaviour(new Proton.Alpha(1, 0));
    emitter.addBehaviour(new Proton.Scale(1.5, 0.1));
    emitter.addBehaviour(new Proton.Color('#ffffff', '#ffcc00')); // white → gold
    emitter.addBehaviour(new Proton.RandomDrift(2.5, 2.5, 2.5, 0.05));

    emitter.emit();
    proton.addEmitter(emitter);

    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 700);
    }, 100);
}

export function createIceBurst(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Emit fewer particles spread out over a longer timeframe
    emitter.rate = new Proton.Rate(new Proton.Span(8, 15), new Proton.Span(0.05));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.3, 0.8)); // Smaller, delicate dust/crystals
    emitter.addInitialize(new Proton.Life(1.0, 2.0)); // Last longer, drifting slowly

    // Slow outward and upward movement
    emitter.addInitialize(new Proton.V(0.8, new Proton.Vector3D(0, 1, 0), 180));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.8, position.z)));
    }

    // Not intensely bright, fading gently
    emitter.addBehaviour(new Proton.Alpha(0.6, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.0, 0.2));
    emitter.addBehaviour(new Proton.Color('#e0f7ff', '#44aaff'));

    // Subtle swirling effect
    emitter.addBehaviour(new Proton.RandomDrift(1.5, 1.5, 1.5, 0.05));

    emitter.emit();
    proton.addEmitter(emitter);

    // Keep emitting the chilled air for half a second
    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 2500);
    }, 500);
}

export function createNatureBurst(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Subtle, wispy spores
    emitter.rate = new Proton.Rate(new Proton.Span(10, 20), new Proton.Span(0.05));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.2, 0.6));
    emitter.addInitialize(new Proton.Life(1.5, 2.5));

    // Slow outward drift
    emitter.addInitialize(new Proton.V(0.5, new Proton.Vector3D(0, 1, 0), 180));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        // Emit from roughly chest height
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.8, position.z)));
    }

    // Green to yellow-green fade
    emitter.addBehaviour(new Proton.Alpha(0.5, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.0, 0.5));
    // Color fade from a strong green to a very light green/yellow
    emitter.addBehaviour(new Proton.Color('#55ff55', '#bbffbb'));
    emitter.addBehaviour(new Proton.RandomDrift(1.0, 1.0, 1.0, 0.05));

    emitter.emit();
    proton.addEmitter(emitter);

    // Fade out generation over half a second
    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 3000);
    }, 500);
}

export function createOgreSlam(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Short, punchy burst — ground-slam dust/debris
    emitter.rate = new Proton.Rate(new Proton.Span(12, 18), new Proton.Span(0.03));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.3, 0.7));
    emitter.addInitialize(new Proton.Life(0.6, 1.2));

    // Fast outward + slightly upward — like a shockwave
    emitter.addInitialize(new Proton.V(3, new Proton.Vector3D(0, 0.5, 0), 160));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.3, position.z)));
    }

    emitter.addBehaviour(new Proton.Alpha(0.7, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.2, 0.2));
    // Orange-brown dust cloud
    emitter.addBehaviour(new Proton.Color('#ff8844', '#aa5522'));
    emitter.addBehaviour(new Proton.RandomDrift(1.5, 0.5, 1.5, 0.05));

    emitter.emit();
    proton.addEmitter(emitter);

    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 1500);
    }, 200);
}

export function createTreemanAwakening(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Gentle magical green swirl
    emitter.rate = new Proton.Rate(new Proton.Span(8, 14), new Proton.Span(0.04));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.3, 0.7));
    emitter.addInitialize(new Proton.Life(1.2, 2.0));

    // Upward spiralling drift
    emitter.addInitialize(new Proton.V(1.0, new Proton.Vector3D(0, 1, 0), 150));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.5, position.z)));
    }

    emitter.addBehaviour(new Proton.Alpha(0.6, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.0, 0.3));
    // Deep green → bright emerald
    emitter.addBehaviour(new Proton.Color('#22cc44', '#88ffaa'));
    emitter.addBehaviour(new Proton.RandomDrift(1.2, 0.8, 1.2, 0.04));

    emitter.emit();
    proton.addEmitter(emitter);

    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 2500);
    }, 2000);
}

export function createMinotaurRage(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Subtle, menacing red aura — not over-the-top
    emitter.rate = new Proton.Rate(new Proton.Span(6, 10), new Proton.Span(0.05));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.2, 0.5));
    emitter.addInitialize(new Proton.Life(0.8, 1.5));

    // Slow upward drift — ominous rising energy
    emitter.addInitialize(new Proton.V(1.2, new Proton.Vector3D(0, 1, 0), 140));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.5, position.z)));
    }

    emitter.addBehaviour(new Proton.Alpha(0.5, 0.0));
    emitter.addBehaviour(new Proton.Scale(0.8, 0.1));
    // Dark red → crimson
    emitter.addBehaviour(new Proton.Color('#ff2222', '#aa0000'));
    emitter.addBehaviour(new Proton.RandomDrift(0.8, 0.3, 0.8, 0.05));

    emitter.emit();
    proton.addEmitter(emitter);

    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 2000);
    }, 1500);
}

export function createDemonCleave(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Sudden, explosive red burst
    emitter.rate = new Proton.Rate(new Proton.Span(15, 25), new Proton.Span(0.02));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.5, 1.2));
    emitter.addInitialize(new Proton.Life(0.5, 1.0));

    // Fast outward motion
    emitter.addInitialize(new Proton.V(2.5, new Proton.Vector3D(0, 0.5, 0), 180));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.6, position.z)));
    }

    emitter.addBehaviour(new Proton.Alpha(0.8, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.5, 0.2));
    // Bright red to dark red fade
    emitter.addBehaviour(new Proton.Color('#ff0000', '#660000'));
    emitter.addBehaviour(new Proton.RandomDrift(1.5, 1.0, 1.5, 0.05));

    emitter.emit();
    proton.addEmitter(emitter);

    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 1500);
    }, 300);
}

export function createTidalWave(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Sustained cascading blue burst — wider and longer than demonCleave
    emitter.rate = new Proton.Rate(new Proton.Span(20, 35), new Proton.Span(0.02));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.4, 1.0));
    emitter.addInitialize(new Proton.Life(0.6, 1.2));

    // Outward spray with upward bias — wave-like
    emitter.addInitialize(new Proton.V(2.0, new Proton.Vector3D(0, 1.0, 0), 180));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.8, position.z)));
    }

    emitter.addBehaviour(new Proton.Alpha(0.9, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.8, 0.1));
    // Bright cyan-white to deep blue fade
    emitter.addBehaviour(new Proton.Color('#aaeeff', '#0044cc'));
    emitter.addBehaviour(new Proton.RandomDrift(1.2, 0.8, 1.2, 0.04));

    emitter.emit();
    proton.addEmitter(emitter);

    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 2000);
    }, 500);
}

export function createPoisonCloud(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Slow billowing toxic cloud — large, lingering, murky green
    emitter.rate = new Proton.Rate(new Proton.Span(20, 30), new Proton.Span(0.04));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.6, 1.4));
    emitter.addInitialize(new Proton.Life(1.5, 3.0));

    // Slow outward drift upward — cloud rising
    emitter.addInitialize(new Proton.V(0.6, new Proton.Vector3D(0, 1, 0), 180));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.5, position.z)));
    }

    // Dark toxic green — starts murky, fades out
    emitter.addBehaviour(new Proton.Alpha(0.7, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.5, 0.3));
    emitter.addBehaviour(new Proton.Color('#22cc44', '#005500'));
    emitter.addBehaviour(new Proton.RandomDrift(1.5, 1.0, 1.5, 0.05));

    emitter.emit();
    proton.addEmitter(emitter);

    // Keep emitting for longer to sell the "cloud" feel
    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 3500);
    }, 800);
}

export function createCrocodileSparkle(position) {
    if (!proton) return;

    // Two-wave sparkle: a fast outward burst of bright gold stars, then
    // a slower lingering shimmer of white glints rising upward.

    // Wave 1 — explosive outward gold burst
    const emitter1 = new Proton.Emitter();
    emitter1.rate = new Proton.Rate(new Proton.Span(25, 35), new Proton.Span(0.01));
    emitter1.addInitialize(new Proton.Mass(1));
    emitter1.addInitialize(new Proton.Radius(0.3, 1.0));
    emitter1.addInitialize(new Proton.Life(0.4, 0.8));
    emitter1.addInitialize(new Proton.V(4.0, new Proton.Vector3D(0, 1, 0), 180));
    const mat1 = new THREE.SpriteMaterial({
        map: sparkTexture, color: 0xffffff,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    emitter1.addInitialize(new Proton.Body(new THREE.Sprite(mat1)));
    if (position) {
        emitter1.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.8, position.z)));
    }
    emitter1.addBehaviour(new Proton.Alpha(1.0, 0.0));
    emitter1.addBehaviour(new Proton.Scale(1.4, 0.1));
    emitter1.addBehaviour(new Proton.Color('#ffffff', '#ffdd00')); // white → gold
    emitter1.addBehaviour(new Proton.RandomDrift(1.0, 0.8, 1.0, 0.04));
    emitter1.emit();
    proton.addEmitter(emitter1);
    setTimeout(() => {
        emitter1.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter1); }, 1000);
    }, 80);

    // Wave 2 — slow rising white glints
    const emitter2 = new Proton.Emitter();
    emitter2.rate = new Proton.Rate(new Proton.Span(10, 16), new Proton.Span(0.04));
    emitter2.addInitialize(new Proton.Mass(1));
    emitter2.addInitialize(new Proton.Radius(0.2, 0.5));
    emitter2.addInitialize(new Proton.Life(0.8, 1.5));
    emitter2.addInitialize(new Proton.V(0.8, new Proton.Vector3D(0, 1, 0), 160));
    const mat2 = new THREE.SpriteMaterial({
        map: sparkTexture, color: 0xffffff,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    emitter2.addInitialize(new Proton.Body(new THREE.Sprite(mat2)));
    if (position) {
        emitter2.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 0.6, position.z)));
    }
    emitter2.addBehaviour(new Proton.Alpha(0.8, 0.0));
    emitter2.addBehaviour(new Proton.Scale(0.8, 0.05));
    emitter2.addBehaviour(new Proton.Color('#ffffcc', '#ffaa00')); // pale yellow → amber
    emitter2.addBehaviour(new Proton.RandomDrift(1.5, 1.2, 1.5, 0.05));
    emitter2.emit();
    proton.addEmitter(emitter2);
    setTimeout(() => {
        emitter2.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter2); }, 2000);
    }, 500);
}

export function createLizardVenomSpit(position) {
    if (!proton) return;

    const emitter = new Proton.Emitter();

    // Toxic venom spray — acid green burst with downward drip bias
    emitter.rate = new Proton.Rate(new Proton.Span(18, 28), new Proton.Span(0.02));

    emitter.addInitialize(new Proton.Mass(1));
    emitter.addInitialize(new Proton.Radius(0.3, 0.9));
    emitter.addInitialize(new Proton.Life(0.7, 1.4));

    // Wide outward spray with slight downward arc
    emitter.addInitialize(new Proton.V(2.0, new Proton.Vector3D(0, -0.3, 0), 180));

    const material = new THREE.SpriteMaterial({
        map: sparkTexture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
    emitter.addInitialize(new Proton.Body(new THREE.Sprite(material)));

    if (position) {
        emitter.addInitialize(new Proton.Position(new Proton.PointZone(position.x, position.y + 1.0, position.z)));
    }

    emitter.addBehaviour(new Proton.Alpha(0.85, 0.0));
    emitter.addBehaviour(new Proton.Scale(1.3, 0.15));
    // Bright acid green to dark bile green
    emitter.addBehaviour(new Proton.Color('#aaff22', '#335500'));
    emitter.addBehaviour(new Proton.RandomDrift(0.8, 0.5, 0.8, 0.04));

    emitter.emit();
    proton.addEmitter(emitter);

    setTimeout(() => {
        emitter.stopEmit();
        setTimeout(() => { proton.removeEmitter(emitter); }, 2000);
    }, 400);
}

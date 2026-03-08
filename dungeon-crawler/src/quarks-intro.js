import * as THREE from 'three';
import {
    BatchedParticleRenderer,
    ParticleSystem,
    ConeEmitter,
    SphereEmitter,
    CircleEmitter,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    ColorRange,
    ColorOverLife,
    SizeOverLife,
    PiecewiseBezier,
    Bezier,
    RenderMode,
    Vector4,
} from 'three.quarks';

let batchRenderer = null;
let sceneRef = null;
let cameraRef = null;

// ─── Shared glow texture ───────────────────────────────────────────────────
function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
// Returns a position slightly in front of the camera — good for targeted skills
function _frontPos(distance = 1.5) {
    const dir = new THREE.Vector3();
    cameraRef.getWorldDirection(dir);
    return new THREE.Vector3().copy(cameraRef.position).addScaledVector(dir, distance);
}

// Spin up a system, add it to the scene, then auto-clean after maxLife seconds
function _spawn(system, pos, maxLife = 2.5) {
    batchRenderer.addSystem(system);
    sceneRef.add(system.emitter);
    system.emitter.position.copy(pos);
    setTimeout(() => {
        batchRenderer.deleteSystem(system);
        sceneRef.remove(system.emitter);
    }, maxLife * 1000);
}

function _mat(texture) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
}

// ─── Shared bezier curves ──────────────────────────────────────────────────
const FADE_OUT = new PiecewiseBezier([[new Bezier(1, 0.7, 0.3, 0), 0]]);
const GROW_FADE = new PiecewiseBezier([[new Bezier(0.2, 0.8, 0.6, 0), 0]]);

// ══════════════════════════════════════════════════════════════════════════
//  SANCTUARY — Alaric (Paladin)
//  Divine light bursting outward + rising holy motes  (silver-violet)
// ══════════════════════════════════════════════════════════════════════════
export function triggerSanctuaryEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // Expanding sphere shield
    const burst = new ParticleSystem({
        duration: 1.2, looping: false,
        startLife: new IntervalValue(0.5, 1.2),
        startSpeed: new IntervalValue(2.0, 6.0),
        startSize: new IntervalValue(0.06, 0.22),
        startColor: new ConstantColor(new Vector4(0.9, 0.85, 1.0, 1)),
        worldSpace: true, maxParticle: 160,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(120), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.3, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    burst.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1.0, 0.95, 1.0, 1), new Vector4(0.7, 0.6, 1.0, 0))));
    burst.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(burst, pos, 2.0);

    // Rising holy motes
    const motes = new ParticleSystem({
        duration: 2.0, looping: false,
        startLife: new IntervalValue(0.8, 2.0),
        startSpeed: new IntervalValue(0.3, 1.5),
        startSize: new IntervalValue(0.03, 0.12),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 0.9)),
        worldSpace: true, maxParticle: 80,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(60), cycle: 1, interval: 0.05, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.6, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 5 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    motes.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.85, 0.8, 1.0, 1), new Vector4(0.6, 0.5, 1.0, 0))));
    motes.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(motes, pos, 3.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  HOLY RADIANCE — Alaric (Paladin)
//  Warm golden light raining down from above  (healing / warm white-gold)
// ══════════════════════════════════════════════════════════════════════════
export function triggerHolyRadianceEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const above = new THREE.Vector3().copy(cameraRef.position).add(new THREE.Vector3(0, 1.5, 0));

    // Downward golden rain
    const rain = new ParticleSystem({
        duration: 1.5, looping: false,
        startLife: new IntervalValue(0.4, 1.0),
        startSpeed: new IntervalValue(1.5, 4.0),
        startSize: new IntervalValue(0.05, 0.18),
        startColor: new ConstantColor(new Vector4(1, 0.95, 0.5, 1)),
        worldSpace: true, maxParticle: 120,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(90), cycle: 1, interval: 0.01, probability: 1 }],
        // Wide downward cone — spawn above, fire downward
        shape: new ConeEmitter({ radius: 0.8, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 2.2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    rain.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 1, 0.7, 1), new Vector4(1, 0.8, 0.2, 0))));
    rain.addBehavior(new SizeOverLife(FADE_OUT));
    // Flip cone downward
    rain.emitter.rotation.set(Math.PI, 0, 0);
    _spawn(rain, above, 2.0);

    // Floor bloom — burst at feet as light lands
    const bloom = new ParticleSystem({
        duration: 0.8, looping: false,
        startLife: new IntervalValue(0.3, 0.7),
        startSpeed: new IntervalValue(0.5, 2.5),
        startSize: new IntervalValue(0.08, 0.25),
        startColor: new ConstantColor(new Vector4(1, 0.9, 0.4, 1)),
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(45), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new CircleEmitter({ radius: 0.5, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    bloom.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 1, 0.8, 1), new Vector4(0.9, 0.6, 0.1, 0))));
    bloom.addBehavior(new SizeOverLife(GROW_FADE));
    const floor = new THREE.Vector3().copy(cameraRef.position).add(new THREE.Vector3(0, -0.5, 0));
    _spawn(bloom, floor, 1.5);
}

// ══════════════════════════════════════════════════════════════════════════
//  HUNTER'S EYE — Elrond (Ranger)
//  Sharp teal/cyan ring snap  (precision, targeting, cold focus)
// ══════════════════════════════════════════════════════════════════════════
export function triggerHuntersEyeEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();

    // Fast outward disc ring in front of camera
    const ring = new ParticleSystem({
        duration: 0.6, looping: false,
        startLife: new IntervalValue(0.2, 0.5),
        startSpeed: new IntervalValue(3.0, 8.0),
        startSize: new IntervalValue(0.03, 0.10),
        startColor: new ConstantColor(new Vector4(0.4, 1.0, 0.9, 1)),
        worldSpace: true, maxParticle: 100,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(80), cycle: 1, interval: 0.005, probability: 1 }],
        shape: new CircleEmitter({ radius: 0.15, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    ring.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.6, 1.0, 1.0, 1), new Vector4(0.1, 0.8, 0.8, 0))));
    ring.addBehavior(new SizeOverLife(FADE_OUT));
    // Orient disc to face camera forward
    const dir = new THREE.Vector3();
    cameraRef.getWorldDirection(dir);
    ring.emitter.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    _spawn(ring, _frontPos(1.2), 1.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  ENTANGLE — Elrond (Ranger)
//  Green nature burst — roots and vines  (earthy greens, slow)
// ══════════════════════════════════════════════════════════════════════════
export function triggerEntangleEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();

    const roots = new ParticleSystem({
        duration: 1.8, looping: false,
        startLife: new IntervalValue(0.8, 2.0),
        startSpeed: new IntervalValue(0.5, 3.0),
        startSize: new IntervalValue(0.05, 0.20),
        startColor: new ConstantColor(new Vector4(0.2, 0.9, 0.3, 1)),
        worldSpace: true, maxParticle: 120,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(90), cycle: 1, interval: 0.02, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.2, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    roots.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(0.5, 1.0, 0.3, 1),
        new Vector4(0.1, 0.4, 0.05, 0),
    )));
    roots.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.6, 1.0, 0.8, 0), 0]])));
    _spawn(roots, _frontPos(1.5), 3.0);

    // Floor-level wisp
    const floor = new THREE.Vector3().copy(_frontPos(1.5)).add(new THREE.Vector3(0, -0.5, 0));
    const wisps = new ParticleSystem({
        duration: 1.0, looping: false,
        startLife: new IntervalValue(0.4, 1.2),
        startSpeed: new IntervalValue(0.2, 1.0),
        startSize: new IntervalValue(0.04, 0.14),
        startColor: new ConstantColor(new Vector4(0.1, 0.8, 0.1, 1)),
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(40), cycle: 1, interval: 0.02, probability: 1 }],
        shape: new CircleEmitter({ radius: 0.4, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    wisps.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.3, 1.0, 0.2, 1), new Vector4(0.0, 0.3, 0.0, 0))));
    wisps.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(wisps, floor, 2.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  SUNDER ARMOR — Thorek (Warrior)
//  Orange/red impact shards, aggressive forward burst  (metal fragments)
// ══════════════════════════════════════════════════════════════════════════
export function triggerSunderArmorEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();

    const shards = new ParticleSystem({
        duration: 0.8, looping: false,
        startLife: new IntervalValue(0.3, 0.8),
        startSpeed: new IntervalValue(4.0, 10.0),
        startSize: new IntervalValue(0.04, 0.16),
        startColor: new ConstantColor(new Vector4(1, 0.6, 0.1, 1)),
        worldSpace: true, maxParticle: 140,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(100), cycle: 1, interval: 0.005, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.1, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 4 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    shards.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 1.0, 0.5, 1),
        new Vector4(0.8, 0.1, 0.0, 0),
    )));
    shards.addBehavior(new SizeOverLife(FADE_OUT));
    // Orient cone toward forward
    const dir = new THREE.Vector3();
    cameraRef.getWorldDirection(dir);
    shards.emitter.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    _spawn(shards, _frontPos(0.8), 1.5);

    // Secondary ember scatter
    const embers = new ParticleSystem({
        duration: 0.6, looping: false,
        startLife: new IntervalValue(0.2, 0.5),
        startSpeed: new IntervalValue(2.0, 5.0),
        startSize: new IntervalValue(0.02, 0.08),
        startColor: new ConstantColor(new Vector4(1, 0.4, 0.0, 1)),
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(40), cycle: 1, interval: 0.005, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.15, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    embers.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 0.5, 0.1, 1), new Vector4(0.5, 0.0, 0.0, 0))));
    embers.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(embers, _frontPos(0.8), 1.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  BERSERK — Korg (Barbarian)
//  Explosive red/fire all-directional burst  (rage, fire, war cry)
// ══════════════════════════════════════════════════════════════════════════
export function triggerBerserkEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // Big explosive sphere — rage erupting from the barbarian
    const explosion = new ParticleSystem({
        duration: 1.0, looping: false,
        startLife: new IntervalValue(0.4, 1.2),
        startSpeed: new IntervalValue(3.0, 9.0),
        startSize: new IntervalValue(0.06, 0.28),
        startColor: new ConstantColor(new Vector4(1, 0.3, 0.0, 1)),
        worldSpace: true, maxParticle: 200,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(160), cycle: 1, interval: 0.005, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.2, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    explosion.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 0.9, 0.3, 1),
        new Vector4(0.9, 0.05, 0.0, 0),
    )));
    explosion.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 1, 0.5, 0), 0]])));
    _spawn(explosion, pos, 2.0);

    // Lingering embers drifting upward
    const embers = new ParticleSystem({
        duration: 1.5, looping: false,
        startLife: new IntervalValue(0.6, 1.8),
        startSpeed: new IntervalValue(0.3, 1.5),
        startSize: new IntervalValue(0.03, 0.10),
        startColor: new ConstantColor(new Vector4(1, 0.4, 0.0, 1)),
        worldSpace: true, maxParticle: 80,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(60), cycle: 1, interval: 0.02, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.4, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 6 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    embers.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 0.6, 0.1, 1), new Vector4(0.6, 0.0, 0.0, 0))));
    embers.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(embers, pos, 3.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  WARCRY — Korg (Barbarian)
//  Powerful amber/golden outward shockwave  (party-wide inspiration)
// ══════════════════════════════════════════════════════════════════════════
export function triggerWarcryEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // Outer expanding ring / shockwave
    const ring = new ParticleSystem({
        duration: 0.8, looping: false,
        startLife: new IntervalValue(0.5, 1.0),
        startSpeed: new IntervalValue(4.0, 10.0),
        startSize: new IntervalValue(0.1, 0.3),
        startColor: new ConstantColor(new Vector4(1, 0.8, 0.2, 1)),
        worldSpace: true, maxParticle: 150,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(100), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new CircleEmitter({ radius: 0.3, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    ring.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 0.9, 0.5, 1), new Vector4(1, 0.4, 0.0, 0))));
    ring.addBehavior(new SizeOverLife(GROW_FADE));

    // Orient ring to floor (XZ plane)
    ring.emitter.rotation.set(-Math.PI / 2, 0, 0);
    _spawn(ring, new THREE.Vector3().copy(pos).add(new THREE.Vector3(0, -0.5, 0)), 1.5);

    // Central burst
    const burst = new ParticleSystem({
        duration: 1.0, looping: false,
        startLife: new IntervalValue(0.4, 0.8),
        startSpeed: new IntervalValue(2.0, 6.0),
        startSize: new IntervalValue(0.05, 0.2),
        startColor: new ConstantColor(new Vector4(1, 0.6, 0.1, 1)),
        worldSpace: true, maxParticle: 100,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(80), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.2, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    burst.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 1, 0.8, 1), new Vector4(0.8, 0.2, 0.0, 0))));
    burst.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(burst, pos, 2.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  ARCANE LANTERN — Merlin (Wizard)
//  Soft blue/cyan sparkles blooming outward  (magical light conjuring)
// ══════════════════════════════════════════════════════════════════════════
export function triggerArcaneLanternEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    const bloom = new ParticleSystem({
        duration: 2.0, looping: false,
        startLife: new IntervalValue(0.8, 2.0),
        startSpeed: new IntervalValue(0.5, 2.5),
        startSize: new IntervalValue(0.04, 0.18),
        startColor: new ConstantColor(new Vector4(0.5, 0.9, 1.0, 1)),
        worldSpace: true, maxParticle: 120,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(90), cycle: 1, interval: 0.02, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.15, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    bloom.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(0.8, 1.0, 1.0, 1),
        new Vector4(0.1, 0.5, 1.0, 0),
    )));
    bloom.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(bloom, pos, 3.0);

    // Tight upward wisp — the lantern forming above
    const lantern = new ParticleSystem({
        duration: 1.5, looping: false,
        startLife: new IntervalValue(0.5, 1.5),
        startSpeed: new IntervalValue(0.2, 1.0),
        startSize: new IntervalValue(0.06, 0.22),
        startColor: new ConstantColor(new Vector4(0.3, 0.8, 1.0, 1)),
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(45), cycle: 1, interval: 0.03, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.05, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 8 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    lantern.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.6, 0.95, 1.0, 1), new Vector4(0.0, 0.4, 0.9, 0))));
    lantern.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(lantern, pos, 2.5);
}

// ══════════════════════════════════════════════════════════════════════════
//  RUNIC SCHOLAR — Merlin (Wizard)
//  Tight purple/violet arcane charge  (power being concentrated, focused)
// ══════════════════════════════════════════════════════════════════════════
export function triggerRunicScholarEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // Tight inward-then-outward arcane pulse
    const charge = new ParticleSystem({
        duration: 1.0, looping: false,
        startLife: new IntervalValue(0.4, 1.0),
        startSpeed: new IntervalValue(1.5, 5.0),
        startSize: new IntervalValue(0.04, 0.16),
        startColor: new ConstantColor(new Vector4(0.8, 0.3, 1.0, 1)),
        worldSpace: true, maxParticle: 100,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(80), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.1, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    charge.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 0.7, 1.0, 1),
        new Vector4(0.4, 0.0, 0.8, 0),
    )));
    charge.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(charge, pos, 2.0);

    // Slow-rising runic wisps
    const wisps = new ParticleSystem({
        duration: 1.5, looping: false,
        startLife: new IntervalValue(0.6, 1.8),
        startSpeed: new IntervalValue(0.2, 0.8),
        startSize: new IntervalValue(0.05, 0.15),
        startColor: new ConstantColor(new Vector4(0.6, 0.1, 1.0, 1)),
        worldSpace: true, maxParticle: 50,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(35), cycle: 1, interval: 0.03, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.25, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 7 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    wisps.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.9, 0.5, 1.0, 1), new Vector4(0.2, 0.0, 0.6, 0))));
    wisps.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(wisps, pos, 3.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  MANA TAP — Merlin (Wizard)
//  Bright blue/cyan energy surging upward  (drawing power from within)
// ══════════════════════════════════════════════════════════════════════════
export function triggerManaTapEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // Upward geyser of mana energy
    const surge = new ParticleSystem({
        duration: 1.5, looping: false,
        startLife: new IntervalValue(0.5, 1.5),
        startSpeed: new IntervalValue(1.0, 5.0),
        startSize: new IntervalValue(0.05, 0.20),
        startColor: new ConstantColor(new Vector4(0.2, 0.7, 1.0, 1)),
        worldSpace: true, maxParticle: 140,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(100), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.15, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 7 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    surge.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(0.5, 1.0, 1.0, 1),
        new Vector4(0.0, 0.3, 1.0, 0),
    )));
    surge.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(surge, pos, 2.5);

    // Wide ambient shimmer around body
    const shimmer = new ParticleSystem({
        duration: 1.0, looping: false,
        startLife: new IntervalValue(0.3, 0.9),
        startSpeed: new IntervalValue(0.5, 2.0),
        startSize: new IntervalValue(0.03, 0.12),
        startColor: new ConstantColor(new Vector4(0.0, 0.8, 1.0, 1)),
        worldSpace: true, maxParticle: 80,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(55), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.4, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    shimmer.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.3, 0.9, 1.0, 1), new Vector4(0.0, 0.2, 0.8, 0))));
    shimmer.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(shimmer, pos, 2.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  FIREBALL — Merlin (Wizard)
//  Dense white-hot → orange → dark-red fire cone firing forward
// ══════════════════════════════════════════════════════════════════════════
export function triggerFireballEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const dir = new THREE.Vector3();
    cameraRef.getWorldDirection(dir);

    // Core fire stream — tight narrow cone aimed forward
    const core = new ParticleSystem({
        duration: 0.7, looping: false,
        startLife: new IntervalValue(0.3, 0.8),
        startSpeed: new IntervalValue(5.0, 14.0),
        startSize: new IntervalValue(0.08, 0.30),
        startColor: new ConstantColor(new Vector4(1, 1, 0.5, 1)),
        worldSpace: true, maxParticle: 160,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(120), cycle: 1, interval: 0.005, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.08, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 10 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    core.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 0.9, 0.3, 1),
        new Vector4(0.9, 0.05, 0.0, 0),
    )));
    core.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 1, 0.6, 0), 0]])));
    core.emitter.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    _spawn(core, cameraRef.position, 1.5);

    // Wide fire bloom at impact zone — spawned further forward
    const bloom = new ParticleSystem({
        duration: 0.6, looping: false,
        startLife: new IntervalValue(0.2, 0.6),
        startSpeed: new IntervalValue(2.0, 7.0),
        startSize: new IntervalValue(0.06, 0.22),
        startColor: new ConstantColor(new Vector4(1, 0.5, 0.1, 1)),
        worldSpace: true, maxParticle: 100,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(70), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.2, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    bloom.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 0.7, 0.2, 1), new Vector4(0.7, 0.0, 0.0, 0))));
    bloom.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.4, 1.0, 0.8, 0), 0]])));
    _spawn(bloom, _frontPos(2.5), 1.5);
}

// ══════════════════════════════════════════════════════════════════════════
//  REGENERATION — Merlin (Wizard)
//  Soft green pulse rippling outward, gentle and sustained  (healing)
// ══════════════════════════════════════════════════════════════════════════
export function triggerRegenerationEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // Expanding ring at body level
    const ring = new ParticleSystem({
        duration: 1.5, looping: false,
        startLife: new IntervalValue(0.6, 1.5),
        startSpeed: new IntervalValue(0.8, 3.0),
        startSize: new IntervalValue(0.05, 0.18),
        startColor: new ConstantColor(new Vector4(0.4, 1.0, 0.5, 1)),
        worldSpace: true, maxParticle: 120,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(90), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new CircleEmitter({ radius: 0.3, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    ring.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(0.6, 1.0, 0.6, 1),
        new Vector4(0.1, 0.6, 0.2, 0),
    )));
    ring.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(ring, pos, 2.5);

    // Gentle rising leaf-like motes
    const motes = new ParticleSystem({
        duration: 2.0, looping: false,
        startLife: new IntervalValue(1.0, 2.5),
        startSpeed: new IntervalValue(0.2, 0.8),
        startSize: new IntervalValue(0.03, 0.10),
        startColor: new ConstantColor(new Vector4(0.3, 0.9, 0.4, 1)),
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(45), cycle: 1, interval: 0.04, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.5, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 8 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    motes.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.5, 1.0, 0.5, 1), new Vector4(0.0, 0.4, 0.1, 0))));
    motes.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(motes, pos, 4.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  CURE POISON — Merlin (Wizard)
//  Sickly green/purple toxin burst then cleansing violet overwrite
// ══════════════════════════════════════════════════════════════════════════
export function triggerCurePoisonEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // Toxic green burst — the poison being drawn out
    const toxin = new ParticleSystem({
        duration: 0.8, looping: false,
        startLife: new IntervalValue(0.3, 0.8),
        startSpeed: new IntervalValue(1.5, 5.0),
        startSize: new IntervalValue(0.04, 0.16),
        startColor: new ConstantColor(new Vector4(0.3, 0.9, 0.2, 1)),
        worldSpace: true, maxParticle: 80,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(55), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.2, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    toxin.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(0.2, 1.0, 0.1, 1),
        new Vector4(0.5, 0.3, 0.0, 0),
    )));
    toxin.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(toxin, pos, 1.5);

    // Cleansing violet overwrite — the purifying magic replacing the venom
    const cleanse = new ParticleSystem({
        duration: 1.2, looping: false,
        startLife: new IntervalValue(0.5, 1.2),
        startSpeed: new IntervalValue(0.5, 2.5),
        startSize: new IntervalValue(0.05, 0.20),
        startColor: new ConstantColor(new Vector4(0.7, 0.3, 1.0, 1)),
        worldSpace: true, maxParticle: 90,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(65), cycle: 1, interval: 0.02, probability: 1 }],
        shape: new ConeEmitter({ radius: 0.3, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 5 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    cleanse.addBehavior(new ColorOverLife(new ColorRange(new Vector4(0.9, 0.6, 1.0, 1), new Vector4(0.3, 0.0, 0.7, 0))));
    cleanse.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(cleanse, pos, 2.5);
}

// ══════════════════════════════════════════════════════════════════════════
//  DEFAULT SPELL — generic arcane flash for any unregistered spell
//  Clean white/pale-blue burst — neutral, readable, not overshadowing
// ══════════════════════════════════════════════════════════════════════════
export function triggerDefaultSpellEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();

    const flash = new ParticleSystem({
        duration: 0.6, looping: false,
        startLife: new IntervalValue(0.2, 0.6),
        startSpeed: new IntervalValue(1.5, 5.0),
        startSize: new IntervalValue(0.03, 0.14),
        startColor: new ConstantColor(new Vector4(0.8, 0.9, 1.0, 1)),
        worldSpace: true, maxParticle: 80,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(60), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.1, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    flash.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 1, 1, 1), new Vector4(0.4, 0.6, 1.0, 0))));
    flash.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(flash, cameraRef.position, 1.5);
}

// ══════════════════════════════════════════════════════════════════════════
//  DEFAULT SKILL — generic activation flash for any unregistered skill
//  Warm white/amber — "power used", subtle and quick
// ══════════════════════════════════════════════════════════════════════════
export function triggerDefaultSkillEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();

    const flash = new ParticleSystem({
        duration: 0.5, looping: false,
        startLife: new IntervalValue(0.2, 0.5),
        startSpeed: new IntervalValue(1.0, 4.0),
        startSize: new IntervalValue(0.03, 0.12),
        startColor: new ConstantColor(new Vector4(1.0, 0.9, 0.6, 1)),
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(45), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.1, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    flash.addBehavior(new ColorOverLife(new ColorRange(new Vector4(1, 1, 0.8, 1), new Vector4(1.0, 0.5, 0.1, 0))));
    flash.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(flash, cameraRef.position, 1.5);
}

// ─────────────────────────────────────────────
//  PUBLIC INIT / UPDATE
// ─────────────────────────────────────────────
export function initQuarks(scene, camera) {
    sceneRef = scene;
    cameraRef = camera;
    batchRenderer = new BatchedParticleRenderer();
    scene.add(batchRenderer);
}

export function updateQuarks(dt) {
    if (batchRenderer) batchRenderer.update(dt);
}

// ══════════════════════════════════════════════════════════════════════════
//  WHIRLWIND — Lumni (War Dancer)
//  A swirling vortex of white/blue air particles
// ══════════════════════════════════════════════════════════════════════════
export function triggerWhirlwindEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = _frontPos(1.2);

    const vortex = new ParticleSystem({
        duration: 0.8, looping: false,
        startLife: new IntervalValue(0.4, 0.8),
        startSpeed: new IntervalValue(2.0, 4.0),
        startSize: new IntervalValue(0.05, 0.15),
        startColor: new ConstantColor(new Vector4(0.8, 0.9, 1.0, 1)),
        worldSpace: true, maxParticle: 100,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(80), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new CircleEmitter({ radius: 0.2, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    vortex.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 1.0, 1.0, 1),
        new Vector4(0.5, 0.7, 1.0, 0),
    )));
    vortex.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(vortex, pos, 1.5);
}

// ══════════════════════════════════════════════════════════════════════════
//  WAR DANCE — Lumni (War Dancer)
//  Elegant swirling rose/gold petals and air  (party-wide inspiration)
// ══════════════════════════════════════════════════════════════════════════
export function triggerWarDanceEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = cameraRef.position;

    // A more vibrant/multi-color vortex
    const vortex = new ParticleSystem({
        duration: 1.0, looping: false,
        startLife: new IntervalValue(0.5, 1.0),
        startSpeed: new IntervalValue(3.0, 6.0),
        startSize: new IntervalValue(0.04, 0.18),
        startColor: new ConstantColor(new Vector4(1, 0.5, 0.8, 1)), // Rose/Pink
        worldSpace: true, maxParticle: 120,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(100), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.3, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    vortex.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 0.8, 1.0, 1), // White/Pink
        new Vector4(0.8, 0.2, 0.5, 0), // Darker Pink
    )));
    vortex.addBehavior(new SizeOverLife(GROW_FADE));
    _spawn(vortex, pos, 2.0);

    // Add some golden sparkles
    const sparkles = new ParticleSystem({
        duration: 1.2, looping: false,
        startLife: new IntervalValue(0.6, 1.2),
        startSpeed: new IntervalValue(1.0, 3.0),
        startSize: new IntervalValue(0.02, 0.08),
        startColor: new ConstantColor(new Vector4(1, 0.9, 0.5, 1)), // Gold
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(40), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.5, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    sparkles.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(sparkles, pos, 2.0);
}

// ══════════════════════════════════════════════════════════════════════════
//  TRUE SHOT — Baldur (Ranger)
//  A sharp golden flash/pulse symbolizing focus
// ══════════════════════════════════════════════════════════════════════════
export function triggerTrueShotEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = _frontPos(1.0);

    const pulse = new ParticleSystem({
        duration: 0.5, looping: false,
        startLife: new IntervalValue(0.3, 0.6),
        startSpeed: new IntervalValue(4.0, 8.0),
        startSize: new IntervalValue(0.04, 0.12),
        startColor: new ConstantColor(new Vector4(1.0, 0.9, 0.2, 1)),
        worldSpace: true, maxParticle: 60,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(50), cycle: 1, interval: 0.01, probability: 1 }],
        shape: new SphereEmitter({ radius: 0.05, thickness: 1, arc: Math.PI * 2 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    pulse.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 1.0, 0.5, 1),
        new Vector4(1.0, 0.5, 0.0, 0),
    )));
    pulse.addBehavior(new SizeOverLife(FADE_OUT));
    _spawn(pulse, pos, 1.0);
}
// ══════════════════════════════════════════════════════════════════════════
//  DOUBLE ATTACK — (New Skill)
//  Fast, sharp horizontal slice in bright orange/red
// ══════════════════════════════════════════════════════════════════════════
export function triggerDoubleAttackEffect() {
    if (!batchRenderer || !sceneRef || !cameraRef) return;
    const tex = createGlowTexture();
    const pos = _frontPos(1.0);

    // Fast horizontal slash of particles
    const slash = new ParticleSystem({
        duration: 0.4, looping: false,
        startLife: new IntervalValue(0.15, 0.4),
        startSpeed: new IntervalValue(6.0, 12.0),
        startSize: new IntervalValue(0.04, 0.12),
        startColor: new ConstantColor(new Vector4(1, 0.4, 0.1, 1)),
        worldSpace: true, maxParticle: 120,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{ time: 0, count: new ConstantValue(100), cycle: 1, interval: 0.005, probability: 1 }],
        // Narrow horizontal fan
        shape: new ConeEmitter({ radius: 0.1, thickness: 1, arc: Math.PI / 1.5, angle: Math.PI / 10 }),
        material: _mat(tex), startTileIndex: new ConstantValue(0),
        uTileCount: 1, vTileCount: 1, renderMode: RenderMode.BillBoard, renderOrder: 2,
    });
    slash.addBehavior(new ColorOverLife(new ColorRange(
        new Vector4(1.0, 0.9, 0.2, 1),
        new Vector4(1.0, 0.1, 0.0, 0),
    )));
    slash.addBehavior(new SizeOverLife(FADE_OUT));

    // Orient to face camera and then rotate so it's a horizontal slash
    const dir = new THREE.Vector3();
    cameraRef.getWorldDirection(dir);
    slash.emitter.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    // Rotate 90 degrees around the local forward axis maybe? 
    // For now, let's just use the cone angle to make it look sharp.
    _spawn(slash, pos, 0.8);
}

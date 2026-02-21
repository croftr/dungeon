# Monster Asset Integration Guide

When adding new AI-generated or external 3D models (specifically `.glb` or `.fbx` formats) into `src/monster.js`, use the following guidelines for scaling and material configuration.

## Scaling Rules of Thumb

Different asset sources export using different unit sizes. Three.js expects models where 1 unit = 1 meter. 

### 1. Meshy.ai Models (`.glb`)
Meshy exports are generally too large. As a baseline:
*   **Initial Check Scale:** `0.45` (This scale is visually appropriate for standard humanoid characters like Goblins and Monsters).
*   *Code Example:* `model.scale.setScalar(0.45);`

### 2. Mixamo Animations/Characters (`.fbx`)
Mixamo exports are often *extremely* large (100x bigger than our expected scale).
*   **Target Scale:** `0.0085` (Works well for humanoid zombies and characters).
*   *Code Example:* `fbx.scale.setScalar(0.0085);`

### 3. Procedural Three.js Geometries
*   If combining capsules and boxes, create them around standard unit sizes (e.g., body is `1.0` unit tall) and scale the parent group accordingly.
*   **Target Scale (for small characters):** `0.35`
*   *Code Example:* `group.scale.setScalar(0.35);`

---

## Material & Sidedness Fixes (Importing `.glb`)

AI tools often generate models with incorrect material flags that cause rendering errors (strange shading, transparency artifacts, extreme shininess). **Always apply this material reset to imported `.glb` meshes** inside the `model.traverse` loop:

```javascript
model.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = true;
    child.receiveShadow = true;
    
    if (child.material) {
      // 1. Disable accidental transparency (fixes inside-out rendering)
      child.material.transparent = false;
      child.material.depthWrite = true;
      
      // 2. Remove unintended metallic sheen and maximum roughness
      if (child.material.metalness !== undefined) child.material.metalness = 0.0;
      if (child.material.roughness !== undefined) child.material.roughness = 1.0;
      
      // 3. Ensure both sides are rendered if geometry is thin
      // Uncomment if there are holes in the mesh:
      // child.material.side = THREE.DoubleSide; 
    }
  }
});
```

## Adding The Monster to `src/monster.js`

1.  Add the new entry to the `monsters` array at the top of the file.
2.  Define the path to the main idle/skin `.glb` file.
3.  Define the path to the attack animation `.glb` file.
4.  Reference this document to ensure `model.scale.setScalar(X)` and the material traverse fixes are applied!

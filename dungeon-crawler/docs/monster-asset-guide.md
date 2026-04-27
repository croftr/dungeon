# Monster Asset Integration Guide

This guide covers the full pipeline for adding a new monster — from receiving raw `.glb` animation files through to uploading to AWS S3.

---

## Step 1: Place the Animation Files

Create a new folder under `public/monsters/<monster-name>/` and place all `.glb` animation files and any `.mp3` sound files into it.

**Typical animation files expected by `src/monster.js`:**
- `idle.glb`
- `combat-idle.glb`
- `walking.glb`
- `getting-hit.glb`
- `dead.glb`
- `standard-attack.glb`
- `special-attack.glb` (if applicable)

---

## Step 2: Compress the GLB Files

Raw `.glb` files from Meshy.ai contain large embedded PNG textures and uncompressed geometry. **Both must be compressed before upload to S3.** The tools are already installed as project devDependencies.

> ⚠️ **Order matters:** Apply WebP texture compression first, then Draco geometry compression. Doing it in reverse causes gltf-transform to decode and re-encode the Draco data (lossy).

### 2a. Convert embedded textures to WebP

Run from the project root. Replace `<monster-name>` with your folder name:

```powershell
Get-ChildItem -Path "public/monsters/<monster-name>" -Filter "*.glb" | ForEach-Object {
    npx gltf-transform webp $_.FullName $_.FullName --slots "*"
}
```

This typically reduces each file from ~5–7 MB down to ~1–3 MB depending on mesh complexity.

### 2b. Apply Draco geometry compression

```powershell
Get-ChildItem -Path "public/monsters/<monster-name>" -Filter "*.glb" | ForEach-Object {
    gltf-pipeline -i $_.FullName -o $_.FullName -d --quiet
}
```

> `gltf-pipeline` is installed globally. If it's not found, run `npm install -g gltf-pipeline` once.

### Compressing multiple monsters at once

To process several new monster folders in one pass:

```powershell
# Step 1: WebP textures (run first)
$folders = @("public/monsters/monster-one", "public/monsters/monster-two")
Get-ChildItem -Path $folders -Filter "*.glb" | ForEach-Object {
    Write-Host "WebP: $($_.Name)..."
    npx gltf-transform webp $_.FullName $_.FullName --slots "*"
}

# Step 2: Draco geometry (run second)
Get-ChildItem -Path $folders -Filter "*.glb" | ForEach-Object {
    Write-Host "Draco: $($_.Name)..."
    gltf-pipeline -i $_.FullName -o $_.FullName -d --quiet
}
```

### Verifying compression

To inspect any `.glb` file and confirm textures are `image/webp` and geometry is Draco-compressed:

```powershell
npx gltf-transform inspect "public/monsters/<monster-name>/idle.glb"
```

Look for `mimeType: image/webp` in the TEXTURES table and `KHR_draco_mesh_compression` in the extensions.

---

## Step 3: Add to `src/data/monsters.json`

Add the monster definition entry. Key fields:

```json
{
  "id": "monster_id",
  "name": "Monster Name",
  "animationPath": "/monsters/<monster-name>/",
  "scale": 0.45,
  ...
}
```

---

## Step 4: Scaling Rules of Thumb

Different asset sources export using different unit sizes. Three.js expects models where 1 unit = 1 meter.

### Meshy.ai Models (`.glb`)
Meshy exports are generally too large. As a baseline:
- **Initial Check Scale:** `0.45` — visually appropriate for standard humanoid characters (goblins, warriors, etc.)
- *Code Example:* `model.scale.setScalar(0.45);`

### Mixamo Animations/Characters (`.fbx`)
Mixamo exports are often *extremely* large (100× bigger than expected scale).
- **Target Scale:** `0.0085` — works well for humanoid zombies and characters
- *Code Example:* `fbx.scale.setScalar(0.0085);`

### Procedural Three.js Geometries
- If combining capsules and boxes, create them around standard unit sizes (e.g. body is `1.0` unit tall) and scale the parent group accordingly.
- **Target Scale (for small characters):** `0.35`
- *Code Example:* `group.scale.setScalar(0.35);`

---

## Step 5: Material & Sidedness Fixes

AI tools often generate models with incorrect material flags that cause rendering errors (strange shading, transparency artifacts, extreme shininess). **Always apply this material reset** inside the `model.traverse` loop in `src/monster.js`:

```javascript
model.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = true;
    child.receiveShadow = true;

    if (child.material) {
      // 1. Disable accidental transparency (fixes inside-out rendering)
      child.material.transparent = false;
      child.material.depthWrite = true;

      // 2. Remove unintended metallic sheen and set maximum roughness
      if (child.material.metalness !== undefined) child.material.metalness = 0.0;
      if (child.material.roughness !== undefined) child.material.roughness = 1.0;

      // 3. Ensure both sides are rendered if geometry is thin
      // Uncomment if there are holes in the mesh:
      // child.material.side = THREE.DoubleSide;
    }
  }
});
```

---

## Step 6: Upload to AWS S3

The Draco decoder is handled centrally by `src/gltf-loader.js` — **no code changes are needed** for the runtime to decompress the files. Once the GLBs are compressed and tested locally, sync to S3:

```bash
# Run from Git Bash in the project root
bash sync-s3.sh
```

You may need to invalidate the CloudFront cache afterwards if the old files are being served from CDN.

---

## Runtime Decompression (Reference)

`src/gltf-loader.js` exports a singleton `gltfLoader` with a `DRACOLoader` already attached. All monster loading goes through this — nothing needs to change per-monster:

```javascript
// src/gltf-loader.js (for reference — do not modify per monster)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(asset('/draco/'));

export const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
```

import * as THREE from 'three';

let _sharedTexture = null;

function _getBlobTexture() {
  if (_sharedTexture) return _sharedTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0,   'rgba(0,0,0,0.85)');
  grad.addColorStop(0.4, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _sharedTexture = new THREE.CanvasTexture(canvas);
  return _sharedTexture;
}

export function createBlobShadow(radius = 0.55) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  const mat = new THREE.MeshBasicMaterial({
    map: _getBlobTexture(),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 2;
  return mesh;
}

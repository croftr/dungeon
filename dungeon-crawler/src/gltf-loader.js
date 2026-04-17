import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { asset } from './assets.js';

const _draco = new DRACOLoader();
_draco.setDecoderPath(asset('/draco/'));

export const gltfLoader = new GLTFLoader();
gltfLoader.setCrossOrigin('anonymous');

gltfLoader.setDRACOLoader(_draco);

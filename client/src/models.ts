import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Tripo3D ile üretilen modeller public/assets/models/<isim>.glb altına konur.
// Dosya yoksa basit yer tutucu şekil kullanılır, böylece oyun modelsiz de çalışır.

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();

function loadGlb(name: string): Promise<THREE.Object3D | null> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader
        .loadAsync(`/assets/models/${name}.glb`)
        .then((gltf) => gltf.scene)
        .catch(() => null),
    );
  }
  return cache.get(name)!;
}

export function createModel(name: string, fallback: () => THREE.Object3D, height: number): THREE.Group {
  const root = new THREE.Group();
  const placeholder = fallback();
  root.add(placeholder);
  loadGlb(name).then((scene) => {
    if (!scene) return;
    const model = scene.clone(true);
    // Modeli istenen boya ölçekle ve ayaklarını zemine oturt.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0) model.scale.setScalar(height / size.y);
    const scaled = new THREE.Box3().setFromObject(model);
    model.position.y -= scaled.min.y;
    root.remove(placeholder);
    root.add(model);
  });
  return root;
}

function mat(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
}

export const placeholders = {
  player(cls: string, isMe: boolean) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1, 4, 12),
      mat(isMe ? 0xd4a24a : cls === "shadow" ? 0x4a5a8a : 0x9a3a2a),
    );
    body.position.y = 0.9;
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), mat(0xcccccc));
    weapon.position.set(0.5, 0.9, 0.4);
    g.add(body, weapon);
    return g;
  },
  monster() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), mat(0x2a2a30));
    body.scale.set(1, 0.8, 1.4);
    body.position.y = 0.6;
    const eyes = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    );
    eyes.position.set(0, 0.75, 0.82);
    g.add(body, eyes);
    return g;
  },
  stone() {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4, 0),
      new THREE.MeshStandardMaterial({ color: 0x1a1020, emissive: 0x5a1a6a, emissiveIntensity: 0.6, roughness: 0.4 }),
    );
    rock.scale.set(1, 1.8, 1);
    rock.position.y = 2.2;
    const glow = new THREE.PointLight(0xa040ff, 6, 12);
    glow.position.y = 2.5;
    g.add(rock, glow);
    return g;
  },
};

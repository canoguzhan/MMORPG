import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

// Tripo3D ile üretilen modeller public/assets/models/<isim>.glb altına konur.
// Dosya yoksa basit yer tutucu şekil kullanılır, böylece oyun modelsiz de çalışır.

// Modeller tools/ai/optimize-models.mjs ile meshopt sıkıştırılmıştır.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null>>();

function loadGlb(name: string) {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader
        .loadAsync(`/assets/models/${name}.glb`)
        .then((gltf) => ({ scene: gltf.scene, clips: removeRootMotion(gltf.scene, gltf.animations) }))
        .catch(() => null),
    );
  }
  return cache.get(name)!;
}

// Bazı klipler (ör. ölüm) karakteri yerinden kaydırır; konum sunucudan geldiği için
// kök kemiğin ve kalçanın yatay hareketi silinir. Kemik ekseni sahneninkiyle aynı
// olmayabildiğinden dikey eksen dinlenme pozundan bulunur.
export function removeRootMotion(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
  let root: THREE.Bone | undefined;
  scene.traverse((o) => {
    if (!root && (o as THREE.SkinnedMesh).isSkinnedMesh) root = (o as THREE.SkinnedMesh).skeleton.bones[0];
  });
  if (!root) return clips;
  const hips = root.children.find((c) => (c as THREE.Bone).isBone);
  // Dinlenme pozunda kalçanın köke uzaklığı boyudur; en büyük bileşeni dikey eksendir.
  const rest = hips?.position.toArray() ?? [0, 1, 0];
  const upAxis = [0, 1, 2].reduce((a, b) => (Math.abs(rest[b]) > Math.abs(rest[a]) ? b : a));
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const isRoot = track.name === `${root.name}.position`;
      if (!isRoot && track.name !== `${hips?.name}.position`) continue;
      const v = track.values;
      // Kök kemik tamamen sabitlenir; kalça yalnızca dikeyde (çömelme, yere düşme) oynar.
      const up = isRoot ? -1 : upAxis;
      for (let i = 3; i < v.length; i += 3) {
        for (const axis of [0, 1, 2]) if (axis !== up) v[i + axis] = v[axis];
      }
    }
  }
  return clips;
}

// --- Animasyon ---
// Tripo3D klip adları: idle, walk, run, slash, fall (kurtta yalnızca "preset:quadruped:walk").
// Eksik klipler için basit kod animasyonu kullanılır (ör. kurdun saldırısı ve ölümü).
export type AnimState = "idle" | "walk" | "run" | "attack" | "death";

const CLIP_FOR: Record<AnimState, string[]> = {
  idle: ["idle"],
  walk: ["walk"],
  run: ["run", "walk"],
  attack: ["slash"],
  death: ["fall"],
};

interface Animator {
  mixer?: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  body: THREE.Object3D;
  state?: AnimState;
  current?: THREE.AnimationAction;
  time: number;
}

function setupAnimator(root: THREE.Object3D, body: THREE.Object3D, clips: THREE.AnimationClip[] = []) {
  const anim: Animator = { actions: new Map(), body, time: 0, state: root.userData.anim?.state };
  if (clips.length) {
    anim.mixer = new THREE.AnimationMixer(body);
    for (const clip of clips) anim.actions.set(clip.name.split(":").pop()!, anim.mixer.clipAction(clip));
  }
  root.userData.anim = anim;
  const state = anim.state;
  anim.state = undefined;
  if (state) animateModel(root, state, 0);
}

export function animateModel(root: THREE.Object3D, state: AnimState, dt: number) {
  const anim = root.userData.anim as Animator | undefined;
  if (!anim) return;
  anim.time += dt;
  if (state !== anim.state) {
    anim.state = state;
    const action = CLIP_FOR[state].map((n) => anim.actions.get(n)).find(Boolean);
    if (action !== anim.current) {
      anim.current?.fadeOut(0.2);
      if (action) {
        action.reset().fadeIn(0.2).play();
        action.setLoop(state === "death" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = state === "death";
        // Saldırı klibi uzun bir kombo; savaş temposuna uysun diye hızlandırılır.
        action.timeScale = state === "attack" ? 1.6 : state === "run" && !anim.actions.has("run") ? 1.8 : 1;
      }
      anim.current = action;
    }
  }
  anim.mixer?.update(dt);

  // Klibi olmayan durumlar için kod animasyonu.
  const hasClip = anim.current !== undefined;
  const body = anim.body;
  const k = Math.min(1, dt * 10);
  const targetTilt = state === "death" && !hasClip ? Math.PI / 2 : 0;
  body.rotation.z += (targetTilt - body.rotation.z) * Math.min(1, dt * 6);
  const lunge = state === "attack" && !hasClip ? Math.max(0, Math.sin(anim.time * 12)) * 0.5 : 0;
  body.position.z += (lunge - body.position.z) * k;
  body.rotation.x = state === "attack" && !hasClip ? -Math.max(0, Math.sin(anim.time * 12)) * 0.25 : 0;
}

export function createModel(name: string, fallback: () => THREE.Object3D, height: number): THREE.Group {
  const root = new THREE.Group();
  const placeholder = fallback();
  root.add(placeholder);
  setupAnimator(root, placeholder);
  loadGlb(name).then((loaded) => {
    if (!loaded) return;
    // İskeletli modeller düz clone ile kopyalanınca kemik bağları kopar.
    const model = cloneSkinned(loaded.scene);
    // Tripo3D modelleri +x yönüne bakar; oyunda "ileri" +z olduğu için çeyrek tur döndürülür.
    model.rotation.y = -Math.PI / 2;
    // Modeli istenen boya ölçekle ve ayaklarını zemine oturt.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0) model.scale.setScalar(height / size.y);
    const scaled = new THREE.Box3().setFromObject(model);
    model.position.y -= scaled.min.y;
    root.remove(placeholder);
    // Ölçek ve zemin ayarı modelin kendisinde kalsın; animasyonlar bu kabın içinde döner.
    const body = new THREE.Group();
    body.add(model);
    root.add(body);
    setupAnimator(root, body, loaded.clips);
  });
  return root;
}

function mat(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
}

export const placeholders = {
  minion(color: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 10), mat(color));
    body.position.y = 0.65;
    g.add(body);
    return g;
  },
  tower(color: number) {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 7, 8), mat(0x8a8378));
    pillar.position.y = 3.5;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }),
    );
    crystal.position.y = 8.3;
    g.add(pillar, crystal);
    return g;
  },
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

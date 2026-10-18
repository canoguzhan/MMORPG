import * as THREE from "three";
import {
  BASE_RADIUS, distanceToPath, isOpenGround, JUNGLE_CAMPS, KINGDOMS, LANE_WIDTH, LANES, MAP_HALF_SIZE, RIVER, RIVER_WIDTH, Vec2,
} from "../../shared/map";
import { createModel, placeholders } from "./models";

/**
 * Vadi: üç koridor, çapraz nehir, aralarında orman ve iki krallık üssü.
 * Yerleşim shared/map.ts'tedir; sunucu da aynı dosyayı kullanır.
 */
export function buildValley(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x8fb8d8);
  scene.fog = new THREE.Fog(0x8fb8d8, 80, 220);

  scene.add(new THREE.HemisphereLight(0xfff2d8, 0x46603a, 1.4));
  const sun = new THREE.DirectionalLight(0xffe8c0, 2);
  sun.position.set(-40, 90, 30);
  scene.add(sun);

  // Zemin dokuları Higgsfield ile üretildi (tools/ai/assets.json → ground_*).
  const grass = groundMaterial("ground_grass", 0x8fae6a, 0x3f5a2a);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF_SIZE * 2 + 40, MAP_HALF_SIZE * 2 + 40), grass);
  ground.rotation.x = -Math.PI / 2;
  worldUv(ground, 10);
  scene.add(ground);

  waterMaterial = groundMaterial("ground_water", 0x6ab4e0, 0x3a7ca5);
  waterMaterial.roughness = 0.25;
  waterMaterial.metalness = 0.15;
  addPath(scene, RIVER, RIVER_WIDTH, waterMaterial, 0.015, 8);
  const dirt = groundMaterial("ground_path", 0xf2e2c8, 0x9a8160);
  for (const lane of Object.values(LANES)) addPath(scene, lane, LANE_WIDTH, dirt, 0.02, 5);

  // Kuleler sunucudan gelen birimlerdir (main.ts); burada yalnızca üsler çizilir.
  for (const [id, kingdom] of Object.entries(KINGDOMS)) addBase(scene, id, kingdom.base, kingdom.color);
  const rand = seeded(7);
  // Orman kampları: kenarında birkaç kaya olan açıklık.
  for (const [x, z] of JUNGLE_CAMPS) {
    for (let i = 0; i < 3; i++) {
      const angle = rand() * Math.PI * 2;
      place(scene, "jungle_rock", placeholderRock, 2.5 + rand() * 1.5, [x + Math.cos(angle) * 8, z + Math.sin(angle) * 8], rand);
    }
  }

  // Orman: kapalı alanlara ızgarayla ağaç ve kaya dikilir; koridorlar, nehir ve kamplar açık kalır.
  const step = 8;
  for (let x = -MAP_HALF_SIZE - 6; x <= MAP_HALF_SIZE + 6; x += step) {
    for (let z = -MAP_HALF_SIZE - 6; z <= MAP_HALF_SIZE + 6; z += step) {
      const p: Vec2 = [x + (rand() - 0.5) * step * 0.8, z + (rand() - 0.5) * step * 0.8];
      if (isOpenGround(p)) continue;
      // Geniş taçlı ağaçlar koridorun üstüne taşmasın.
      if (Object.values(LANES).some((lane) => distanceToPath(p, lane) < LANE_WIDTH / 2 + 5)) continue;
      const roll = rand();
      if (roll < 0.12) place(scene, "jungle_rock", placeholderRock, 3 + rand() * 2, p, rand);
      else if (roll < 0.7) place(scene, "jungle_tree", placeholderTree, 6 + rand() * 3, p, rand);
      else place(scene, "pine_tree", placeholderTree, 6 + rand() * 2.5, p, rand);
    }
  }

  // Çalılar: koridorların iki yanında aralıklı öbekler (LoL'deki saklanma çalıları gibi).
  for (const lane of Object.values(LANES)) {
    for (let i = 0; i < lane.length - 1; i++) {
      const [ax, az] = lane[i];
      const [bx, bz] = lane[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let t = 18; t < len - 18; t += 26) {
        const side = rand() < 0.5 ? -1 : 1;
        const off = LANE_WIDTH / 2 + 2.5;
        const cx = ax + ((bx - ax) * t) / len + nx * off * side;
        const cz = az + ((bz - az) * t) / len + nz * off * side;
        for (let k = 0; k < 3; k++) {
          place(scene, "bush", placeholderBush, 1.1 + rand() * 0.4, [cx + (rand() - 0.5) * 4, cz + (rand() - 0.5) * 4], rand);
        }
      }
    }
  }
}

let waterMaterial: THREE.MeshStandardMaterial | undefined;

/** Nehrin akıyormuş gibi görünmesi için dokusunu kaydırır. */
export function updateWorld(dt: number) {
  if (waterMaterial?.map) waterMaterial.map.offset.x += dt * 0.03;
}

function place(scene: THREE.Scene, model: string, fallback: () => THREE.Object3D, height: number, [x, z]: Vec2, rand: () => number) {
  const obj = createModel(model, fallback, height);
  obj.position.set(x, 0, z);
  obj.rotation.y = rand() * Math.PI * 2;
  scene.add(obj);
}

const textureLoader = new THREE.TextureLoader();

/** Dokulu zemin malzemesi; doku yüklenene kadar (ya da hiç yoksa) düz renk kullanılır. */
function groundMaterial(name: string, tint: number, fallback: number) {
  const material = new THREE.MeshStandardMaterial({ color: fallback, roughness: 1 });
  textureLoader.load(`/assets/media/${name}.jpg`, (texture) => {
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    material.map = texture;
    material.color.setHex(tint);
    material.needsUpdate = true;
  });
  return material;
}

/** Dokuyu dünya koordinatına göre yerleştirir: komşu şeritlerde desen kesintisiz devam eder. */
function worldUv(mesh: THREE.Mesh, tile: number) {
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    uv.setXY(i, v.x / tile, v.z / tile);
  }
  uv.needsUpdate = true;
}

/** Kırık çizgi boyunca düz şerit (koridor ya da nehir) çizer. */
function addPath(scene: THREE.Scene, path: Vec2[], width: number, material: THREE.Material, y: number, tile: number) {
  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i];
    const joint = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 24), material);
    joint.rotation.x = -Math.PI / 2;
    joint.position.set(x, y, z);
    worldUv(joint, tile);
    scene.add(joint);
    if (i === path.length - 1) continue;
    const [nx, nz] = path[i + 1];
    const length = Math.hypot(nx - x, nz - z);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.atan2(x - nx, z - nz);
    strip.position.set((x + nx) / 2, y, (z + nz) / 2);
    worldUv(strip, tile);
    scene.add(strip);
  }
}

function addBase(scene: THREE.Scene, id: string, [x, z]: Vec2, color: number) {
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(BASE_RADIUS, 48),
    new THREE.MeshStandardMaterial({ color: 0xa89878, roughness: 1 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(x, 0.025, z);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BASE_RADIUS - 1, BASE_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.03, z);
  scene.add(plaza, ring);

  // Üssün kalbi: krallığın kristal anıtı.
  const core = createModel(`core_${id}`, () => placeholders.tower(color), 8);
  core.position.set(x, 0, z);
  scene.add(core);

  // Üssün dış kenarına, merkeze bakan evler.
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const house = createModel("village_house", placeholderHouse, 4.5);
    house.position.set(x + Math.cos(angle) * (BASE_RADIUS - 5), 0, z + Math.sin(angle) * (BASE_RADIUS - 5));
    house.rotation.y = Math.atan2(-Math.cos(angle), -Math.sin(angle));
    scene.add(house);
  }
}

/** Her açılışta aynı ormanı üretmek için basit tohumlu rastgele sayı üreteci. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function placeholderHouse() {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 5), new THREE.MeshStandardMaterial({ color: 0xc9b48a }));
  walls.position.y = 1.75;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x7a2a1a }));
  roof.position.y = 4.7;
  roof.rotation.y = Math.PI / 4;
  g.add(walls, roof);
  return g;
}

function placeholderRock() {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2), new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 1 }));
  rock.position.y = 0.8;
  return rock;
}

function placeholderBush() {
  const bush = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1 }));
  bush.position.y = 0.6;
  return bush;
}

function placeholderTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2), new THREE.MeshStandardMaterial({ color: 0x5a3a1a }));
  trunk.position.y = 1;
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x2f5a2a }));
  leaves.position.y = 4;
  g.add(trunk, leaves);
  return g;
}

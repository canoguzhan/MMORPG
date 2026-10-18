import * as THREE from "three";
import {
  BASE_RADIUS, isOpenGround, JUNGLE_CAMPS, KINGDOMS, LANE_WIDTH, LANES, MAP_HALF_SIZE, RIVER, RIVER_WIDTH, TOWERS, Vec2,
} from "../../shared/map";
import { createModel } from "./models";

/**
 * Vadi: üç koridor, çapraz nehir, aralarında orman ve iki krallık üssü.
 * Yerleşim shared/map.ts'tedir; sunucu da aynı dosyayı kullanır.
 */
export function buildValley(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x9cc4e4);
  scene.fog = new THREE.Fog(0x9cc4e4, 70, 200);

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a5a3a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF_SIZE * 2 + 40, MAP_HALF_SIZE * 2 + 40),
    new THREE.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const water = new THREE.MeshStandardMaterial({ color: 0x3a7ca5, roughness: 0.2, metalness: 0.1 });
  addPath(scene, RIVER, RIVER_WIDTH, water, 0.015);
  const dirt = new THREE.MeshStandardMaterial({ color: 0x9a8160, roughness: 1 });
  for (const lane of Object.values(LANES)) addPath(scene, lane, LANE_WIDTH, dirt, 0.02);

  for (const kingdom of Object.values(KINGDOMS)) addBase(scene, kingdom.base, kingdom.color);
  for (const tower of TOWERS) {
    const t = placeholderTower(KINGDOMS[tower.kingdom].color);
    t.position.set(tower.pos[0], 0, tower.pos[1]);
    scene.add(t);
  }
  for (const [x, z] of JUNGLE_CAMPS) {
    const clearing = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshStandardMaterial({ color: 0x55703a }));
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(x, 0.01, z);
    scene.add(clearing);
  }

  // Orman: kapalı alanlara seyrek ızgarayla ağaç dikilir, böylece koridorlar ve nehir açık kalır.
  const rand = seeded(7);
  const step = 9;
  for (let x = -MAP_HALF_SIZE - 6; x <= MAP_HALF_SIZE + 6; x += step) {
    for (let z = -MAP_HALF_SIZE - 6; z <= MAP_HALF_SIZE + 6; z += step) {
      const p: Vec2 = [x + (rand() - 0.5) * step * 0.8, z + (rand() - 0.5) * step * 0.8];
      if (isOpenGround(p)) continue;
      const tree = createModel("pine_tree", placeholderTree, 5 + rand() * 2.5);
      tree.position.set(p[0], 0, p[1]);
      tree.rotation.y = rand() * Math.PI * 2;
      scene.add(tree);
    }
  }
}

/** Kırık çizgi boyunca düz şerit (koridor ya da nehir) çizer. */
function addPath(scene: THREE.Scene, path: Vec2[], width: number, material: THREE.Material, y: number) {
  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i];
    const joint = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 24), material);
    joint.rotation.x = -Math.PI / 2;
    joint.position.set(x, y, z);
    scene.add(joint);
    if (i === path.length - 1) continue;
    const [nx, nz] = path[i + 1];
    const length = Math.hypot(nx - x, nz - z);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.atan2(x - nx, z - nz);
    strip.position.set((x + nx) / 2, y, (z + nz) / 2);
    scene.add(strip);
  }
}

function addBase(scene: THREE.Scene, [x, z]: Vec2, color: number) {
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

  // Üssün dış kenarına, merkeze bakan evler.
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const house = createModel("village_house", placeholderHouse, 4.5);
    house.position.set(x + Math.cos(angle) * (BASE_RADIUS - 5), 0, z + Math.sin(angle) * (BASE_RADIUS - 5));
    house.rotation.y = Math.atan2(-Math.cos(angle), -Math.sin(angle));
    scene.add(house);
  }
}

function placeholderTower(color: number) {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.8, 7, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }),
  );
  pillar.position.y = 3.5;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }),
  );
  crystal.position.y = 8.3;
  g.add(pillar, crystal);
  return g;
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

function placeholderTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2), new THREE.MeshStandardMaterial({ color: 0x5a3a1a }));
  trunk.position.y = 1;
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x2f5a2a }));
  leaves.position.y = 4;
  g.add(trunk, leaves);
  return g;
}

import * as THREE from "three";
import { createModel } from "./models";

/** Başlangıç köyü: yer tutucu evler, çit ve ağaçlarla basit bir düzen. */
export function buildVillage(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x9cc4e4);
  scene.fog = new THREE.Fog(0x9cc4e4, 60, 180);

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a5a3a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x5c7a3a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(20, 48),
    new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 1 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  scene.add(plaza);

  const houseSpots: [number, number, number][] = [
    [-14, -10, 0.4], [14, -10, -0.4], [-16, 8, 1.2], [16, 8, -1.2], [0, -17, 0],
  ];
  for (const [x, z, rot] of houseSpots) {
    const house = createModel("village_house", placeholderHouse, 6);
    house.position.set(x, 0, z);
    house.rotation.y = rot;
    scene.add(house);
  }

  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 28 + Math.random() * 75;
    const tree = createModel("pine_tree", placeholderTree, 7);
    tree.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    scene.add(tree);
  }
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

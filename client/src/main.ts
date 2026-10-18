import * as THREE from "three";
import { Client, getStateCallbacks, Room } from "colyseus.js";
import { playSfx, startAmbience } from "./audio";
import { animateModel, AnimState, createModel, placeholders } from "./models";
import { buildVillage } from "./world";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:2567`;
const MOVE_SPEED = 8;
const ATTACK_RANGE = 3;
const SEND_EVERY_MS = 100;

interface Entity {
  kind: "player" | "monster" | "stone";
  obj: THREE.Object3D;
  target: THREE.Vector3;
  targetRot: number;
  label: string;
  hp: number;
  maxHp: number;
  lastPos: THREE.Vector3;
  attackUntil: number;
  dying: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- Sahne ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
buildVillage(scene);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Durum ---
const entities = new Map<string, Entity>();
let room: Room | undefined;
let myId = "";
let selectedId = "";
let camYaw = Math.PI;
let camPitch = 0.6;
let camDist = 14;
const keys = new Set<string>();
let lastSentAt = 0;
let lastAttackAt = 0;

// --- Giriş ---
$<HTMLFormElement>("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>("name").value;
  const cls = (document.querySelector("input[name=cls]:checked") as HTMLInputElement).value;
  try {
    room = await new Client(SERVER_URL).joinOrCreate("village", { name, cls });
  } catch (err) {
    $("login-error").textContent = "Sunucuya bağlanılamadı. Sunucu çalışıyor mu?";
    console.error(err);
    return;
  }
  myId = room.sessionId;
  $("login").remove();
  $("hud").hidden = false;
  startAmbience();
  bindRoom(room);
});

function bindRoom(room: Room) {
  const $s = getStateCallbacks(room) as any;
  const state = room.state as any;

  $s(state).players.onAdd((p: any, id: string) => {
    const e = addEntity(id, "player", createModel(p.cls, () => placeholders.player(p.cls, id === myId), 1.8), p);
    e.label = p.name;
    $s(p).onChange(() => syncEntity(e, p, id !== myId || distanceTo(e, p) > 2));
  });
  $s(state).players.onRemove((_p: any, id: string) => removeEntity(id));

  $s(state).monsters.onAdd((m: any, id: string) => {
    const e = addEntity(id, "monster", createModel(m.kind, placeholders.monster, 1.4), m);
    e.label = "Kararmış Kurt";
    $s(m).onChange(() => syncEntity(e, m, true));
  });
  $s(state).monsters.onRemove((_m: any, id: string) => removeEntity(id));

  $s(state).stones.onAdd((s: any, id: string) => {
    const e = addEntity(id, "stone", createModel("dark_meteor_stone", placeholders.stone, 4.5), s);
    e.label = "Kara Göktaşı";
    $s(s).onChange(() => syncEntity(e, s, true));
  });
  $s(state).stones.onRemove((_s: any, id: string) => removeEntity(id));

  room.onMessage("hit", ({ targetId, dmg, by }) => {
    const attacker = entities.get(by);
    if (attacker) attacker.attackUntil = performance.now() + 700;
    const e = entities.get(targetId);
    if (e) floatText(e.obj.position, `-${dmg}`, targetId === myId);
    if (e && (targetId === myId || selectedId === targetId)) playSfx("sword_hit");
  });
  room.onMessage("levelUp", ({ id, level }) => {
    if (id !== myId) return;
    toast(`Seviye ${level}!`);
    playSfx("level_up");
  });
  room.onMessage("stoneFell", () => {
    toast("Bir Kara Göktaşı düştü!");
    playSfx("stone_fall");
  });
  room.onMessage("respawned", () => toast("Köyde yeniden doğdun"));
  room.onMessage("chat", ({ from, text }) => {
    const line = document.createElement("div");
    line.textContent = `${from}: ${text}`;
    $("chat-log").append(line);
    $("chat-log").scrollTop = 1e9;
  });
  room.onLeave(() => toast("Sunucu bağlantısı koptu"));
}

function addEntity(id: string, kind: Entity["kind"], obj: THREE.Object3D, src: any): Entity {
  obj.position.set(src.x, 0, src.z);
  obj.userData.entityId = id;
  scene.add(obj);
  const e: Entity = {
    kind, obj, target: obj.position.clone(), targetRot: src.rot ?? 0, label: "", hp: src.hp, maxHp: src.maxHp,
    lastPos: obj.position.clone(), attackUntil: 0, dying: false,
  };
  entities.set(id, e);
  return e;
}

function syncEntity(e: Entity, src: any, followPosition: boolean) {
  e.hp = src.hp;
  e.maxHp = src.maxHp;
  if (followPosition) {
    e.target.set(src.x, 0, src.z);
    if (src.rot !== undefined) e.targetRot = src.rot;
  }
}

function distanceTo(e: Entity, src: any) {
  return Math.hypot(e.obj.position.x - src.x, e.obj.position.z - src.z);
}

function removeEntity(id: string) {
  const e = entities.get(id);
  if (!e) return;
  entities.delete(id);
  if (selectedId === id) selectedId = "";
  if (e.kind !== "monster") return void scene.remove(e.obj);
  // Ölen canavar sahneden hemen kalkmasın; ölüm animasyonu oynasın.
  e.dying = true;
  dyingEntities.add(e);
  setTimeout(() => {
    scene.remove(e.obj);
    dyingEntities.delete(e);
  }, 1500);
}

const dyingEntities = new Set<Entity>();

function animState(e: Entity, dt: number): AnimState {
  const speed = e.obj.position.distanceTo(e.lastPos) / Math.max(dt, 1e-3);
  e.lastPos.copy(e.obj.position);
  if (e.dying || e.hp <= 0) return "death";
  if (performance.now() < e.attackUntil) return "attack";
  if (speed > 6) return "run";
  if (speed > 0.5) return "walk";
  return "idle";
}

// --- Giriş kontrolleri ---
const chatInput = $<HTMLInputElement>("chat-input");
addEventListener("keydown", (e) => {
  if (document.activeElement === chatInput) {
    if (e.key === "Enter") {
      if (chatInput.value.trim()) room?.send("chat", { text: chatInput.value });
      chatInput.value = "";
      chatInput.blur();
    }
    return;
  }
  if (e.key === "Enter" && room) return chatInput.focus();
  keys.add(e.key.toLowerCase());
  if (e.code === "Space") selectNearestEnemy();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let dragging = false;
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 2) dragging = true;
  if (e.button === 0) pickTarget(e);
});
addEventListener("mouseup", () => (dragging = false));
addEventListener("mousemove", (e) => {
  if (!dragging) return;
  camYaw -= e.movementX * 0.005;
  camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.005, 0.15, 1.3);
});
addEventListener("wheel", (e) => (camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 5, 30)));

const raycaster = new THREE.Raycaster();
function pickTarget(e: MouseEvent) {
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const enemies = [...entities.values()].filter((x) => x.kind !== "player").map((x) => x.obj);
  for (const hit of raycaster.intersectObjects(enemies, true)) {
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.entityId) o = o.parent;
    if (o) {
      selectedId = o.userData.entityId;
      return;
    }
  }
}

function selectNearestEnemy() {
  const me = entities.get(myId);
  if (!me) return;
  let best = "";
  let bestDist = Infinity;
  for (const [id, e] of entities) {
    if (e.kind === "player") continue;
    const d = e.obj.position.distanceTo(me.obj.position);
    if (d < bestDist) [best, bestDist] = [id, d];
  }
  selectedId = best;
}

// --- Oyun döngüsü ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const me = entities.get(myId);
  if (me && room) updateLocalPlayer(me, dt);

  for (const [id, e] of entities) {
    if (id === myId) continue;
    e.obj.position.lerp(e.target, Math.min(1, dt * 10));
    e.obj.rotation.y = lerpAngle(e.obj.rotation.y, e.targetRot, dt * 10);
  }
  const t = clock.elapsedTime;
  for (const e of entities.values()) {
    if (e.kind === "stone") {
      // Göktaşı yavaşça döner ve havada hafifçe salınır.
      const body = e.obj.children[0];
      body?.rotateY(dt * 0.5);
      if (body) body.position.y = 0.3 + Math.sin(t * 1.5) * 0.3;
    } else {
      animateModel(e.obj, animState(e, dt), dt);
    }
  }
  for (const e of dyingEntities) animateModel(e.obj, "death", dt);

  updateCamera(me);
  updateHud(me);
  renderer.render(scene, camera);
});

function updateLocalPlayer(me: Entity, dt: number) {
  const self = (room!.state as any).players.get(myId);
  if (!self || self.hp <= 0) {
    if (self) me.obj.position.set(self.x, 0, self.z);
    return;
  }
  const forward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw)).negate();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const dir = new THREE.Vector3();
  if (keys.has("w")) dir.add(forward);
  if (keys.has("s")) dir.sub(forward);
  if (keys.has("d")) dir.add(right);
  if (keys.has("a")) dir.sub(right);

  const target = entities.get(selectedId);
  if (dir.lengthSq() > 0) {
    dir.normalize();
    me.obj.position.addScaledVector(dir, MOVE_SPEED * dt);
    me.obj.rotation.y = Math.atan2(dir.x, dir.z);
  } else if (target) {
    // Hedef seçiliyse ona yürü ve menzile girince saldır.
    const to = target.obj.position.clone().sub(me.obj.position).setY(0);
    const range = ATTACK_RANGE + (target.kind === "stone" ? 1.5 : 0) - 0.3;
    me.obj.rotation.y = Math.atan2(to.x, to.z);
    if (to.length() > range) {
      me.obj.position.addScaledVector(to.normalize(), MOVE_SPEED * dt);
    } else if (performance.now() - lastAttackAt > 500) {
      lastAttackAt = performance.now();
      room!.send("attack", { targetId: selectedId });
      me.attackUntil = performance.now() + 700;
    }
  }

  me.obj.position.x = THREE.MathUtils.clamp(me.obj.position.x, -100, 100);
  me.obj.position.z = THREE.MathUtils.clamp(me.obj.position.z, -100, 100);
  if (performance.now() - lastSentAt > SEND_EVERY_MS) {
    lastSentAt = performance.now();
    room!.send("move", { x: me.obj.position.x, z: me.obj.position.z, rot: me.obj.rotation.y });
  }
  // Sunucu konumu çok farklıysa (ör. ölüm sonrası) ona dön.
  if (Math.hypot(self.x - me.obj.position.x, self.z - me.obj.position.z) > 4) {
    me.obj.position.set(self.x, 0, self.z);
  }
}

function updateCamera(me?: Entity) {
  const focus = me ? me.obj.position : new THREE.Vector3();
  camera.position.set(
    focus.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
    focus.y + Math.sin(camPitch) * camDist + 1.5,
    focus.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist,
  );
  camera.lookAt(focus.x, focus.y + 1.5, focus.z);
}

function updateHud(me?: Entity) {
  const self = room && (room.state as any).players?.get(myId);
  if (!self || !me) return;
  $("player-name").textContent = `${self.name} · ${self.cls === "shadow" ? "Gölge" : "Savaşçı"}`;
  $("hp-fill").style.width = `${(self.hp / self.maxHp) * 100}%`;
  $("hp-text").textContent = `${self.hp} / ${self.maxHp}`;
  $("exp-fill").style.width = `${(self.exp / Math.floor(100 * Math.pow(self.level, 1.5))) * 100}%`;
  $("meta").textContent = `Seviye ${self.level} · ${self.gold} altın`;

  const t = entities.get(selectedId);
  $("target").hidden = !t;
  if (t) {
    $("target-name").textContent = t.label;
    $("target-fill").style.width = `${(t.hp / t.maxHp) * 100}%`;
  }
}

function floatText(pos: THREE.Vector3, text: string, taken: boolean) {
  const p = pos.clone().setY(2.5).project(camera);
  const el = document.createElement("div");
  el.className = taken ? "dmg taken" : "dmg";
  el.textContent = text;
  el.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
  el.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 900);
}

let toastTimer = 0;
function toast(text: string) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2000);
}

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * Math.min(1, t);
}

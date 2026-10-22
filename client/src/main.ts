import * as THREE from "three";
import { Client, getStateCallbacks, Room } from "colyseus.js";
import { ABILITIES, Slot, SLOTS } from "../../shared/abilities";
import { KINGDOMS } from "../../shared/map";
import { playSfx, startAmbience } from "./audio";
import { animateModel, AnimState, createModel, placeholders } from "./models";
import { buildValley, updateWorld } from "./world";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:2567`;
const MOVE_SPEED = 8;
const ATTACK_RANGE = 3;
const SEND_EVERY_MS = 100;

interface Entity {
  kind: "player" | "monster" | "stone" | "minion" | "tower";
  /** Krallık kimliği ya da "neutral". */
  team: string;
  hpBar: THREE.Group;
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
buildValley(scene);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Durum ---
const entities = new Map<string, Entity>();
let room: Room | undefined;
let myId = "";
let selectedId = ""; // hedef çerçevesinde gösterilen
let attackId = ""; // sağ tıkla saldırı emri verilen
let moveTarget: THREE.Vector3 | undefined;
// Kamera yukarıdan eğik bakar ve dönmez; kuzey (-z) ekranın üstüdür.
const CAM_PITCH = 0.95;
let camDist = 17;
let lastSentAt = 0;
let lastAttackAt = 0;

// --- Giriş ---
$<HTMLFormElement>("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>("name").value;
  const cls = (document.querySelector("input[name=cls]:checked") as HTMLInputElement).value;
  const kingdom = (document.querySelector("input[name=kingdom]:checked") as HTMLInputElement).value;
  try {
    room = await new Client(SERVER_URL).joinOrCreate("village", { name, cls, kingdom });
  } catch (err) {
    $("login-error").textContent = "Sunucuya bağlanılamadı. Sunucu çalışıyor mu?";
    console.error(err);
    return;
  }
  myId = room.sessionId;
  myClass = cls as keyof typeof ABILITIES;
  myTeam = kingdom;
  buildAbilityBar();
  $("login").remove();
  $("hud").hidden = false;
  startAmbience();
  bindRoom(room);
});

function bindRoom(room: Room) {
  const $s = getStateCallbacks(room) as any;
  const state = room.state as any;

  $s(state).players.onAdd((p: any, id: string) => {
    const e = addEntity(id, "player", createModel(p.cls, () => placeholders.player(p.cls, id === myId), 2.4), p, p.kingdom);
    e.label = p.name;
    $s(p).onChange(() => syncEntity(e, p, id !== myId || distanceTo(e, p) > 2));
  });
  $s(state).players.onRemove((_p: any, id: string) => removeEntity(id));

  $s(state).monsters.onAdd((m: any, id: string) => {
    const e = addEntity(id, "monster", createModel(m.kind, placeholders.monster, 1.7), m, "neutral");
    e.label = "Kararmış Kurt";
    $s(m).onChange(() => syncEntity(e, m, true));
  });
  $s(state).monsters.onRemove((_m: any, id: string) => removeEntity(id));

  $s(state).stones.onAdd((s: any, id: string) => {
    const e = addEntity(id, "stone", createModel("dark_meteor_stone", placeholders.stone, 4.5), s, "neutral");
    e.label = "Kara Göktaşı";
    $s(s).onChange(() => syncEntity(e, s, true));
  });
  $s(state).stones.onRemove((_s: any, id: string) => removeEntity(id));

  $s(state).minions.onAdd((m: any, id: string) => {
    const color = KINGDOMS[m.kingdom as keyof typeof KINGDOMS].color;
    const e = addEntity(id, "minion", createModel(`minion_${m.kingdom}`, () => placeholders.minion(color), 1.6), m, m.kingdom);
    e.label = `${KINGDOMS[m.kingdom as keyof typeof KINGDOMS].name} Askeri`;
    $s(m).onChange(() => syncEntity(e, m, true));
  });
  $s(state).minions.onRemove((_m: any, id: string) => removeEntity(id));

  $s(state).towers.onAdd((t: any, id: string) => {
    const color = KINGDOMS[t.kingdom as keyof typeof KINGDOMS].color;
    const e = addEntity(id, "tower", createModel(`tower_${t.kingdom}`, () => placeholders.tower(color), 9), t, t.kingdom);
    e.label = `${KINGDOMS[t.kingdom as keyof typeof KINGDOMS].name} Kulesi`;
    $s(t).onChange(() => syncEntity(e, t, false));
  });
  $s(state).towers.onRemove((_t: any, id: string) => removeEntity(id));

  room.onMessage("towerShot", ({ from, to }) => {
    const a = entities.get(from);
    const b = entities.get(to);
    if (a && b) beam(a.obj.position.clone().setY(9), b.obj.position.clone().setY(1.2), KINGDOMS[a.team as keyof typeof KINGDOMS]?.color ?? 0xffffff);
  });
  room.onMessage("towerDestroyed", ({ kingdom }) => toast(`${KINGDOMS[kingdom as keyof typeof KINGDOMS].name} kulesi yıkıldı!`));
  room.onMessage("cast", ({ id, slot, x, z }) => {
    const caster = entities.get(id);
    if (caster) caster.attackUntil = performance.now() + 700;
    const cls = (room.state as any).players.get(id)?.cls as keyof typeof ABILITIES | undefined;
    const ability = cls && ABILITIES[cls][slot as Slot];
    if (ability) castEffect(new THREE.Vector3(x, 0.1, z), ability.kind === "area" ? ability.range : 1.5);
  });
  room.onMessage("cooldown", ({ slot, until }) => (cooldownEnds[slot as Slot] = performance.now() + until));
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
  room.onMessage("respawned", () => toast("Üssünde yeniden doğdun"));
  room.onMessage("chat", ({ from, text }) => {
    const line = document.createElement("div");
    line.textContent = `${from}: ${text}`;
    $("chat-log").append(line);
    $("chat-log").scrollTop = 1e9;
  });
  room.onLeave(() => toast("Sunucu bağlantısı koptu"));
}

function addEntity(id: string, kind: Entity["kind"], obj: THREE.Object3D, src: any, team: string): Entity {
  obj.position.set(src.x, 0, src.z);
  obj.userData.entityId = id;
  scene.add(obj);
  const hpBar = createHpBar(kind);
  scene.add(hpBar);
  const e: Entity = {
    kind, team, hpBar, obj, target: obj.position.clone(), targetRot: src.rot ?? 0, label: "", hp: src.hp, maxHp: src.maxHp,
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
  if (attackId === id) attackId = "";
  scene.remove(e.hpBar);
  if (e.kind !== "monster" && e.kind !== "minion") return void scene.remove(e.obj);
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
  const key = e.key.toLowerCase();
  if ((SLOTS as readonly string[]).includes(key)) return cast(key as Slot);
  // S: dur (yürümeyi ve saldırıyı bırak).
  if (e.key.toLowerCase() === "s") {
    moveTarget = undefined;
    attackId = "";
  }
});

// Sağ tık: düşmana saldır ya da yere yürü (basılı tutunca imleci izler). Sol tık: hedefi incele.
let rightHeld = false;
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    const id = pickEnemy(e);
    if (id) selectedId = id;
  }
  if (e.button === 2) {
    rightHeld = true;
    const id = pickEnemy(e);
    if (id) {
      attackId = selectedId = id;
      moveTarget = undefined;
    } else {
      commandMove(e, true);
    }
  }
});
addEventListener("mouseup", (e) => e.button === 2 && (rightHeld = false));
addEventListener("mousemove", (e) => {
  lastMouse = e;
  if (rightHeld && !attackId) commandMove(e, false);
});
addEventListener("wheel", (e) => (camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.02, 12, 32)));

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function aim(e: MouseEvent) {
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function pickEnemy(e: MouseEvent): string | undefined {
  aim(e);
  const enemies = [...entities.entries()].filter(([id, x]) => id !== myId && x.team !== myTeam).map(([, x]) => x.obj);
  for (const hit of raycaster.intersectObjects(enemies, true)) {
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.entityId) o = o.parent;
    if (o) return o.userData.entityId;
  }
}

function commandMove(e: MouseEvent, showMarker: boolean) {
  aim(e);
  const point = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  if (!point) return;
  attackId = "";
  moveTarget = point.setY(0);
  if (showMarker) placeMoveMarker(point);
}

// Yürüme hedefinde kısa süre görünen yeşil halka.
const moveMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.8, 24),
  new THREE.MeshBasicMaterial({ color: 0x4cff6a, transparent: true }),
);
moveMarker.rotation.x = -Math.PI / 2;
moveMarker.visible = false;
scene.add(moveMarker);
function placeMoveMarker(p: THREE.Vector3) {
  moveMarker.position.set(p.x, 0.06, p.z);
  moveMarker.scale.setScalar(1);
  (moveMarker.material as THREE.MeshBasicMaterial).opacity = 1;
  moveMarker.visible = true;
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

  if (moveMarker.visible) {
    const m = moveMarker.material as THREE.MeshBasicMaterial;
    m.opacity -= dt * 2;
    moveMarker.scale.multiplyScalar(1 - dt);
    moveMarker.visible = m.opacity > 0;
  }

  for (const [id, e] of entities) updateHpBar(id, e);
  for (const e of dyingEntities) e.hpBar.visible = false;
  updateTargetRing();
  updateEffects(dt);
  updateWorld(dt);
  updateCamera(me);
  updateHud(me);
  updateAbilityBar();
  renderer.render(scene, camera);
});

function updateLocalPlayer(me: Entity, dt: number) {
  const self = (room!.state as any).players.get(myId);
  if (!self || self.hp <= 0) {
    if (self) me.obj.position.set(self.x, 0, self.z);
    return;
  }
  const target = entities.get(attackId);
  if (moveTarget) {
    const to = moveTarget.clone().sub(me.obj.position).setY(0);
    const dist = to.length();
    if (dist < 0.15) {
      moveTarget = undefined;
    } else {
      me.obj.position.addScaledVector(to.normalize(), Math.min(dist, MOVE_SPEED * dt));
      me.obj.rotation.y = Math.atan2(to.x, to.z);
    }
  } else if (target) {
    // Hedef seçiliyse ona yürü ve menzile girince saldır.
    const to = target.obj.position.clone().sub(me.obj.position).setY(0);
    const range = ATTACK_RANGE + reach(target) - 0.3;
    me.obj.rotation.y = Math.atan2(to.x, to.z);
    if (to.length() > range) {
      me.obj.position.addScaledVector(to.normalize(), MOVE_SPEED * dt);
    } else if (performance.now() - lastAttackAt > 500) {
      lastAttackAt = performance.now();
      room!.send("attack", { targetId: attackId });
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
    focus.x,
    focus.y + Math.sin(CAM_PITCH) * camDist,
    focus.z + Math.cos(CAM_PITCH) * camDist,
  );
  camera.lookAt(focus.x, focus.y, focus.z);
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

// --- Savaş: hedef halkası, can çubukları, yetenekler, efektler ---

let myTeam = "";
let myClass: keyof typeof ABILITIES = "warrior";
let lastMouse: MouseEvent | undefined;
const cooldownEnds: Partial<Record<Slot, number>> = {};

function reach(e: Entity) {
  return e.kind === "stone" ? 1.5 : e.kind === "tower" ? 2 : 0;
}

const BAR_SIZE: Record<Entity["kind"], [width: number, height: number]> = {
  player: [1.8, 3.2],
  monster: [1.3, 2.4],
  minion: [1.1, 2.3],
  tower: [3.2, 11],
  stone: [2.6, 6.5],
};

function createHpBar(kind: Entity["kind"]) {
  const [w] = BAR_SIZE[kind];
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, 0.26), new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.18), new THREE.MeshBasicMaterial({ color: 0x3fbf4a, depthTest: false }));
  fill.position.z = 0.01;
  // Dolgu soldan kısalsın diye geometriyi sola yasla.
  fill.geometry.translate(w / 2, 0, 0);
  fill.position.x = -w / 2;
  bg.renderOrder = 998;
  fill.renderOrder = 999;
  g.add(bg, fill);
  return g;
}

function updateHpBar(id: string, e: Entity) {
  const [, h] = BAR_SIZE[e.kind];
  e.hpBar.position.copy(e.obj.position).setY(h);
  e.hpBar.quaternion.copy(camera.quaternion);
  e.hpBar.visible = e.hp > 0;
  const fill = e.hpBar.children[1] as THREE.Mesh;
  fill.scale.x = Math.max(0.001, e.hp / e.maxHp);
  // LoL renkleri: sen yeşil, dostlar mavi, düşmanlar kırmızı, tarafsızlar turuncu.
  const color = id === myId ? 0x3fbf4a : e.team === "neutral" ? 0xe0902a : e.team === myTeam ? 0x3a8ee6 : 0xd8402f;
  (fill.material as THREE.MeshBasicMaterial).color.setHex(color);
}

const targetRing = new THREE.Mesh(
  new THREE.RingGeometry(1, 1.2, 32),
  new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.8 }),
);
targetRing.rotation.x = -Math.PI / 2;
scene.add(targetRing);
function updateTargetRing() {
  const t = entities.get(attackId) ?? entities.get(selectedId);
  targetRing.visible = !!t;
  if (!t) return;
  targetRing.position.set(t.obj.position.x, 0.07, t.obj.position.z);
  targetRing.scale.setScalar(t.kind === "tower" ? 2.5 : t.kind === "stone" ? 2.2 : 1);
}

function cast(slot: Slot) {
  const me = entities.get(myId);
  if (!room || !me || me.hp <= 0) return;
  if ((cooldownEnds[slot] ?? 0) > performance.now()) return;
  const ability = ABILITIES[myClass][slot];
  if (ability.kind === "target" || ability.kind === "blink") {
    // Hedef: imlecin altındaki düşman, yoksa saldırılan/seçili hedef.
    const id = (lastMouse && pickEnemy(lastMouse)) || attackId || selectedId;
    const t = entities.get(id);
    if (!t || t.team === myTeam) return toast("Önce bir düşman seç");
    const d = t.obj.position.distanceTo(me.obj.position) - reach(t);
    if (d > ability.range) return toast("Hedef çok uzakta");
    room.send("cast", { slot, targetId: id });
  } else if (ability.kind === "dash") {
    if (!lastMouse) return;
    aim(lastMouse);
    const p = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    if (!p) return;
    moveTarget = undefined;
    room.send("cast", { slot, x: p.x, z: p.z });
  } else {
    room.send("cast", { slot });
  }
}

function buildAbilityBar() {
  const bar = $("abilities");
  bar.replaceChildren();
  for (const slot of SLOTS) {
    const a = ABILITIES[myClass][slot];
    const el = document.createElement("div");
    el.className = "ability";
    el.id = `ability-${slot}`;
    el.title = a.name;
    el.innerHTML = `<span class="key">${slot.toUpperCase()}</span><span class="name"></span><div class="cd"></div><span class="cd-text"></span>`;
    el.querySelector(".name")!.textContent = a.name;
    el.addEventListener("click", () => cast(slot));
    bar.append(el);
  }
}

function updateAbilityBar() {
  const now = performance.now();
  for (const slot of SLOTS) {
    const el = document.getElementById(`ability-${slot}`);
    if (!el) continue;
    const left = Math.max(0, (cooldownEnds[slot] ?? 0) - now);
    const total = ABILITIES[myClass][slot].cooldownMs;
    (el.querySelector(".cd") as HTMLElement).style.height = `${(left / total) * 100}%`;
    el.querySelector(".cd-text")!.textContent = left > 0 ? String(Math.ceil(left / 1000)) : "";
  }
}

// Kısa ömürlü efektler: kule ışını ve yetenek halkası.
const effects: { obj: THREE.Mesh | THREE.Line; life: number; grow?: number }[] = [];

function beam(from: THREE.Vector3, to: THREE.Vector3, color: number) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({ color, transparent: true }),
  );
  scene.add(line);
  effects.push({ obj: line, life: 0.25 });
}

function castEffect(at: THREE.Vector3, radius: number) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(at);
  ring.scale.setScalar(radius * 0.3);
  scene.add(ring);
  effects.push({ obj: ring, life: 0.5, grow: radius });
}

function updateEffects(dt: number) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.life -= dt;
    const mat = fx.obj.material as THREE.Material;
    mat.opacity = Math.max(0, fx.life * 3);
    if (fx.grow) fx.obj.scale.setScalar(THREE.MathUtils.lerp(fx.obj.scale.x, fx.grow, dt * 10));
    if (fx.life <= 0) {
      scene.remove(fx.obj);
      fx.obj.geometry.dispose();
      effects.splice(i, 1);
    }
  }
}

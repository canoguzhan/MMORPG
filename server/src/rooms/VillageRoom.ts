import { Client, Room } from "colyseus";
import { JUNGLE_CAMPS, KINGDOMS, KingdomId, LANES, TOWERS, Vec2 } from "../../../shared/map.js";
import { Minion, Monster, Player, Stone, Tower, WorldState } from "./schema.js";
import {
  ABILITIES,
  ATTACK_COOLDOWN_MS,
  ATTACK_RANGE,
  CLASSES,
  ClassId,
  clampToMap,
  dashEnd,
  distance,
  grantExp,
  isClassId,
  isSlot,
  limitMove,
  rollDamage,
  Slot,
} from "./rules.js";

const TICK_MS = 50; // 20 Hz
const MAX_STONES = 4;
const STONE_SPAWN_EVERY_MS = 20_000;
const STONE_SUMMON_EVERY_MS = 8_000;
const MAX_MONSTERS_PER_STONE = 4;
const MONSTER_SPEED = 4;
const MONSTER_AGGRO_RANGE = 15;
const MONSTER_ATTACK_RANGE = 2;
const MONSTER_ATTACK_COOLDOWN_MS = 1200;
const MONSTER_DAMAGE = 6;
const RESPAWN_MS = 5000;

const WAVE_EVERY_MS = 30_000;
const MINIONS_PER_WAVE = 3;
const MINION_SPEED = 3.5;
const MINION_AGGRO_RANGE = 9;
const MINION_ATTACK_RANGE = 2;
const MINION_ATTACK_COOLDOWN_MS = 1000;
const MINION_DAMAGE = 8;

const TOWER_RANGE = 12;
const TOWER_ATTACK_COOLDOWN_MS = 1200;
const TOWER_DAMAGE = 35;

type Team = KingdomId | "neutral";
type UnitKind = "player" | "monster" | "stone" | "minion" | "tower";
type Unit = Player | Monster | Stone | Minion | Tower;
interface Ref {
  id: string;
  kind: UnitKind;
  unit: Unit;
  team: Team;
}

interface PlayerMeta {
  lastMoveAt: number;
  lastAttackAt: number;
  cooldowns: Partial<Record<Slot, number>>;
}

interface MonsterMeta {
  stoneId: string;
  lastAttackAt: number;
}

interface MinionMeta {
  path: Vec2[];
  waypoint: number;
  lastAttackAt: number;
}

const isKingdom = (v: unknown): v is KingdomId => typeof v === "string" && v in KINGDOMS;
const enemyOf = (k: KingdomId): KingdomId => (k === "kizilbayir" ? "gokdeniz" : "kizilbayir");

export class VillageRoom extends Room<WorldState> {
  maxClients = 50;
  state = new WorldState();

  private nextId = 1;
  private lastStoneSpawnAt = 0;
  private lastWaveAt = -WAVE_EVERY_MS + 5_000; // ilk dalga açılıştan 5 sn sonra
  private playerMeta = new Map<string, PlayerMeta>();
  private monsterMeta = new Map<string, MonsterMeta>();
  private stoneMeta = new Map<string, { lastSummonAt: number }>();
  private minionMeta = new Map<string, MinionMeta>();
  private towerMeta = new Map<string, { lastAttackAt: number }>();

  onCreate() {
    TOWERS.forEach((t, i) => {
      const tower = new Tower();
      tower.kingdom = t.kingdom;
      [tower.x, tower.z] = t.pos;
      const id = `tower_${i}`;
      this.state.towers.set(id, tower);
      this.towerMeta.set(id, { lastAttackAt: 0 });
    });

    this.onMessage("move", (client, msg: { x: number; z: number; rot: number }) => {
      const p = this.state.players.get(client.sessionId);
      const meta = this.playerMeta.get(client.sessionId);
      if (!p || !meta || p.hp <= 0) return;
      if (![msg?.x, msg?.z, msg?.rot].every(Number.isFinite)) return;
      const now = Date.now();
      const pos = limitMove(p.x, p.z, msg.x, msg.z, now - meta.lastMoveAt);
      meta.lastMoveAt = now;
      p.x = pos.x;
      p.z = pos.z;
      p.rot = msg.rot;
    });

    this.onMessage("attack", (client, msg: { targetId: string }) => {
      this.handleAttack(client.sessionId, String(msg?.targetId ?? ""));
    });

    this.onMessage("cast", (client, msg: { slot: string; targetId?: string; x?: number; z?: number }) => {
      if (isSlot(msg?.slot)) this.handleCast(client.sessionId, msg.slot, msg);
    });

    this.onMessage("chat", (client, msg: { text: string }) => {
      const p = this.state.players.get(client.sessionId);
      const text = String(msg?.text ?? "").trim().slice(0, 200);
      if (!p || !text) return;
      this.broadcast("chat", { from: p.name, text });
    });

    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  onJoin(client: Client, options: { name?: string; cls?: string; kingdom?: string }) {
    const p = new Player();
    p.name = String(options?.name ?? "").trim().slice(0, 16) || `Yolcu${this.nextId++}`;
    p.cls = isClassId(options?.cls) ? options.cls : "warrior";
    p.kingdom = isKingdom(options?.kingdom) ? options.kingdom : "kizilbayir";
    p.maxHp = CLASSES[p.cls as ClassId].maxHp;
    p.hp = p.maxHp;
    this.placeAtBase(p);
    this.state.players.set(client.sessionId, p);
    this.playerMeta.set(client.sessionId, { lastMoveAt: Date.now(), lastAttackAt: 0, cooldowns: {} });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.playerMeta.delete(client.sessionId);
  }

  // --- Birimler ---

  private find(id: string): Ref | undefined {
    const player = this.state.players.get(id);
    if (player) return { id, kind: "player", unit: player, team: player.kingdom as KingdomId };
    const minion = this.state.minions.get(id);
    if (minion) return { id, kind: "minion", unit: minion, team: minion.kingdom as KingdomId };
    const tower = this.state.towers.get(id);
    if (tower) return { id, kind: "tower", unit: tower, team: tower.kingdom as KingdomId };
    const monster = this.state.monsters.get(id);
    if (monster) return { id, kind: "monster", unit: monster, team: "neutral" };
    const stone = this.state.stones.get(id);
    if (stone) return { id, kind: "stone", unit: stone, team: "neutral" };
  }

  /** Oyuncunun vurabileceği birimler: tarafsızlar ve karşı krallık. */
  private hostileToPlayer(p: Player, target: Ref) {
    return target.unit.hp > 0 && target.team !== p.kingdom;
  }

  /** Vuruş menzili: büyük birimlerin gövdesi de hesaba katılır. */
  private reach(kind: UnitKind) {
    return kind === "stone" ? 1.5 : kind === "tower" ? 2 : 0;
  }

  private placeAtBase(p: Player) {
    // Üssün ortasında kristal anıt durduğu için oyuncu biraz vadiye doğru doğar.
    const [x, z] = KINGDOMS[p.kingdom as KingdomId].base;
    const k = 1 - 7 / Math.hypot(x, z);
    p.x = x * k + (Math.random() - 0.5) * 4;
    p.z = z * k + (Math.random() - 0.5) * 4;
  }

  // --- Oyuncu eylemleri ---

  private handleAttack(sessionId: string, targetId: string) {
    const p = this.state.players.get(sessionId);
    const meta = this.playerMeta.get(sessionId);
    const target = this.find(targetId);
    if (!p || !meta || p.hp <= 0 || !target || !this.hostileToPlayer(p, target)) return;
    const now = Date.now();
    if (now - meta.lastAttackAt < ATTACK_COOLDOWN_MS) return;
    if (distance(p.x, p.z, target.unit.x, target.unit.z) > ATTACK_RANGE + this.reach(target.kind)) return;
    meta.lastAttackAt = now;
    this.damage(sessionId, target, rollDamage(p.cls as ClassId, p.level));
  }

  private handleCast(sessionId: string, slot: Slot, msg: { targetId?: string; x?: number; z?: number }) {
    const p = this.state.players.get(sessionId);
    const meta = this.playerMeta.get(sessionId);
    if (!p || !meta || p.hp <= 0) return;
    const ability = ABILITIES[p.cls as ClassId][slot];
    const now = Date.now();
    if ((meta.cooldowns[slot] ?? 0) > now) return;
    const hit = () => Math.round(rollDamage(p.cls as ClassId, p.level) * ability.power);

    if (ability.kind === "target" || ability.kind === "blink") {
      const target = this.find(String(msg.targetId ?? ""));
      if (!target || !this.hostileToPlayer(p, target)) return;
      if (distance(p.x, p.z, target.unit.x, target.unit.z) > ability.range + this.reach(target.kind)) return;
      if (ability.kind === "blink") {
        // Hedefin arkasına geç: hedeften oyuncuya doğru olan yönün tersine bir adım.
        const angle = Math.atan2(target.unit.x - p.x, target.unit.z - p.z);
        p.x = clampToMap(target.unit.x + Math.sin(angle) * 1.5);
        p.z = clampToMap(target.unit.z + Math.cos(angle) * 1.5);
        p.rot = angle + Math.PI;
        meta.lastMoveAt = now;
      }
      this.damage(sessionId, target, hit());
    } else if (ability.kind === "self") {
      p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * (ability.heal ?? 0)));
    } else if (ability.kind === "dash") {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
      const end = dashEnd(p.x, p.z, msg.x!, msg.z!, ability.range);
      p.rot = Math.atan2(end.x - p.x, end.z - p.z);
      p.x = end.x;
      p.z = end.z;
      meta.lastMoveAt = now;
      // Varış noktasındaki ilk düşmana çarp.
      const victim = this.nearestHostile(p.x, p.z, 3, (r) => this.hostileToPlayer(p, r));
      if (victim) this.damage(sessionId, victim, hit());
    } else if (ability.kind === "area") {
      for (const r of this.allUnits()) {
        if (!this.hostileToPlayer(p, r)) continue;
        if (distance(p.x, p.z, r.unit.x, r.unit.z) <= ability.range + this.reach(r.kind)) this.damage(sessionId, r, hit());
      }
    }

    meta.cooldowns[slot] = now + ability.cooldownMs;
    this.broadcast("cast", { id: sessionId, slot, x: p.x, z: p.z });
    this.clients.find((c) => c.sessionId === sessionId)?.send("cooldown", { slot, until: ability.cooldownMs });
  }

  private *allUnits(): Generator<Ref> {
    for (const id of [
      ...this.state.players.keys(),
      ...this.state.minions.keys(),
      ...this.state.towers.keys(),
      ...this.state.monsters.keys(),
      ...this.state.stones.keys(),
    ]) {
      const r = this.find(id);
      if (r) yield r;
    }
  }

  private nearestHostile(x: number, z: number, range: number, hostile: (r: Ref) => boolean, kinds?: UnitKind[]) {
    let best: Ref | undefined;
    let bestDist = Infinity;
    for (const r of this.allUnits()) {
      if (kinds && !kinds.includes(r.kind)) continue;
      if (!hostile(r)) continue;
      const d = distance(x, z, r.unit.x, r.unit.z) - this.reach(r.kind);
      if (d <= range && d < bestDist) [best, bestDist] = [r, d];
    }
    return best;
  }

  // --- Hasar ve ödüller ---

  private damage(attackerId: string, target: Ref, dmg: number) {
    if (target.unit.hp <= 0) return;
    target.unit.hp = Math.max(0, target.unit.hp - dmg);
    this.broadcast("hit", { targetId: target.id, dmg, by: attackerId });
    if (target.unit.hp > 0) return;

    switch (target.kind) {
      case "player":
        this.respawnLater(target.id);
        break;
      case "monster":
        this.state.monsters.delete(target.id);
        this.monsterMeta.delete(target.id);
        break;
      case "stone":
        this.state.stones.delete(target.id);
        this.stoneMeta.delete(target.id);
        break;
      case "minion":
        this.state.minions.delete(target.id);
        this.minionMeta.delete(target.id);
        break;
      case "tower":
        this.state.towers.delete(target.id);
        this.towerMeta.delete(target.id);
        this.broadcast("towerDestroyed", { id: target.id, kingdom: target.team });
        break;
    }

    const killer = this.state.players.get(attackerId);
    if (!killer) return;
    const [exp, gold] = {
      player: [80, 60],
      monster: [25, 5],
      stone: [120, 75],
      minion: [20, 12],
      tower: [150, 150],
    }[target.kind];
    killer.gold += gold;
    if (grantExp(killer, exp) > 0) {
      killer.maxHp = CLASSES[killer.cls as ClassId].maxHp + (killer.level - 1) * 15;
      killer.hp = killer.maxHp;
      this.broadcast("levelUp", { id: attackerId, level: killer.level });
    }
  }

  private respawnLater(sessionId: string) {
    this.clock.setTimeout(() => {
      const p = this.state.players.get(sessionId);
      if (!p) return;
      this.placeAtBase(p);
      p.hp = p.maxHp;
      const meta = this.playerMeta.get(sessionId);
      if (meta) meta.lastMoveAt = Date.now();
      this.clients.find((c) => c.sessionId === sessionId)?.send("respawned", {});
    }, RESPAWN_MS);
  }

  // --- Dünya döngüsü ---

  private tick() {
    const now = Date.now();
    const dt = TICK_MS / 1000;

    if (this.state.stones.size < MAX_STONES && now - this.lastStoneSpawnAt > STONE_SPAWN_EVERY_MS) {
      this.lastStoneSpawnAt = now;
      this.spawnStone();
    }
    if (now - this.lastWaveAt > WAVE_EVERY_MS) {
      this.lastWaveAt = now;
      this.spawnWave();
    }

    this.state.stones.forEach((stone, stoneId) => {
      const meta = this.stoneMeta.get(stoneId)!;
      if (now - meta.lastSummonAt < STONE_SUMMON_EVERY_MS) return;
      meta.lastSummonAt = now;
      let count = 0;
      this.monsterMeta.forEach((m) => m.stoneId === stoneId && count++);
      if (count < MAX_MONSTERS_PER_STONE) this.spawnMonster(stoneId, stone);
    });

    this.state.monsters.forEach((m, id) => this.tickMonster(id, m, now, dt));
    this.state.minions.forEach((m, id) => this.tickMinion(id, m, now, dt));
    this.state.towers.forEach((t, id) => this.tickTower(id, t, now));
  }

  private tickMonster(id: string, m: Monster, now: number, dt: number) {
    const meta = this.monsterMeta.get(id)!;
    const target = this.nearestHostile(m.x, m.z, MONSTER_AGGRO_RANGE, (r) => r.unit.hp > 0, ["player"]);
    if (!target) return;
    const d = distance(m.x, m.z, target.unit.x, target.unit.z);
    m.rot = Math.atan2(target.unit.x - m.x, target.unit.z - m.z);
    if (d > MONSTER_ATTACK_RANGE) {
      const step = Math.min(MONSTER_SPEED * dt, d - MONSTER_ATTACK_RANGE * 0.8);
      m.x += Math.sin(m.rot) * step;
      m.z += Math.cos(m.rot) * step;
    } else if (now - meta.lastAttackAt > MONSTER_ATTACK_COOLDOWN_MS) {
      meta.lastAttackAt = now;
      this.damage(id, target, MONSTER_DAMAGE);
    }
  }

  private tickMinion(id: string, m: Minion, now: number, dt: number) {
    const meta = this.minionMeta.get(id)!;
    const enemy = enemyOf(m.kingdom as KingdomId);
    // Önce karşı askerlere ve kulelere, yoksa karşı oyunculara saldır.
    const target =
      this.nearestHostile(m.x, m.z, MINION_AGGRO_RANGE, (r) => r.team === enemy && r.unit.hp > 0, ["minion", "tower"]) ??
      this.nearestHostile(m.x, m.z, MINION_AGGRO_RANGE, (r) => r.team === enemy && r.unit.hp > 0, ["player"]);

    let goal: Vec2;
    if (target) {
      const d = distance(m.x, m.z, target.unit.x, target.unit.z) - this.reach(target.kind);
      m.rot = Math.atan2(target.unit.x - m.x, target.unit.z - m.z);
      if (d <= MINION_ATTACK_RANGE) {
        if (now - meta.lastAttackAt > MINION_ATTACK_COOLDOWN_MS) {
          meta.lastAttackAt = now;
          this.damage(id, target, MINION_DAMAGE);
        }
        return;
      }
      goal = [target.unit.x, target.unit.z];
    } else {
      goal = meta.path[meta.waypoint];
      if (distance(m.x, m.z, goal[0], goal[1]) < 1.5) {
        if (meta.waypoint === meta.path.length - 1) {
          // Karşı üsse varan asker dağılır (üs yıkımı sonraki adımda gelecek).
          this.state.minions.delete(id);
          this.minionMeta.delete(id);
          return;
        }
        meta.waypoint++;
        goal = meta.path[meta.waypoint];
      }
    }
    m.rot = Math.atan2(goal[0] - m.x, goal[1] - m.z);
    m.x += Math.sin(m.rot) * MINION_SPEED * dt;
    m.z += Math.cos(m.rot) * MINION_SPEED * dt;
  }

  private tickTower(id: string, t: Tower, now: number) {
    const meta = this.towerMeta.get(id)!;
    if (now - meta.lastAttackAt < TOWER_ATTACK_COOLDOWN_MS) return;
    const enemy = enemyOf(t.kingdom as KingdomId);
    // Kule önce askerlere, sonra oyunculara ateş eder.
    const target =
      this.nearestHostile(t.x, t.z, TOWER_RANGE, (r) => r.team === enemy && r.unit.hp > 0, ["minion"]) ??
      this.nearestHostile(t.x, t.z, TOWER_RANGE, (r) => r.team === enemy && r.unit.hp > 0, ["player"]);
    if (!target) return;
    meta.lastAttackAt = now;
    this.broadcast("towerShot", { from: id, to: target.id });
    this.damage(id, target, TOWER_DAMAGE);
  }

  // --- Doğurma ---

  private spawnWave() {
    for (const kingdom of Object.keys(KINGDOMS) as KingdomId[]) {
      for (const lane of Object.values(LANES)) {
        // Koridor yolları Kızılbayır'dan Gökdeniz'e çizilmiştir; Gökdeniz askerleri tersten yürür.
        const path = kingdom === "kizilbayir" ? lane : [...lane].reverse();
        for (let i = 0; i < MINIONS_PER_WAVE; i++) {
          const m = new Minion();
          m.kingdom = kingdom;
          m.x = path[0][0] + (Math.random() - 0.5) * 3;
          m.z = path[0][1] + (Math.random() - 0.5) * 3;
          const id = `minion_${this.nextId++}`;
          this.state.minions.set(id, m);
          this.minionMeta.set(id, { path, waypoint: 1, lastAttackAt: 0 });
        }
      }
    }
  }

  private spawnStone() {
    // Taşlar boş bir orman kampına düşer.
    const taken = [...this.state.stones.values()];
    const free = JUNGLE_CAMPS.filter(([x, z]) => !taken.some((t) => t.x === x && t.z === z));
    if (!free.length) return;
    const [x, z] = free[Math.floor(Math.random() * free.length)];
    const s = new Stone();
    s.x = x;
    s.z = z;
    const id = `stone_${this.nextId++}`;
    this.state.stones.set(id, s);
    this.stoneMeta.set(id, { lastSummonAt: 0 });
    this.broadcast("stoneFell", { id, x: s.x, z: s.z });
  }

  private spawnMonster(stoneId: string, stone: Stone) {
    const m = new Monster();
    const angle = Math.random() * Math.PI * 2;
    m.x = clampToMap(stone.x + Math.cos(angle) * 4);
    m.z = clampToMap(stone.z + Math.sin(angle) * 4);
    const id = `mob_${this.nextId++}`;
    this.state.monsters.set(id, m);
    this.monsterMeta.set(id, { stoneId, lastAttackAt: 0 });
  }
}

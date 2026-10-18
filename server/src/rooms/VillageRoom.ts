import { Client, Room } from "colyseus";
import { Monster, Player, Stone, WorldState } from "./schema.js";
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_RANGE,
  CLASSES,
  clampToMap,
  distance,
  grantExp,
  isClassId,
  limitMove,
  MAP_HALF_SIZE,
  rollDamage,
} from "./rules.js";

const TICK_MS = 50; // 20 Hz
const MAX_STONES = 3;
const STONE_SPAWN_EVERY_MS = 20_000;
const STONE_SUMMON_EVERY_MS = 8_000;
const MAX_MONSTERS_PER_STONE = 4;
const MONSTER_SPEED = 4;
const MONSTER_AGGRO_RANGE = 15;
const MONSTER_ATTACK_RANGE = 2;
const MONSTER_ATTACK_COOLDOWN_MS = 1200;
const MONSTER_DAMAGE = 6;
const VILLAGE_SAFE_RADIUS = 20;

interface PlayerMeta {
  lastMoveAt: number;
  lastAttackAt: number;
}

interface MonsterMeta {
  stoneId: string;
  lastAttackAt: number;
}

interface StoneMeta {
  lastSummonAt: number;
}

export class VillageRoom extends Room<WorldState> {
  maxClients = 50;
  state = new WorldState();

  private nextId = 1;
  private lastStoneSpawnAt = 0;
  private playerMeta = new Map<string, PlayerMeta>();
  private monsterMeta = new Map<string, MonsterMeta>();
  private stoneMeta = new Map<string, StoneMeta>();

  onCreate() {
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
      this.handleAttack(client, String(msg?.targetId ?? ""));
    });

    this.onMessage("chat", (client, msg: { text: string }) => {
      const p = this.state.players.get(client.sessionId);
      const text = String(msg?.text ?? "").trim().slice(0, 200);
      if (!p || !text) return;
      this.broadcast("chat", { from: p.name, text });
    });

    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  onJoin(client: Client, options: { name?: string; cls?: string }) {
    const p = new Player();
    p.name = String(options?.name ?? "").trim().slice(0, 16) || `Yolcu${this.nextId++}`;
    p.cls = isClassId(options?.cls) ? options.cls : "warrior";
    p.maxHp = CLASSES[p.cls as keyof typeof CLASSES].maxHp;
    p.hp = p.maxHp;
    p.x = (Math.random() - 0.5) * 6;
    p.z = (Math.random() - 0.5) * 6;
    this.state.players.set(client.sessionId, p);
    this.playerMeta.set(client.sessionId, { lastMoveAt: Date.now(), lastAttackAt: 0 });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.playerMeta.delete(client.sessionId);
  }

  private handleAttack(client: Client, targetId: string) {
    const p = this.state.players.get(client.sessionId);
    const meta = this.playerMeta.get(client.sessionId);
    if (!p || !meta || p.hp <= 0) return;
    const now = Date.now();
    if (now - meta.lastAttackAt < ATTACK_COOLDOWN_MS) return;

    const target = this.state.monsters.get(targetId) ?? this.state.stones.get(targetId);
    if (!target || distance(p.x, p.z, target.x, target.z) > ATTACK_RANGE + (target instanceof Stone ? 1.5 : 0)) {
      return;
    }
    meta.lastAttackAt = now;

    const dmg = rollDamage(p.cls as keyof typeof CLASSES, p.level);
    target.hp = Math.max(0, target.hp - dmg);
    this.broadcast("hit", { targetId, dmg, by: client.sessionId });
    if (target.hp > 0) return;

    const isStone = target instanceof Stone;
    if (isStone) this.destroyStone(targetId);
    else this.killMonster(targetId);

    const levels = grantExp(p, isStone ? 120 : 25);
    p.gold += isStone ? 50 + Math.floor(Math.random() * 50) : 5;
    if (levels > 0) {
      const cls = CLASSES[p.cls as keyof typeof CLASSES];
      p.maxHp = cls.maxHp + (p.level - 1) * 15;
      p.hp = p.maxHp;
      this.broadcast("levelUp", { id: client.sessionId, level: p.level });
    }
  }

  private destroyStone(id: string) {
    this.state.stones.delete(id);
    this.stoneMeta.delete(id);
  }

  private killMonster(id: string) {
    this.state.monsters.delete(id);
    this.monsterMeta.delete(id);
  }

  private tick() {
    const now = Date.now();
    const dt = TICK_MS / 1000;

    if (this.state.stones.size < MAX_STONES && now - this.lastStoneSpawnAt > STONE_SPAWN_EVERY_MS) {
      this.lastStoneSpawnAt = now;
      this.spawnStone();
    }

    this.state.stones.forEach((stone, stoneId) => {
      const meta = this.stoneMeta.get(stoneId)!;
      if (now - meta.lastSummonAt < STONE_SUMMON_EVERY_MS) return;
      meta.lastSummonAt = now;
      let count = 0;
      this.monsterMeta.forEach((m) => m.stoneId === stoneId && count++);
      if (count < MAX_MONSTERS_PER_STONE) this.spawnMonster(stoneId, stone);
    });

    this.state.monsters.forEach((m, monsterId) => {
      const meta = this.monsterMeta.get(monsterId)!;
      const target = this.nearestLivingPlayer(m.x, m.z);
      if (!target || target.dist > MONSTER_AGGRO_RANGE) return;
      const p = target.player;
      m.rot = Math.atan2(p.x - m.x, p.z - m.z);
      if (target.dist > MONSTER_ATTACK_RANGE) {
        const step = Math.min(MONSTER_SPEED * dt, target.dist - MONSTER_ATTACK_RANGE * 0.8);
        m.x += Math.sin(m.rot) * step;
        m.z += Math.cos(m.rot) * step;
      } else if (now - meta.lastAttackAt > MONSTER_ATTACK_COOLDOWN_MS) {
        meta.lastAttackAt = now;
        p.hp = Math.max(0, p.hp - MONSTER_DAMAGE);
        this.broadcast("hit", { targetId: target.id, dmg: MONSTER_DAMAGE, by: monsterId });
        if (p.hp === 0) this.respawnLater(target.id);
      }
    });
  }

  private nearestLivingPlayer(x: number, z: number) {
    let best: { id: string; player: Player; dist: number } | undefined;
    this.state.players.forEach((player, id) => {
      if (player.hp <= 0) return;
      const dist = distance(x, z, player.x, player.z);
      if (!best || dist < best.dist) best = { id, player, dist };
    });
    return best;
  }

  private respawnLater(sessionId: string) {
    this.clock.setTimeout(() => {
      const p = this.state.players.get(sessionId);
      if (!p) return;
      p.x = 0;
      p.z = 0;
      p.hp = p.maxHp;
      this.sendTo(sessionId, "respawned");
    }, 3000);
  }

  private sendTo(sessionId: string, type: string) {
    this.clients.find((c) => c.sessionId === sessionId)?.send(type, {});
  }

  private spawnStone() {
    // Taşlar köyün güvenli alanının dışına düşer.
    const angle = Math.random() * Math.PI * 2;
    const r = VILLAGE_SAFE_RADIUS + 10 + Math.random() * (MAP_HALF_SIZE - VILLAGE_SAFE_RADIUS - 20);
    const s = new Stone();
    s.x = clampToMap(Math.cos(angle) * r);
    s.z = clampToMap(Math.sin(angle) * r);
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

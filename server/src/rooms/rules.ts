// Saf oyun kuralları: odadan bağımsız, test edilebilir.

export const MAP_HALF_SIZE = 100;
export const PLAYER_SPEED = 8; // birim/sn
export const ATTACK_RANGE = 3;
export const ATTACK_COOLDOWN_MS = 500;

export const CLASSES = {
  warrior: { maxHp: 140, damage: [14, 20] },
  shadow: { maxHp: 100, damage: [12, 24] },
} as const;
export type ClassId = keyof typeof CLASSES;

export function isClassId(value: unknown): value is ClassId {
  return typeof value === "string" && value in CLASSES;
}

export function expToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function clampToMap(v: number): number {
  return Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, v));
}

export function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * İstemcinin bildirdiği konumu, son konumdan bu yana geçen süreye göre
 * izin verilen en uzak noktaya kırpar (basit hız hilesi koruması).
 */
export function limitMove(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  elapsedMs: number,
): { x: number; z: number } {
  const maxStep = PLAYER_SPEED * (elapsedMs / 1000) * 1.2 + 0.1;
  const d = distance(fromX, fromZ, toX, toZ);
  if (d <= maxStep) return { x: clampToMap(toX), z: clampToMap(toZ) };
  const k = maxStep / d;
  return {
    x: clampToMap(fromX + (toX - fromX) * k),
    z: clampToMap(fromZ + (toZ - fromZ) * k),
  };
}

/**
 * Deneyim ekler, gerekirse seviye atlatır.
 * Dönen değer kaç seviye atlandığıdır.
 */
export function grantExp(p: { level: number; exp: number }, amount: number): number {
  let gained = 0;
  p.exp += amount;
  while (p.exp >= expToNextLevel(p.level)) {
    p.exp -= expToNextLevel(p.level);
    p.level += 1;
    gained += 1;
  }
  return gained;
}

export function rollDamage(cls: ClassId, level: number, rand = Math.random): number {
  const [min, max] = CLASSES[cls].damage;
  return Math.round((min + rand() * (max - min)) * (1 + (level - 1) * 0.1));
}

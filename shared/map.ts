// Vadi haritası: sunucu ve istemcinin ortak kullandığı yerleşim.
// Üç koridorlu, ortasından çapraz nehir geçen, koridorlar arası ormanlık bir vadi.
// İki krallığın üssü karşılıklı köşelerdedir. Ekranda kuzey -z yönüdür.

export type Vec2 = [x: number, z: number];

export const MAP_HALF_SIZE = 100;
export const LANE_WIDTH = 12;
export const RIVER_WIDTH = 10;
export const BASE_RADIUS = 18;

export const KINGDOMS = {
  kizilbayir: { name: "Kızılbayır", base: [-80, 80] as Vec2, color: 0xc0392b },
  gokdeniz: { name: "Gökdeniz", base: [80, -80] as Vec2, color: 0x2e6fb5 },
} as const;
export type KingdomId = keyof typeof KINGDOMS;

/** Koridorlar bir üssten diğerine giden kırık çizgilerdir. */
export const LANES: Record<"top" | "mid" | "bot", Vec2[]> = {
  top: [[-80, 80], [-84, 60], [-84, -84], [60, -84], [80, -80]],
  mid: [[-80, 80], [80, -80]],
  bot: [[-80, 80], [-60, 84], [84, 84], [84, -60], [80, -80]],
};

/** Nehir, orta koridoru dik keserek sol üstten sağ alta akar. */
export const RIVER: Vec2[] = [[-100, -100], [100, 100]];

/** Orman kampları: Kara Göktaşlarının düşebildiği yerler. */
export const JUNGLE_CAMPS: Vec2[] = [
  [-52, 8], [-30, 40], [-8, 52], // Kızılbayır ormanı
  [52, -8], [30, -40], [8, -52], // Gökdeniz ormanı
  [-40, -40], [40, 40], // nehir kıyısı
];

/** Kuleler: her krallığın her koridorunda iki kule (dış ve iç). */
export const TOWERS: { kingdom: KingdomId; lane: keyof typeof LANES; pos: Vec2 }[] = [
  { kingdom: "kizilbayir", lane: "top", pos: [-84, 20] },
  { kingdom: "kizilbayir", lane: "top", pos: [-84, 52] },
  { kingdom: "kizilbayir", lane: "mid", pos: [-22, 22] },
  { kingdom: "kizilbayir", lane: "mid", pos: [-50, 50] },
  { kingdom: "kizilbayir", lane: "bot", pos: [-20, 84] },
  { kingdom: "kizilbayir", lane: "bot", pos: [-52, 84] },
  { kingdom: "gokdeniz", lane: "top", pos: [20, -84] },
  { kingdom: "gokdeniz", lane: "top", pos: [52, -84] },
  { kingdom: "gokdeniz", lane: "mid", pos: [22, -22] },
  { kingdom: "gokdeniz", lane: "mid", pos: [50, -50] },
  { kingdom: "gokdeniz", lane: "bot", pos: [84, -20] },
  { kingdom: "gokdeniz", lane: "bot", pos: [84, -52] },
];

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const [px, pz] = p;
  const [ax, az] = a;
  const [bx, bz] = b;
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function distanceToPath(p: Vec2, path: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) best = Math.min(best, distanceToSegment(p, path[i], path[i + 1]));
  return best;
}

/** Nokta açık alanda mı (koridor, nehir, üs ya da kamp)? Ağaçlar yalnızca kapalı alana dikilir. */
export function isOpenGround(p: Vec2): boolean {
  if (Object.values(LANES).some((lane) => distanceToPath(p, lane) < LANE_WIDTH / 2 + 2)) return true;
  if (distanceToPath(p, RIVER) < RIVER_WIDTH / 2 + 2) return true;
  if (Object.values(KINGDOMS).some((k) => Math.hypot(p[0] - k.base[0], p[1] - k.base[1]) < BASE_RADIUS + 4)) return true;
  return JUNGLE_CAMPS.some(([x, z]) => Math.hypot(p[0] - x, p[1] - z) < 9);
}

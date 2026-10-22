// Yetenekler (Q/W/E/R): sunucu kuralları ve istemcinin yetenek çubuğu bu tabloyu kullanır.
// kind: "target" hedefe vurur, "self" kendine etki eder, "dash" imlece atılır,
// "area" çevresindeki tüm düşmanlara vurur, "blink" hedefin arkasına ışınlanıp vurur.
export type AbilityKind = "target" | "self" | "dash" | "area" | "blink";
export interface Ability {
  name: string;
  kind: AbilityKind;
  cooldownMs: number;
  range: number;
  /** Normal saldırı hasarının katı. */
  power: number;
  /** "self": canın bu oranı kadar iyileşme. */
  heal?: number;
}

export const SLOTS = ["q", "w", "e", "r"] as const;
export type Slot = (typeof SLOTS)[number];

export const ABILITIES: Record<"warrior" | "shadow", Record<Slot, Ability>> = {
  warrior: {
    q: { name: "Yarma", kind: "target", cooldownMs: 5_000, range: 3.5, power: 2 },
    w: { name: "Savaş Narası", kind: "self", cooldownMs: 14_000, range: 0, power: 0, heal: 0.25 },
    e: { name: "Hücum", kind: "dash", cooldownMs: 9_000, range: 9, power: 1 },
    r: { name: "Yer Sarsıntısı", kind: "area", cooldownMs: 40_000, range: 6, power: 3 },
  },
  shadow: {
    q: { name: "Hançer Fırlat", kind: "target", cooldownMs: 4_000, range: 10, power: 1.5 },
    w: { name: "Gölge Örtüsü", kind: "self", cooldownMs: 15_000, range: 0, power: 0, heal: 0.15 },
    e: { name: "Gölge Adımı", kind: "blink", cooldownMs: 10_000, range: 9, power: 1.2 },
    r: { name: "Ölüm İzi", kind: "target", cooldownMs: 45_000, range: 4, power: 4.5 },
  },
};


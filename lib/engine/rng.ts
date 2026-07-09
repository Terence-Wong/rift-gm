/**
 * Seeded PRNG (mulberry32) plus distribution helpers.
 * The engine must never touch Math.random() — every match takes a seed
 * so results are reproducible for tests and replays.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Normal via Box–Muller. */
  normal(mean?: number, sd?: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform pick from a non-empty array. */
  pick<T>(items: T[]): T;
  /** Weighted pick; weights must be non-negative, not all zero. */
  weightedPick<T>(items: T[], weights: number[]): T;
  /** Poisson-distributed count (Knuth), lambda kept small in practice. */
  poisson(lambda: number): number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    normal(mean = 0, sd = 1) {
      // Box–Muller; guard u1 against 0 so log() stays finite.
      const u1 = Math.max(next(), 1e-12);
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + sd * z;
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    weightedPick(items, weights) {
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) return items[Math.floor(next() * items.length)];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    poisson(lambda) {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L && k < 50);
      return k - 1;
    },
  };
  return rng;
}

/** Derive a stable 32-bit seed from a string (FNV-1a). */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

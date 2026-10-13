export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Picks a value with probability proportional to its weight. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
}

/** Mulberry32: tiny, fast and fully deterministic for a given 32-bit seed. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    pick: (items) => {
      const item = items[int(0, items.length - 1)];
      if (item === undefined) {
        throw new Error('Cannot pick from an empty list');
      }
      return item;
    },
    weighted: (entries) => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) {
          return value;
        }
      }
      const last = entries.at(-1);
      if (!last) {
        throw new Error('Cannot pick from an empty list');
      }
      return last[0];
    },
  };
}

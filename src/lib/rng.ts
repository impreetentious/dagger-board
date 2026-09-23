/**
 * Deterministic random primitives used by the simulation engine. The raw
 * generator is the exact mulberry32 sequence pinned in §3.12.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const UINT32_RANGE = 0x1_0000_0000;

/** Maps a raw uint32 to the open interval (0, 1). */
export function uniformFromRaw(raw: number): number {
  return ((raw >>> 0) + 0.5) / UINT32_RANGE;
}

export function createUniformGenerator(seed: number): () => number {
  const raw = mulberry32(seed);
  return () => uniformFromRaw(raw());
}

export interface NormalPair {
  first: number;
  second: number;
}

/** Basic Box–Muller with the required cos, then sin, consumption order. */
export function boxMullerPair(uniform: () => number): NormalPair {
  const radius = Math.sqrt(-2 * Math.log(uniform()));
  const angle = 2 * Math.PI * uniform();
  return { first: radius * Math.cos(angle), second: radius * Math.sin(angle) };
}

export function createNormalPairGenerator(seed: number): () => NormalPair {
  const uniform = createUniformGenerator(seed);
  return () => boxMullerPair(uniform);
}

/**
 * Randomized edge magnitudes stay away from zero so a seeded demonstration
 * remains legible. The stream remains the caller's single global stream.
 */
export function randomizedCoefficient(uniform: () => number): number {
  const magnitude = 0.3 + uniform() * 0.6;
  return uniform() < 0.5 ? -magnitude : magnitude;
}

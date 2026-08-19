/**
 * The fixed toy projection used by the diversity / density explainer scenes.
 *
 * Deliberately synthetic rather than sampled from the live dataset: every
 * participant must see the same scene, and the high-vs-low contrast the
 * animation teaches has to be legible regardless of which dataset is loaded.
 * Generated once at module load from a fixed seed, then frozen.
 */

/** Layout box the toy points live in (SVG user units). */
export const SCENE_W = 340;
export const SCENE_H = 136;

/** Radius of the density scene's neighbourhood halo at full expansion. */
export const NEIGHBOURHOOD_RADIUS = 34;

export interface ToyPoint {
  x: number;
  y: number;
}

/** mulberry32 — small, fast, and deterministic across browsers. */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximate standard normal from three uniforms (fast, good enough here). */
function gaussian(rand: () => number): number {
  return (rand() + rand() + rand() - 1.5) * 0.82;
}

function buildPoints(): ToyPoint[] {
  const rand = seededRandom(7);
  const pts: ToyPoint[] = [];

  const blob = (cx: number, cy: number, sx: number, sy: number, n: number) => {
    for (let i = 0; i < n; i++) {
      pts.push({ x: cx + gaussian(rand) * sx, y: cy + gaussian(rand) * sy });
    }
  };

  // Three clusters of decreasing size, so "crowded" and "sparse" regions both
  // exist, plus a thin scatter so no area of the box reads as empty by accident.
  blob(72, 48, 20, 14, 26);
  blob(178, 104, 26, 17, 40);
  blob(268, 52, 15, 11, 16);
  for (let i = 0; i < 14; i++) {
    pts.push({ x: 20 + rand() * 300, y: 16 + rand() * 118 });
  }
  return pts;
}

export const TOY_POINTS: readonly ToyPoint[] = Object.freeze(buildPoints());

/**
 * The subset drawn as "already labelled". Taken from the first cluster so the
 * diversity scene has one obvious labelled neighbourhood to measure against.
 */
export const TOY_LABELLED: readonly ToyPoint[] = Object.freeze(
  Array.from({ length: 9 }, (_, i) => TOY_POINTS[i * 2]),
);

/** One keyframe of a two-beat scene: a candidate position plus its caption. */
export interface ToyCase {
  candidate: ToyPoint;
  caption: string;
  verdict: string;
}

export const DIVERSITY_CASES: readonly ToyCase[] = Object.freeze([
  {
    candidate: { x: 262, y: 118 },
    caption: "far from the clips you already labelled",
    verdict: "HIGH DIVERSITY: different to what you labelled",
  },
  {
    // Just outside the labelled cluster rather than inside it: sitting on top
    // of the cluster gives a ~6px measuring line that reads as no line at all,
    // which hides the mechanism precisely on the beat that teaches the
    // contrast. From here the line is short (~33px) but clearly drawn, against
    // the ~187px of the high-diversity beat.
    candidate: { x: 112, y: 74 },
    caption: "close to the clips you already labelled",
    verdict: "LOW DIVERSITY: similar to what you labelled",
  },
]);

export const DENSITY_CASES: readonly ToyCase[] = Object.freeze([
  {
    candidate: { x: 178, y: 104 },
    caption: "in a crowded region",
    verdict: "Lies in HIGH DENSITY: a common sound",
  },
  {
    // Sparse but not empty: 3 neighbours against the dense beat's 41. An
    // isolated spot reading "0 clips sound like this" is both a strange claim
    // and a weaker contrast than a small number — rare is the point, not unique.
    candidate: { x: 232, y: 112 },
    caption: "almost on its own",
    verdict: "Lies in LOW DENSITY: not a common sound",
  },
]);

/** Nearest point in `list` to `p`, with its distance. */
export function nearestTo(
  p: ToyPoint,
  list: readonly ToyPoint[],
): { point: ToyPoint; distance: number } {
  let best = Infinity;
  let point = list[0];
  for (const q of list) {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best) {
      best = d;
      point = q;
    }
  }
  return { point, distance: best };
}

/** How many toy points fall inside `radius` of `p` (the candidate excluded). */
export function countWithin(p: ToyPoint, radius: number): number {
  let n = 0;
  for (const q of TOY_POINTS) {
    if (Math.hypot(p.x - q.x, p.y - q.y) <= radius) n++;
  }
  return Math.max(0, n - 1);
}

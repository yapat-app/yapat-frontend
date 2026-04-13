/**
 * Dummy prediction data for AL ProjectionView preview.
 *
 * • DUMMY_PREDICTIONS — 120 fully-synthetic predictions (shown when no real
 *   inference has run yet).
 */

import type { PAMPrediction } from "../types/al";

// ── Deterministic PRNG (same seed → same layout every render) ────────────────
const mkRng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};

// ── Config ────────────────────────────────────────────────────────────────────

const SPECIES = [
  "Turdus merula",
  "Parus major",
  "Fringilla coelebs",
  "Sylvia atricapilla",
  "Erithacus rubecula",
  "Phylloscopus collybita",
];

const SOUND_TYPES = ["Bio", "Anthro", "Geo"] as const;

const BIRDNET_LABELS = [
  "Common Blackbird",
  "Great Tit",
  "Common Chaffinch",
  "Eurasian Blackcap",
  "European Robin",
  "Common Chiffchaff",
  "Unknown",
];

const YAMNET_LABELS = [
  "Bird vocalization",
  "Songbird",
  "Animal",
  "Wind",
  "Silence",
  "Noise",
];

const N = 120; // total dummy points

// ── Generator ─────────────────────────────────────────────────────────────────

export const DUMMY_PREDICTIONS: PAMPrediction[] = (() => {
  const rng = mkRng(0xdeadbeef);

  // Cluster centres in 2-D embedding space — one per species
  const centres: [number, number][] = SPECIES.map((_, i) => {
    const angle = (i / SPECIES.length) * 2 * Math.PI;
    return [Math.cos(angle) * 4, Math.sin(angle) * 4];
  });

  return Array.from({ length: N }, (_, i) => {
    const speciesIdx = i % SPECIES.length;
    const [cx, cy] = centres[speciesIdx];

    // 2-D embedding with Gaussian noise around cluster centre
    const x = cx + (rng() - 0.5) * 3.5;
    const y = cy + (rng() - 0.5) * 3.5;

    // Sampler scores — spread across [0, 1] realistically
    const uncertainty = parseFloat((rng() * 0.9 + 0.05).toFixed(3));
    // Diversity: high-uncertainty points tend to be diverse too, with noise
    const diversity  = parseFloat(Math.min(1, uncertainty * 0.7 + rng() * 0.4).toFixed(3));
    // Density: inverse of diversity (dense clusters → low uncertainty)
    const density    = parseFloat(Math.min(1, (1 - uncertainty) * 0.6 + rng() * 0.4).toFixed(3));
    // Composite: weighted blend
    const composite  = parseFloat(
      Math.min(1, (uncertainty * 0.5 + diversity * 0.3 + density * 0.2)).toFixed(3),
    );

    // Metadata
    const month = Math.floor(rng() * 12) + 1;          // 1–12
    const hour  = Math.floor(rng() * 24);               // 0–23
    const soundType = SOUND_TYPES[Math.floor(rng() * SOUND_TYPES.length)];
    const birdnetLabel = BIRDNET_LABELS[speciesIdx % BIRDNET_LABELS.length];
    const yamnetLabel  = YAMNET_LABELS[Math.floor(rng() * YAMNET_LABELS.length)];

    return {
      id: 9000 + i,
      model_checkpoint_id: 0,
      snippet_id: 9000 + i,
      predicted_label: SPECIES[speciesIdx],
      predicted_labels: [SPECIES[speciesIdx]],
      predicted_probabilities: { [SPECIES[speciesIdx]]: uncertainty },
      uncertainty,
      diversity,
      density,
      composite_score: composite,
      confidence: uncertainty,         // reuse uncertainty as confidence proxy
      ranking_score: composite,
      created_at: new Date().toISOString(),
      embedding_2d: [x, y],
      scores: {
        uncertainty,
        diversity,
        density,
        composite,
        year_cycle: month,
        day_cycle:  hour,
        sound_type: soundType,
        birdnet_label: birdnetLabel,
        yamnet_label:  yamnetLabel,
      },
    } satisfies PAMPrediction;
  });
})();

// ── Dev-score enrichment for real predictions ─────────────────────────────────

/**
 * Returns a new array where any prediction missing `scores` gets a
 * deterministic synthetic score object seeded on its snippet_id.
 *
 * Predictions that already carry real scores are returned unchanged.
 * Safe to call on every render — same snippet_id always → same scores.
 */
export function enrichWithDevScores(predictions: PAMPrediction[]): PAMPrediction[] {
  return predictions.map((p) => {
    if (p.scores) return p; // real scores present — leave untouched

    // Seed the PRNG per snippet_id so scores are stable across re-renders
    const rng = mkRng((p.snippet_id * 2654435761) >>> 0);

    const uncertainty = parseFloat((rng() * 0.9 + 0.05).toFixed(3));
    const diversity   = parseFloat(Math.min(1, uncertainty * 0.7 + rng() * 0.4).toFixed(3));
    const density     = parseFloat(Math.min(1, (1 - uncertainty) * 0.6 + rng() * 0.4).toFixed(3));
    const composite   = parseFloat(
      Math.min(1, uncertainty * 0.5 + diversity * 0.3 + density * 0.2).toFixed(3),
    );

    return {
      ...p,
      scores: {
        uncertainty,
        diversity,
        density,
        composite,
        year_cycle:    Math.floor(rng() * 12) + 1,
        day_cycle:     Math.floor(rng() * 24),
        sound_type:    SOUND_TYPES[Math.floor(rng() * SOUND_TYPES.length)],
        birdnet_label: BIRDNET_LABELS[Math.floor(rng() * BIRDNET_LABELS.length)],
        yamnet_label:  YAMNET_LABELS[Math.floor(rng() * YAMNET_LABELS.length)],
      },
    };
  });
}

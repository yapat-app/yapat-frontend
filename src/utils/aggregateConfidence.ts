/**
 * Noisy-OR aggregate confidence (mirrors backend aggregate_confidence).
 * P(at least one label in scope) = 1 - prod(1 - p(label)).
 * Empty scope falls back to max(predicted_probabilities).
 */
export function aggregateConfidence(
  predictedProbabilities: Record<string, number> | null | undefined,
  labelScope?: string[] | null,
): number {
  const probs = predictedProbabilities ?? {};
  const values = Object.values(probs);
  if (!labelScope?.length) {
    return values.length > 0 ? Math.max(...values) : 0;
  }
  let product = 1;
  for (const label of labelScope) {
    const p = probs[label] ?? 0;
    product *= 1 - p;
  }
  return 1 - product;
}

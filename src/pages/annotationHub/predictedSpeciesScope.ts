import type { PAMPrediction } from "../../types/al";

/**
 * Model-side species scope (the "Model derived scores" species picker).
 *
 * Mirrors the backend's `aggregate_confidence` so the number rendered here is
 * the same one `get-or-create` would return for the equivalent `label_scope` —
 * but computed locally from `predicted_probabilities`, which the backend
 * already ships on every prediction row. That keeps this filter free of any
 * inference call.
 *
 * NOTE: only confidence is species-dependent. uncertainty / diversity /
 * density / composite are per-snippet aggregates on `al_predictions` and are
 * deliberately left untouched — selecting a species changes which snippets are
 * in scope (so their histograms do move), never how those scores are computed.
 */

/** Noisy-OR over the scope: 1 - Π(1 - pᵢ). One species reduces to p. */
export function aggregateConfidence(
  probabilities: Record<string, number> | null | undefined,
  scope: string[],
): number | undefined {
  if (!probabilities || scope.length === 0) return undefined;
  let inverse = 1;
  let sawAny = false;
  for (const species of scope) {
    const p = probabilities[species];
    if (typeof p !== "number" || !Number.isFinite(p)) continue;
    sawAny = true;
    inverse *= 1 - Math.min(Math.max(p, 0), 1);
  }
  if (!sawAny) return undefined;
  return 1 - inverse;
}

/**
 * True when the model actually predicts one of the scoped species for this row.
 *
 * Matches on `predicted_labels` ONLY — the model's thresholded multi-label
 * output — which is the same rule the projection uses, so the feed and the FPV
 * always describe the same set.
 *
 * Deliberately does NOT fall back to `predicted_probabilities`: that map is
 * dense over every trained species, so "has a probability for X" is true for
 * essentially every snippet and would match the whole dataset. A snippet with
 * an empty `predicted_labels` is one the model did not confidently predict as
 * anything, and is correctly excluded.
 */
function matchesScope(p: PAMPrediction, scope: Set<string>): boolean {
  const labels = p.predicted_labels;
  if (!labels || labels.length === 0) return false;
  return labels.some((l) => scope.has(l));
}

/**
 * Narrow to snippets the model predicts as one of `scope`, and rescope each
 * row's confidence to that species set. Returns the input untouched when the
 * scope is empty, so the no-selection path costs nothing.
 */
export function applyPredictedSpeciesScope(
  predictions: PAMPrediction[],
  scope: string[],
): PAMPrediction[] {
  if (scope.length === 0) return predictions;
  const scopeSet = new Set(scope);
  const result: PAMPrediction[] = [];
  for (const p of predictions) {
    if (!matchesScope(p, scopeSet)) continue;
    // Rows that predate the probabilities field (restored feeds) keep the
    // server's confidence rather than silently reading as 0.
    const scoped = aggregateConfidence(p.predicted_probabilities, scope);
    if (scoped === undefined) {
      result.push(p);
      continue;
    }
    result.push({
      ...p,
      confidence: scoped,
      scores: { ...(p.scores ?? {}), confidence: scoped },
    });
  }
  return result;
}

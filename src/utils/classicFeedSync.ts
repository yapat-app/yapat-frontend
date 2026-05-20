/**
 * Map classic snippet feeds into PAM-shaped state so PredictionFeed / ProjectionView
 * can render the same UI as Active Learning (P1.2 blind scroll feed).
 */

import type { Snippet, Annotation } from "../types";
import type {
  FeedbackAction,
  FeedbackResponse,
  PAMPrediction,
  SampleScores,
} from "../types/al";

/** Classic feeds have no PAM sampler scores; use an empty scores object so UI checks pass. */
const CLASSIC_BASE_SCORES: SampleScores = {};

export function snippetsToPredictions(snippets: Snippet[]): PAMPrediction[] {
  return snippets.map((s) => ({
    id: null,
    model_checkpoint_id: null,
    snippet_id: s.id,
    predicted_labels: null,
    predicted_probabilities: null,
    uncertainty: null,
    diversity: null,
    density: null,
    composite_score: null,
    predicted_label: null,
    confidence: null,
    ranking_score: null,
    created_at: null,
    scores: { ...CLASSIC_BASE_SCORES },
  }));
}

/** Merge annotation / classic-feedback labels into prediction scores for projection coloring. */
export function applyClassicLabelScores(
  predictions: PAMPrediction[],
  feedbacks: Record<number, FeedbackResponse>,
): PAMPrediction[] {
  return predictions.map((p) => {
    const labels = feedbacks[p.snippet_id]?.final_labels ?? [];
    if (labels.length === 0) {
      return { ...p, scores: { ...(p.scores ?? CLASSIC_BASE_SCORES) } };
    }
    return {
      ...p,
      scores: {
        ...(p.scores ?? CLASSIC_BASE_SCORES),
        actual_label: labels[0],
      },
    };
  });
}

export function annotationsToClassicFeedbacks(
  snippets: Snippet[],
  annotationRows: Annotation[][],
): Record<number, FeedbackResponse> {
  const feedbacks: Record<number, FeedbackResponse> = {};
  snippets.forEach((snippet, index) => {
    const anns = annotationRows[index] ?? [];
    if (anns.length === 0) return;
    const labels = anns
      .map((a) => a.resolved_name_snapshot?.trim())
      .filter((name): name is string => Boolean(name));
    if (labels.length === 0) return;
    feedbacks[snippet.id] = buildClassicFeedback(snippet.id, "MODIFY", labels);
  });
  return feedbacks;
}

/** Group flat annotation list into the same order as `snippets` for `annotationsToClassicFeedbacks`. */
export function annotationRowsAlignedToSnippets(
  snippets: Snippet[],
  annotations: Annotation[],
): Annotation[][] {
  const byId = new Map<number, Annotation[]>();
  for (const a of annotations) {
    const list = byId.get(a.snippet_id);
    if (list) list.push(a);
    else byId.set(a.snippet_id, [a]);
  }
  return snippets.map((s) => byId.get(s.id) ?? []);
}

export function buildClassicFeedback(
  snippetId: number,
  action: FeedbackAction,
  labels: string[],
): FeedbackResponse {
  return {
    id: 0,
    model_family_name: "classic",
    model_checkpoint_id: 0,
    snippet_id: snippetId,
    action,
    final_labels: labels.length > 0 ? labels : null,
    notes: null,
    created_at: new Date().toISOString(),
    feedback_count_since_retrain: 0,
    retrain_triggered: false,
  };
}

/**
 * Map classic snippet feeds into PAM-shaped state so PredictionFeed / ProjectionView
 * can render the same UI as Active Learning (P1.2 blind scroll feed).
 */

import type { Snippet, Annotation } from "../types";
import type { FeedbackAction, FeedbackResponse, PAMPrediction } from "../types/al";

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
  }));
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

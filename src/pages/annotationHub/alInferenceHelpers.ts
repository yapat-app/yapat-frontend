import type { PAMRunInferenceRequest, PAMSuggestionMode } from "../../types/al";
import type { PhaseConfig } from "../../studyPhases/types";

/**
 * The Annotation Hub no longer downloads the full prediction set: the feed,
 * histograms and projection are served page-by-page by /api/explore. An
 * inference call only has to make sure predictions exist for the active
 * checkpoint (and report which checkpoint that is), so it asks for a small,
 * SQL-ranked top-K instead of every row.
 */
export const EXPLORE_BOOTSTRAP_K = 20;

export function exploreBootstrapParams(): Pick<
  PAMRunInferenceRequest,
  "sample_suggestion" | "suggestion_strategy" | "k"
> {
  return {
    sample_suggestion: true,
    suggestion_strategy: "composite",
    k: EXPLORE_BOOTSTRAP_K,
  };
}

export function buildInferenceSuggestionParams(
  phase: PhaseConfig,
  topKOnly: boolean,
  k: number,
  samplingMethod: string,
  extras?: {
    labelScope?: string[];
    minConfidence?: number | null;
  },
): Pick<
  PAMRunInferenceRequest,
  "sample_suggestion" | "suggestion_strategy" | "k" | "label_scope" | "min_confidence"
> {
  const feedSupportsSuggestions =
    phase.feed.mode !== "single_card_on_select" && phase.feed.mode !== "hidden";
  if (!topKOnly || !feedSupportsSuggestions) {
    return exploreBootstrapParams();
  }
  const strategy = (phase.feed.samplingStrategy ??
    samplingMethod) as PAMRunInferenceRequest["suggestion_strategy"];
  const params: Pick<
    PAMRunInferenceRequest,
    "sample_suggestion" | "suggestion_strategy" | "k" | "label_scope" | "min_confidence"
  > = {
    sample_suggestion: true,
    suggestion_strategy: strategy,
    k: phase.feed.topK ?? k,
  };
  if (strategy === "confidence" && extras?.labelScope?.length) {
    params.label_scope = extras.labelScope;
  }
  if (extras?.minConfidence != null && extras.minConfidence > 0) {
    params.min_confidence = extras.minConfidence;
  }
  return params;
}

/** Validate mode: top-K snippets ranked by noisy-OR confidence over label_scope. */
export function buildValidateInferenceParams(
  k: number,
  labelScope?: string[],
  minConfidence?: number | null,
): Pick<
  PAMRunInferenceRequest,
  "sample_suggestion" | "suggestion_strategy" | "k" | "label_scope" | "min_confidence"
> {
  const params: Pick<
    PAMRunInferenceRequest,
    "sample_suggestion" | "suggestion_strategy" | "k" | "label_scope" | "min_confidence"
  > = {
    sample_suggestion: true,
    suggestion_strategy: "confidence",
    k,
  };
  if (labelScope?.length) {
    params.label_scope = labelScope;
  }
  if (minConfidence != null && minConfidence > 0) {
    params.min_confidence = minConfidence;
  }
  return params;
}

export function isSuggestionsMode(modelInfo: Record<string, unknown>): boolean {
  return (modelInfo.mode as PAMSuggestionMode | undefined) === "suggestions";
}

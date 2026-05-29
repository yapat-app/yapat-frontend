import type { PAMRunInferenceRequest, PAMSuggestionMode } from "../../types/al";
import type { PhaseConfig } from "../../studyPhases/types";

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
    return { sample_suggestion: false };
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

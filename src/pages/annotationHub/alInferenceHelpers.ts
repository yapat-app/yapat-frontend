import type { PAMRunInferenceRequest, PAMSuggestionMode } from "../../types/al";
import type { PhaseConfig } from "../../studyPhases/types";

export function buildInferenceSuggestionParams(
  phase: PhaseConfig,
  topKOnly: boolean,
  k: number,
  samplingMethod: string,
): Pick<PAMRunInferenceRequest, "sample_suggestion" | "suggestion_strategy" | "k"> {
  const feedSupportsSuggestions =
    phase.feed.mode !== "single_card_on_select" && phase.feed.mode !== "hidden";
  if (!topKOnly || !feedSupportsSuggestions) {
    return { sample_suggestion: false };
  }
  return {
    sample_suggestion: true,
    suggestion_strategy: (phase.feed.samplingStrategy ?? samplingMethod) as PAMRunInferenceRequest["suggestion_strategy"],
    k: phase.feed.topK ?? k,
  };
}

export function isSuggestionsMode(modelInfo: Record<string, unknown>): boolean {
  return (modelInfo.mode as PAMSuggestionMode | undefined) === "suggestions";
}

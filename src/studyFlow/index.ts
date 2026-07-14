/**
 * Study flow — guided per-phase participant experience.
 * See docs/superpowers/specs/2026-06-12-study-flow-design.md.
 */

export { StudyFlowProvider } from "./StudyFlowProvider";
export { useStudyFlow } from "./useStudyFlow";
export { isFlowEnabled, phaseSequence } from "./flowConfig";
export { PhaseTimer } from "./components/PhaseTimer";
export { StudyFlowOverlays } from "./components/StudyFlowOverlays";
export type { FlowStage } from "./types";

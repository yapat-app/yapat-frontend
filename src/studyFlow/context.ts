import { createContext } from "react";
import type { FlowStage, TourStepSpec } from "./types";

export interface StudyFlowContextValue {
  /** Whether the guided flow is active at all. When false, everything is inert. */
  enabled: boolean;
  /** Current lifecycle stage for the active phase. */
  stage: FlowStage;
  /** True while the guided tour is running — interactive actions should be disabled. */
  isTourActive: boolean;
  /** Active phase id. */
  phaseId: string;
  /** Tour steps to show this phase (already filtered to unseen featureKeys). */
  pendingTourSteps: TourStepSpec[];
  /** Remaining annotation time in ms (0 when not running). */
  remainingMs: number;
  /** Total per-phase budget in ms. */
  durationMs: number;
  /** Index of the active phase within the sequence, and total count. */
  sequenceIndex: number;
  sequenceLength: number;
  /** Human label of the phase that comes next (null on the last phase). */
  nextPhaseId: string | null;

  /** Instructions "Begin" → advance to tour (or straight to running). */
  beginPhase: () => void;
  /** Tour finished or skipped → start the countdown. */
  finishTour: () => void;
  jumpToPhase: (id: string) => void;
}

export const StudyFlowContext = createContext<StudyFlowContextValue>({
  enabled: false,
  stage: "running",
  isTourActive: false,
  phaseId: "",
  pendingTourSteps: [],
  remainingMs: 0,
  durationMs: 0,
  sequenceIndex: 0,
  sequenceLength: 0,
  nextPhaseId: null,
  beginPhase: () => {},
  finishTour: () => {},
  jumpToPhase: () => {},
});

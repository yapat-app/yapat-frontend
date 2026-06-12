/**
 * Study-flow types — the per-phase lifecycle state machine.
 */

/** Lifecycle stage a participant is in for the *current* phase. */
export type FlowStage =
  /** Instructions modal is up; waiting for "Begin". */
  | "instructions"
  /** Guided tour running over the live UI. */
  | "tour"
  /** Countdown active; participant is annotating. */
  | "running"
  /** Brief interstitial between phases (just after the timer expires). */
  | "transition"
  /** Final screen after the last phase. */
  | "complete";

/** Per-phase persisted progress. */
export interface PhaseProgress {
  stage: FlowStage;
  /** Epoch ms when the countdown started; null until the running stage. */
  startedAt: number | null;
}

/** Everything we persist so a reload resumes exactly where the participant left off. */
export interface StudyFlowState {
  /** Progress keyed by phase id. */
  phases: Record<string, PhaseProgress>;
  /** Tour featureKeys already shown in any earlier phase (incremental tour). */
  seenTourKeys: string[];
}

/** A single guided-tour step, authored per phase in phaseContent.ts. */
export interface TourStepSpec {
  /** Stable identity for incremental dedup across phases. */
  featureKey: string;
  /** `data-tour` attribute value of the element to highlight. */
  target: string;
  title: string;
  description: string;
  placement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "center"
    | "topLeft"
    | "topRight"
    | "bottomLeft"
    | "bottomRight"
    | "leftTop"
    | "leftBottom"
    | "rightTop"
    | "rightBottom";
}

/** Per-phase authored content: the intro modal + ordered tour steps. */
export interface PhaseContent {
  /** Modal title. */
  title: string;
  /** Short paragraphs shown in the instructions modal. */
  body: string[];
  /** Ordered tour steps; only those with unseen featureKeys are shown. */
  tour: TourStepSpec[];
}

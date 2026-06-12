/**
 * Persistence for the study flow. One browser == one participant, so localStorage
 * is the participant's progress record. A reload reads this back and resumes the
 * same stage and remaining time.
 */

import type { StudyFlowState } from "./types";

const STORAGE_KEY = "yapat_study_flow_v1";

const EMPTY: StudyFlowState = { phases: {}, seenTourKeys: [] };

export function loadFlowState(): StudyFlowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<StudyFlowState>;
    return {
      phases: parsed.phases ?? {},
      seenTourKeys: parsed.seenTourKeys ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveFlowState(state: StudyFlowState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be disabled (private mode) — flow still works in-memory.
  }
}

/** Operator/dev escape hatch: wipe all flow progress (used by ?study_reset=1). */
export function clearFlowState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Also drop the sticky phase so a reset returns to the first phase.
    localStorage.removeItem("yapat_study_phase");
  } catch {
    // ignore
  }
}

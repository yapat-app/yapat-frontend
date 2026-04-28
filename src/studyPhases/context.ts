import { createContext } from "react";
import { DEFAULT_PHASE_ID, getPhaseConfig } from "./phases";
import type { PhaseConfig } from "./types";

export interface PhaseContextValue {
  phase: PhaseConfig;
  phaseId: string;
  setPhase: (id: string) => void;
}

export const PhaseContext = createContext<PhaseContextValue>({
  phase: getPhaseConfig(DEFAULT_PHASE_ID),
  phaseId: DEFAULT_PHASE_ID,
  setPhase: () => {},
});
